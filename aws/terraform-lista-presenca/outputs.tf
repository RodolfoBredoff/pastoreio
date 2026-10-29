output "rewrite_function_arn" {
  description = "Usar em scripts/cloudfront-lista-presenca-behaviors.sh --function-arn"
  value       = aws_cloudfront_function.lista_presenca_rewrite.arn
}

output "static_site_objects" {
  value = sort([for o in aws_s3_object.site : o.key])
}

output "test_url" {
  value = "https://pg.skillia.click/${var.static_site_prefix}/<slug>"
}
