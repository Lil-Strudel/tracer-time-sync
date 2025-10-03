terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.14.1"
    }
  }
  backend "s3" {
    bucket = "tts-terraform-state-5qeww9"
    key    = "terraform.tfstate"
    region = "us-west-2"
  }
}

provider "aws" {
  region = "us-west-2"
}

# Setting up backend to store tf state
resource "aws_s3_bucket" "terraform_state" {
  bucket = "tts-terraform-state-5qeww9"

  lifecycle {
    prevent_destroy = true
  }
}

# Creating CDN/Reverse Proxy
module "cloudfront" {
  source  = "terraform-aws-modules/cloudfront/aws"
  version = "5.0.0"

  aliases = []

  is_ipv6_enabled = true
  price_class     = "PriceClass_All"

  default_root_object = "index.html"

  create_origin_access_control = true
  origin_access_control = {
    s3_oac = {
      description      = "CloudFront access to S3"
      origin_type      = "s3"
      signing_behavior = "always"
      signing_protocol = "sigv4"
    }
  }

  origin = {
    webapp = {
      domain_name           = aws_s3_bucket.webapp.bucket_regional_domain_name
      origin_access_control = "s3_oac"
    }
    api = {
      domain_name = trim(module.api_gateway.api_endpoint, "https://")
      custom_origin_config = {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior = {
    target_origin_id = "webapp"

    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    use_forwarded_values = false

    # CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  ordered_cache_behavior = [
    {
      path_pattern     = "/api*"
      target_origin_id = "api"

      compress               = true
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]

      use_forwarded_values = false

      # CachingDisabled
      cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

      # AllViewerExceptHostHeader
      origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    },
    {
      path_pattern     = "/index.html"
      target_origin_id = "webapp"

      compress               = true
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]

      use_forwarded_values = false

      # CachingDisabled
      cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    }
  ]
}


# Setting up frontend bucket
resource "aws_s3_bucket" "webapp" {
  bucket = "tts-webapp-j3n7wx"
}

data "aws_iam_policy_document" "s3_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.webapp.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [module.cloudfront.cloudfront_distribution_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "bucket_policy" {
  bucket = aws_s3_bucket.webapp.id
  policy = data.aws_iam_policy_document.s3_policy.json
}

# Creating serverless api
variable "DATABASE_URL" {
  type      = string
  sensitive = true
}

locals {
  endpoints = [
    { method = "GET", route = "/api/ping", handler = "getPing" },
    { method = "POST", route = "/api/sync-all", handler = "postSyncAll" },
  ]
}

module "api_gateway" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "5.3.1"

  name          = "tts-apigateway"
  description   = "API gateway for tracer time sync"
  protocol_type = "HTTP"

  cors_configuration = {
    allow_headers = ["content-type", "x-amz-date", "x-amz-security-token", "x-amz-user-agent"]
    allow_methods = ["*"]
    allow_origins = ["*"]
  }

  create_certificate    = false
  create_domain_name    = false
  create_domain_records = false

  routes = {
    for ep in local.endpoints : "${ep.method} ${ep.route}" => {
      detailed_metrics_enabled = false

      integration = {
        uri                    = module.lambda_functions[ep.handler].lambda_function_arn
        payload_format_version = "2.0"
        timeout_milliseconds   = 12000
      }
    }
  }
}

module "lambda_functions" {
  for_each = { for ep in local.endpoints : ep.handler => ep }

  source  = "terraform-aws-modules/lambda/aws"
  version = "8.1.0"

  function_name = "tts-${each.value.handler}"
  handler       = "index.${each.value.handler}"
  runtime       = "nodejs22.x"
  publish       = true

  memory_size = 512
  timeout     = 12

  source_path = "../api/dist"

  environment_variables = {
    DATABASE_URL = var.DATABASE_URL
  }

  allowed_triggers = {
    AllowExecutionFromAPIGateway = {
      service    = "apigateway"
      source_arn = "${module.api_gateway.api_execution_arn}/*/*"
    }
  }
}
