locals {
  reviewer_teams = concat(var.reviewer_teams, [for t in github_team.approvers : tonumber(t.id)])
}

resource "github_team" "approvers" {
  count = var.organization_team == null ? 0 : 1

  name        = var.organization_team.name
  description = var.organization_team.description
  privacy     = "closed"
}

resource "github_team_membership" "approvers" {
  for_each = var.organization_team == null ? {} : merge(
    { for u in var.organization_team.members : u => "member" },
    { for u in var.organization_team.maintainers : u => "maintainer" },
  )

  team_id  = github_team.approvers[0].id
  username = each.key
  role     = each.value
}

# A reviewer needs read access to the repository
resource "github_team_repository" "approvers" {
  count = var.organization_team == null ? 0 : 1

  team_id    = github_team.approvers[0].id
  repository = var.repository
  permission = "pull"
}

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
      teams = local.reviewer_teams
      users = var.reviewer_users
    }
  }

  depends_on = [github_team_repository.approvers]

  lifecycle {
    # Without a reviewer the apply job would run as soon as it is reached, and
    # the action's pending step refuses such an environment unless it is listed
    # in auto-apply
    precondition {
      condition     = contains(var.auto_apply, each.key) || length(local.reviewer_teams) + length(var.reviewer_users) > 0
      error_message = "Give at least one reviewer team or user, or organization_team, or list ${each.key} in auto_apply."
    }
    precondition {
      condition     = length(setsubtract(var.auto_apply, var.environments)) == 0
      error_message = "auto_apply names environments not in environments: ${join(", ", setsubtract(var.auto_apply, var.environments))}."
    }
  }
}

# Makes the gate a required check of the default branch. A ruleset adds to
# whatever branch protection the repository already has instead of replacing it.
resource "github_repository_ruleset" "gate" {
  count = var.gate_check == null ? 0 : 1

  name        = "tacos gate"
  repository  = var.repository
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    required_status_checks {
      required_check {
        context = var.gate_check
        # The GitHub Actions app, so no other app can pass the check under the same name
        integration_id = 15368
      }
    }
  }
}
