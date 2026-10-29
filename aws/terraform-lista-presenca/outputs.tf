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

output "offline_lambda_origin_domain" {
  description = "Usar em scripts/cloudfront-lista-presenca-behaviors.sh --lambda-domain"
  value       = trimsuffix(trimprefix(aws_lambda_function_url.offline.function_url, "https://"), "/")
}

output "offline_lambda_oac_id" {
  description = "Usar em scripts/cloudfront-lista-presenca-behaviors.sh --lambda-oac-id"
  value       = aws_cloudfront_origin_access_control.offline_lambda.id
}

output "attendance_buffer_table" {
  value = aws_dynamodb_table.attendance_buffer.name
}
