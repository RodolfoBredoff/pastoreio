#!/usr/bin/env bash
# =============================================================================
# cloudfront-lista-presenca-behaviors.sh
#
# Acrescenta à distribuição CloudFront EXISTENTE (criada pelo console) os
# roteamentos da lista de presença estática. Não altera nenhum roteamento,
# origin ou configuração que já exista. Ver docs/DESIGN_LISTA_PRESENCA_OFFLINE.md.
#
# Estágios:
#   test    -> /snapshots/*          → S3 (JSON do snapshot)
#              /lista-presenca-app/* → S3 + CloudFront Function (página de teste)
#   public  -> test + /lista-presenca/* → S3 + Function (troca o link real)
#   rollback-public -> remove só /lista-presenca/* (volta o link para a EC2)
#
# Padrão é DRY-RUN (só mostra o diff). Para alterar, passe --apply.
#
# Uso:
#   ./scripts/cloudfront-lista-presenca-behaviors.sh --stage test \
#     --function-arn "$(terraform -chdir=aws/terraform-lista-presenca output -raw rewrite_function_arn)"
#   ... --apply
# =============================================================================
set -euo pipefail

PROFILE="pastoreio"
DISTRIBUTION_ID="E18FIBR7JAH4S0"
S3_ORIGIN_ID="S3-pastoreio"
FUNCTION_ARN=""
STAGE=""
APPLY=false
BACKUP_DIR="${HOME}/.pastoreio/cloudfront-backups"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)          PROFILE="$2"; shift 2 ;;
    --distribution-id)  DISTRIBUTION_ID="$2"; shift 2 ;;
    --s3-origin-id)     S3_ORIGIN_ID="$2"; shift 2 ;;
    --function-arn)     FUNCTION_ARN="$2"; shift 2 ;;
    --stage)            STAGE="$2"; shift 2 ;;
    --apply)            APPLY=true; shift ;;
    -h|--help)          sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

case "$STAGE" in
  test|public|rollback-public) ;;
  *) echo "Informe --stage test | public | rollback-public" >&2; exit 1 ;;
esac
if [[ "$STAGE" != "rollback-public" && -z "$FUNCTION_ARN" ]]; then
  echo "Informe --function-arn (saída rewrite_function_arn do Terraform)" >&2; exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "Distribuição : $DISTRIBUTION_ID (perfil $PROFILE)"
echo "Estágio      : $STAGE"
echo "Modo         : $([[ $APPLY == true ]] && echo APPLY || echo DRY-RUN)"
echo

aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --profile "$PROFILE" \
  --output json > "$WORK/current.json"

STAGE="$STAGE" FUNCTION_ARN="$FUNCTION_ARN" S3_ORIGIN_ID="$S3_ORIGIN_ID" \
python3 - "$WORK/current.json" "$WORK/new-config.json" <<'PY'
import copy, difflib, json, os, sys

src, dst = sys.argv[1], sys.argv[2]
stage = os.environ["STAGE"]; fn_arn = os.environ["FUNCTION_ARN"]; origin_id = os.environ["S3_ORIGIN_ID"]

doc = json.load(open(src))
cfg = doc["DistributionConfig"]
before = copy.deepcopy(cfg)

if origin_id not in [o["Id"] for o in cfg["Origins"]["Items"]]:
    sys.exit(f"ERRO: origin '{origin_id}' não existe na distribuição")

cb = cfg.setdefault("CacheBehaviors", {"Quantity": 0, "Items": []})
items = cb.get("Items") or []

# Modelo: o roteamento S3 que já funciona (/invite-covers/*), mesmo cache policy e OAC
template = next((b for b in items if b["TargetOriginId"] == origin_id), None)
if template is None:
    sys.exit(f"ERRO: nenhum roteamento existente usa o origin '{origin_id}' para servir de modelo")

def behavior(path, with_function):
    b = copy.deepcopy(template)
    b["PathPattern"] = path
    b["TargetOriginId"] = origin_id
    b["AllowedMethods"] = {"Quantity": 2, "Items": ["HEAD", "GET"],
                           "CachedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"]}}
    b["ViewerProtocolPolicy"] = "redirect-to-https"
    b["Compress"] = True
    b["LambdaFunctionAssociations"] = {"Quantity": 0}
    b["FunctionAssociations"] = (
        {"Quantity": 1, "Items": [{"FunctionARN": fn_arn, "EventType": "viewer-request"}]}
        if with_function else {"Quantity": 0}
    )
    return b

