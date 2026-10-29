terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Estado local (terraform.tfstate fica fora do git via .gitignore).
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Trava de segurança: só aplica na conta da distribuição pg.skillia.click
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = "pequenos-grupos"
      Component = "lista-presenca"
      ManagedBy = "terraform"
    }
  }
}
