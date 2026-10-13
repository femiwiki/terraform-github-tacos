output "environments" {
  description = "The environments, by workspace."
  value       = { for k, v in github_repository_environment.this : k => v.environment }
}

output "organization_team_id" {
  description = "The ID of the team made from organization_team, or null."
  value       = one(github_team.approvers[*].id)
}
