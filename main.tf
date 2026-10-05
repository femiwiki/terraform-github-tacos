resource "github_repository_environment" "this" {
  for_each = var.environments

  repository          = var.repository
  environment         = each.key
  prevent_self_review = var.prevent_self_review
  can_admins_bypass   = var.can_admins_bypass

  # An apply waits here until someone approves it, unless it applies automatically
  dynamic "reviewers" {
    for_each = contains(var.auto_apply, each.key) ? [] : [1]
    content {
      teams = var.reviewer_teams
      users = var.reviewer_users
    }
  }

  lifecycle {
    # Without a reviewer the apply job would run as soon as it is reached, and
    # the action's pending step refuses such an environment unless it is listed
    # in auto-apply
    precondition {
      condition     = contains(var.auto_apply, each.key) || length(var.reviewer_teams) + length(var.reviewer_users) > 0
      error_message = "Give at least one reviewer team or user, or list ${each.key} in auto_apply."
    }
    precondition {
      condition     = length(setsubtract(var.auto_apply, var.environments)) == 0
      error_message = "auto_apply names environments not in environments: ${join(", ", setsubtract(var.auto_apply, var.environments))}."
    }
  }
}
