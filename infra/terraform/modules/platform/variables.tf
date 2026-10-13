variable "environment" {
  type        = string
  description = "dev or staging. Production is rejected."

  validation {
    condition     = contains(["dev", "staging"], var.environment)
    error_message = "production is not authorized."
  }
}

variable "state_encryption_required" {
  type        = bool
  description = "Remote state must be encrypted before it is used."
  default     = true

  validation {
    condition     = var.state_encryption_required
    error_message = "State encryption is required."
  }
}
