resource "github_repository_environment" "this" {
  for_each = var.environments

  repository          = var.repository
  environment         = each.key
  prevent_self_review = var.prevent_self_review
  can_admins_bypass   = var.can_admins_bypass

  # An apply waits here until someone approves it
  reviewers {
    teams = var.reviewer_teams
    users = var.reviewer_users
  }

  lifecycle {
    # Without a reviewer the apply job would run as soon as it is reached, and
    # the action's pending step refuses such an environment anyway
    precondition {
      condition     = length(var.reviewer_teams) + length(var.reviewer_users) > 0
      error_message = "Give at least one reviewer team or user."
    }
  }
}
