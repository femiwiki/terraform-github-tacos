variable "repository" {
  description = "The repository whose workflow plans and applies."
  type        = string
}

variable "environments" {
  description = "One environment per workspace. The action's apply job names the environment after the workspace."
  type        = set(string)
}

variable "reviewer_teams" {
  description = "IDs of the teams whose approval starts an apply."
  type        = list(number)
  default     = []
}

variable "reviewer_users" {
  description = "IDs of the users whose approval starts an apply."
  type        = list(number)
  default     = []
}

variable "prevent_self_review" {
  description = "Whether the person who pushed the change may approve its apply. Leave it off when one person does both."
  type        = bool
  default     = false
}

variable "can_admins_bypass" {
  description = "Whether repository administrators may start an apply without an approval."
  type        = bool
  default     = false
}
