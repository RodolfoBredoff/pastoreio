variable "aws_profile" {
  description = "Perfil da AWS CLI (SSO) usado para aplicar"
  type        = string
  default     = "pastoreio"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_account_id" {
  description = "Conta onde estão o bucket e a distribuição CloudFront"
  type        = string
  default     = "697697503238"
}

variable "bucket_name" {
  description = "Bucket existente (gerenciado pelo console; aqui só recebe objetos)"
  type        = string
  default     = "pequenos-grupos-bucket"
}

variable "static_site_prefix" {
  description = "Prefixo no bucket onde a página estática é publicada"
  type        = string
  default     = "lista-presenca-app"
}

variable "static_dist_dir" {
  description = "Saída do build estático (npm run build:lista-presenca)"
  type        = string
  default     = "../../apps/lista-presenca-static/dist"
}

variable "distribution_id" {
  description = "Distribuição CloudFront existente do pg.skillia.click (não gerenciada aqui)"
  type        = string
  default     = "E18FIBR7JAH4S0"
}

variable "ec2_role_name" {
  description = "Role existente da EC2 do app; recebe só o anexo da policy de sync do buffer"
  type        = string
  default     = "pequenos-grupos-ec2-role"
}

variable "buffer_read_capacity" {
  description = "RCU da tabela de buffer (nível gratuito: 25 por conta)"
  type        = number
  default     = 5
}

variable "buffer_write_capacity" {
  description = "WCU da tabela de buffer (nível gratuito: 25 por conta)"
  type        = number
  default     = 5
}