managed = {"/snapshots/*", "/lista-presenca-app/*", "/lista-presenca/*"}
desired = {}
if stage in ("test", "public"):
    desired["/snapshots/*"] = behavior("/snapshots/*", False)
    desired["/lista-presenca-app/*"] = behavior("/lista-presenca-app/*", True)
if stage == "public":
    desired["/lista-presenca/*"] = behavior("/lista-presenca/*", True)

new_items = []
for b in items:
    p = b["PathPattern"]
    if p in desired:
        new_items.append(desired.pop(p))          # atualiza o nosso, se já existir
    elif stage == "rollback-public" and p == "/lista-presenca/*":
        continue                                  # remove só o roteamento do link real
    else:
        new_items.append(b)                       # mantém intacto tudo que não é nosso
new_items.extend(desired.values())

cfg["CacheBehaviors"] = {"Quantity": len(new_items), "Items": new_items} if new_items else {"Quantity": 0}

# Garantia: nada fora dos nossos roteamentos mudou
untouched = lambda c: {k: v for k, v in c.items() if k != "CacheBehaviors"}
assert untouched(before) == untouched(cfg), "alteração inesperada fora dos roteamentos"
ours = lambda c: [b for b in (c.get("CacheBehaviors", {}).get("Items") or []) if b["PathPattern"] not in managed]
assert ours(before) == ours(cfg), "alteração inesperada em roteamento existente"

json.dump(cfg, open(dst, "w"), indent=2, sort_keys=True)

def summary(c):
    return [f'{b["PathPattern"]:24} -> {b["TargetOriginId"]}'
            + (" + function" if b.get("FunctionAssociations", {}).get("Quantity") else "")
            for b in (c.get("CacheBehaviors", {}).get("Items") or [])]
print("Roteamentos ANTES:");  [print("  ", s) for s in summary(before)]
print("Roteamentos DEPOIS:"); [print("  ", s) for s in summary(cfg)]
print()
diff = list(difflib.unified_diff(
    json.dumps(before, indent=2, sort_keys=True).splitlines(),
    json.dumps(cfg, indent=2, sort_keys=True).splitlines(),
    "atual", "proposta", lineterm="", n=2))
print("\n".join(diff) if diff else "Sem mudanças: a distribuição já está nesse estado.")
open(dst + ".changed", "w").write("1" if diff else "0")
PY

if [[ "$(cat "$WORK/new-config.json.changed")" == "0" ]]; then
  exit 0
fi

if [[ "$APPLY" != true ]]; then
  echo
  echo "DRY-RUN: nada foi alterado. Repita com --apply para aplicar."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/${DISTRIBUTION_ID}-$(date +%Y%m%d-%H%M%S).json"
python3 -c "import json,sys;json.dump(json.load(open(sys.argv[1]))['DistributionConfig'],open(sys.argv[2],'w'),indent=2)" \
  "$WORK/current.json" "$BACKUP"
ETAG=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['ETag'])" "$WORK/current.json")

echo
echo "Backup da configuração atual: $BACKUP"
# --if-match: falha se a distribuição mudou desde a leitura (ex.: update-origin.sh no boot)
NEW_ETAG=$(aws cloudfront update-distribution --id "$DISTRIBUTION_ID" --profile "$PROFILE" \
  --if-match "$ETAG" --distribution-config "file://$WORK/new-config.json" \
  --output text --query "ETag")

echo "Aplicado. A propagação no CloudFront leva alguns minutos."
echo "Acompanhar: aws cloudfront get-distribution --id $DISTRIBUTION_ID --profile $PROFILE --query Distribution.Status"
echo
echo "Para desfazer e voltar exatamente à configuração anterior:"
echo "  aws cloudfront update-distribution --id $DISTRIBUTION_ID --profile $PROFILE \\"
echo "    --if-match $NEW_ETAG --distribution-config file://$BACKUP"
