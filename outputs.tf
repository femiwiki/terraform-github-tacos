output "environments" {
  description = "The environments, by workspace."
  value       = { for k, v in github_repository_environment.this : k => v.environment }
}
