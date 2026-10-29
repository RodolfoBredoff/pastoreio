# Recursos NOVOS da lista de presença independente da EC2.
# Nada criado pelo console (distribuição, bucket, policy, OAC) é gerenciado aqui.
# Os roteamentos (behaviors) na distribuição existente são adicionados por
# scripts/cloudfront-lista-presenca-behaviors.sh.

# ---------------------------------------------------------------------------
# CloudFront Function: reescreve a URL da página para o index.html estático
# ---------------------------------------------------------------------------
resource "aws_cloudfront_function" "lista_presenca_rewrite" {
  name    = "pastoreio-lista-presenca-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Reescreve /lista-presenca/<slug> para a pagina estatica no S3"
  publish = true
  code    = file("${path.module}/functions/lista-presenca-rewrite.js")
}

# ---------------------------------------------------------------------------
# Página estática no bucket existente (prefixo lista-presenca-app/)
# ---------------------------------------------------------------------------
locals {
  site_files = fileset(var.static_dist_dir, "**")

  content_types = {
    html  = "text/html; charset=utf-8"
    js    = "text/javascript; charset=utf-8"
    css   = "text/css; charset=utf-8"
    svg   = "image/svg+xml"
    png   = "image/png"
    ico   = "image/x-icon"
    json  = "application/json; charset=utf-8"
    woff2 = "font/woff2"
  }
}

# Impede publicar (ou apagar a página) sem ter rodado o build antes:
# com o dist vazio, o fileset seria vazio e o Terraform removeria os objetos.
resource "terraform_data" "dist_guard" {
  input = length(local.site_files)

  lifecycle {
    precondition {
      condition     = fileexists("${var.static_dist_dir}/index.html")
      error_message = "Build estático não encontrado. Rode: npm run build:lista-presenca"
    }
  }
}

resource "aws_s3_object" "site" {
  for_each = local.site_files

  bucket       = var.bucket_name
  key          = "${var.static_site_prefix}/${each.value}"
  source       = "${var.static_dist_dir}/${each.value}"
  etag         = filemd5("${var.static_dist_dir}/${each.value}")
  content_type = lookup(local.content_types, lower(reverse(split(".", each.value))[0]), "application/octet-stream")

  # index.html sempre revalidado; assets com hash no nome são imutáveis
  cache_control = (
    each.value == "index.html" ? "no-cache" :
    startswith(each.value, "assets/") ? "public, max-age=31536000, immutable" :
    "public, max-age=86400"
  )

  depends_on = [terraform_data.dist_guard]
}
