# terraform-github-tacos

Plan OpenTofu or Terraform in a pull request, apply it when a GitHub
environment approves, then merge. It does what Terraform Cloud's VCS workflow
does, with GitHub Actions alone.

The flow applies before the merge. Approving the deployment is the apply, and
the pull request merges once the apply has succeeded, so the default branch
never holds a change that was not applied.

This repository has two parts:

- A GitHub Action, `action.yml`, that the workflow calls once per job.
- An OpenTofu module, at the root, that creates the environments the apply
  waits on.

## The action

Call the action with `step` set to the job it runs in. See
[`examples/tofu.yaml`](examples/tofu.yaml) for a whole workflow.

| `step` | Job | What it does |
|---|---|---|
| `plan` | plan, before planning | With `require-up-to-date`, refuses a branch that is behind its base. |
| `changes` | plan, after planning | Marks the workspace as having changes to apply. |
| `pending` | one job after the plans | Cancels older runs of the pull request that still wait for approval, lists the workspaces to apply, and refuses an environment without required reviewers. |
| `apply` | apply, first step | Refuses to apply when the pull request moved or merged, or with `require-up-to-date` fell behind, and records who approved. |
| `result` | apply, last step, with `if: always()` | Writes what the apply changed and whether it succeeded. |
| `gate` | the required check | Fails unless every job it needs succeeded. The apply job may be skipped. |
| `merge` | after the gate | Merges the pull request. |

A pull request behind its base may be planned and applied unless
`require-up-to-date` is `"true"`. The plan runs on the merge commit, and the
apply job should make a fresh plan and apply it only when it matches the
approved one, as `dflook/tofu-apply` does without `plan_path` or
`auto_approve`. A change on the base to the same workspace then stops the
apply, and a change to another workspace does not.

Each step writes a job summary, so the run page shows what was planned, who can
approve, who approved, and what the apply changed.

The apply job's environment has the same name as the workspace.

### Permissions

| `step` | Permissions |
|---|---|
| `plan` | `pull-requests: read` |
| `pending` | `actions: write`, `checks: read` |
| `apply` | `actions: read`, `pull-requests: read` |
| `merge` | `contents: write`, `pull-requests: write` |

## The module

```hcl
module "tacos" {
  source = "github.com/femiwiki/terraform-github-tacos"

  repository     = "infra"
  environments   = ["network", "dns"]
  reviewer_teams = [github_team.deployer.id]
}
```

Make the gate job's name a required status check of the default branch.

## License

MIT
