terraform {
  required_version = ">= 1.6.0"
}

module "platform" {
  source      = "../../modules/platform"
  environment = "dev"
}
