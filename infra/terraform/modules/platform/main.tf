locals {
  tags = {
    project     = "curasphere"
    environment = var.environment
    managed_by  = "opentofu"
  }

  data_store = "curasphere-${var.environment}"
}
