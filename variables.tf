variable "repository" {
  description = "The repository whose workflow plans and applies."
  type        = string
}

variable "environments" {
  description = "One environment per workspace. The action's apply job names the environment after the workspace."
  type        = set(string)
}

variable "auto_apply" {
  description = "Environments that apply without an approval, like HCP Terraform's auto apply. List the same workspaces in the action's auto-apply input."
  type        = set(string)
  default     = []
}

variable "reviewer_teams" {
  description = "IDs of the teams whose approval starts an apply."
  type        = list(number)
  default     = []
}

variable "organization_team" {
  description = "A team to create in the repository's organization, with read access to the repository, and add to the reviewers. Members and maintainers are GitHub usernames. Leave it null for a repository a user owns, since only organizations have teams."
  type = object({
    name        = string
    description = optional(string)
    members     = optional(set(string), [])
    maintainers = optional(set(string), [])
  })
  default = null
}

variable "reviewer_users" {
  description = "IDs of the users whose approval starts an apply."
  type        = list(number)
  default     = []
}

variable "prevent_self_review" {
  description = "Whether the person who started the run is barred from approving its apply. Leave it off when one person does both."
  type        = bool
  default     = false
}

variable "can_admins_bypass" {
  description = "Whether repository administrators may start an apply without an approval."
  type        = bool
  default     = false
}

variable "gate_check" {
  description = "The name of the gate job, made a required check of the default branch through a ruleset. Null leaves the branch alone."
  type        = string
  default     = "tofu gate"
}
