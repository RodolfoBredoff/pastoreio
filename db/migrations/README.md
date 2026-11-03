# Migrations do banco

As migrations são aplicadas automaticamente no deploy por `scripts/ec2-deploy-migrate.sh`.
O script registra cada arquivo na tabela `schema_migrations` e **nunca reexecuta** uma
migration já registrada.

## Criar uma migration nova

1. Crie `db/migrations/NNN_descricao.sql`, com o próximo número (a última é a de maior número).
   O nome precisa seguir `NNN_letras_numeros_ou_underscore.sql`.
2. Escreva SQL que possa rodar em uma transação (sem `BEGIN`/`COMMIT` próprios e sem
   `CREATE INDEX CONCURRENTLY`). O script já envolve cada migration em uma transação:
   se algo falhar, nada é gravado e o deploy para.
3. Prefira `IF NOT EXISTS`/`IF EXISTS`: facilita rodar o mesmo SQL à mão em outro ambiente.
4. Faça commit e push. O deploy aplica só as migrations novas.

## Regras

- **Não edite uma migration que já foi aplicada.** O script não a reexecuta, então a
  edição não teria efeito em produção. Se detectar a diferença, ele só avisa. Crie uma
  migration nova com a correção.
- **`UPDATE`/`DELETE` em dados exigem cuidado extra.** Uma migration só roda uma vez, mas
  confira a condição com dados reais antes: o que parece "limpeza" pode apagar registros
  legítimos. Se for destrutiva, faça um backup antes (`systemctl start pastoreio-db-backup.service`).
- Se uma migration falhar no deploy, a transação é revertida e as seguintes não rodam.
  Corrija com uma nova migration (ou ajuste o arquivo, se ele nunca chegou a ser aplicado)
  e faça um novo deploy.

## Ver o que está pendente (não grava nada)

```bash
cd /opt/pequenos-grupos && bash scripts/ec2-deploy-migrate.sh --dry-run
```

## Como o controle começou

A tabela `schema_migrations` foi criada em novembro/2026. Na primeira execução em um banco
que já existia, o script registrou as migrations de `001` a `033` como aplicadas **sem
executá-las** (`baseline = true`), porque várias delas não são seguras para repetir
(a `004` altera datas de nascimento e a `017` apaga presenças). Só as migrations com número
maior que `033` passam por execução. Em um banco vazio, o script cria a tabela e aplica todas
as migrations, na ordem.

O script recusa a baseline se o banco existente não estiver na versão da `033`
(sem a tabela `payment_receipts`), para nunca registrar como aplicado algo que não foi.
