# Etapa 2: confirmações com a EC2 desligada.
# Página estática → CloudFront (/offline-api/*) → Lambda Function URL (OAC) → DynamoDB.
# A EC2, quando liga, drena o DynamoDB para o Postgres (POST /api/cron/sync-attendance-buffer).
#
# Custo: tabela em capacidade provisionada dentro do nível gratuito permanente
# (25 RCU/25 WCU por conta), Lambda dentro do nível gratuito (1M execuções/mês),
# Function URL sem custo próprio, logs com retenção curta.

locals {
  offline_name     = "pastoreio-lista-presenca-offline"
  lambda_bundle    = "${path.module}/lambda/dist/index.mjs"
  snapshot_arn     = "arn:aws:s3:::${var.bucket_name}/snapshots/lista-presenca/*"
  distribution_arn = "arn:aws:cloudfront::${var.aws_account_id}:distribution/${var.distribution_id}"
}

# ---------------------------------------------------------------------------
# Buffer de confirmações
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "attendance_buffer" {
  name         = "pastoreio-attendance-buffer"
  billing_mode = "PROVISIONED"
  # Dentro do nível gratuito; também limita o volume de gravações em caso de abuso.
  read_capacity  = var.buffer_read_capacity
  write_capacity = var.buffer_write_capacity
  hash_key       = "pk"
  range_key      = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  # Itens esquecidos (ex.: marcados como failed) expiram sozinhos, sem custo
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  deletion_protection_enabled = true
}

# ---------------------------------------------------------------------------
# Lambda
# ---------------------------------------------------------------------------
resource "terraform_data" "lambda_bundle_guard" {
  lifecycle {
    precondition {
      condition     = fileexists(local.lambda_bundle)
      error_message = "Bundle da Lambda não encontrado. Rode: npm run build:lista-presenca-lambda"
    }
  }
}

data "archive_file" "offline_lambda" {
  type        = "zip"
  source_file = local.lambda_bundle
  output_path = "${path.module}/lambda/dist/offline-confirm.zip"
  depends_on  = [terraform_data.lambda_bundle_guard]
}

resource "aws_cloudwatch_log_group" "offline_lambda" {
  name              = "/aws/lambda/${local.offline_name}"
  retention_in_days = 14
}

resource "aws_iam_role" "offline_lambda" {
  name = "${local.offline_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "offline_lambda" {
  name = "${local.offline_name}-policy"
  role = aws_iam_role.offline_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.offline_lambda.arn}:*"
      },
      {
        Sid      = "ReadSnapshots"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = local.snapshot_arn
      },
      {
        Sid      = "WriteBuffer"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = aws_dynamodb_table.attendance_buffer.arn
      },
    ]
  })
}

resource "aws_lambda_function" "offline" {
  function_name    = local.offline_name
  description      = "Confirmacoes da lista de presenca com a EC2 desligada"
  role             = aws_iam_role.offline_lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.offline_lambda.output_path
  source_code_hash = data.archive_file.offline_lambda.output_base64sha256
  memory_size      = 128
  timeout          = 5

  environment {
    variables = {
      SNAPSHOT_BUCKET = var.bucket_name
      SNAPSHOT_PREFIX = "snapshots/lista-presenca"
      BUFFER_TABLE    = aws_dynamodb_table.attendance_buffer.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.offline_lambda, aws_iam_role_policy.offline_lambda]
}

# Function URL só aceita chamadas assinadas: na prática, apenas o CloudFront (OAC)
resource "aws_lambda_function_url" "offline" {
  function_name      = aws_lambda_function.offline.function_name
  authorization_type = "AWS_IAM"
}

resource "aws_cloudfront_origin_access_control" "offline_lambda" {
  name                              = local.offline_name
  description                       = "CloudFront -> Lambda da lista de presenca offline"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# O CloudFront precisa das duas permissões para invocar a Function URL
resource "aws_lambda_permission" "cloudfront_function_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.offline.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = local.distribution_arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id             = "AllowCloudFrontInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.offline.function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = local.distribution_arn
  invoked_via_function_url = true
}

# ---------------------------------------------------------------------------
# Permissão para a EC2 drenar o buffer (anexada à role existente, sem editá-la)
# ---------------------------------------------------------------------------
resource "aws_iam_policy" "ec2_buffer_sync" {
  name        = "pastoreio-attendance-buffer-sync"
  description = "EC2 do app: ler e remover itens do buffer de confirmacoes offline"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SyncBuffer"
      Effect   = "Allow"
      Action   = ["dynamodb:Scan", "dynamodb:DeleteItem", "dynamodb:UpdateItem"]
      Resource = aws_dynamodb_table.attendance_buffer.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_buffer_sync" {
  role       = var.ec2_role_name
  policy_arn = aws_iam_policy.ec2_buffer_sync.arn
}
