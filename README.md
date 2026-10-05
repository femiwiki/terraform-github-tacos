# terraform-github-tacos

Plan OpenTofu or Terraform in a pull request, plan again once it merges, and
apply when a GitHub environment approves. It does what HCP Terraform's (formerly
Terraform Cloud) VCS workflow does, with GitHub Actions alone. It can instead
apply a pull request before it merges.

This repository has a GitHub Action, `action.yml`, and an OpenTofu module at
the root that creates the environments the apply waits on.

The documentation is at <https://femiwiki.github.io/terraform-github-tacos/>,
built from [`docs/`](docs) with [wikven](https://github.com/chaotic-ground/wikven).

## License

MIT
