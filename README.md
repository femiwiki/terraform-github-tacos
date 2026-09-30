# terraform-github-tacos

Plan OpenTofu or Terraform in a pull request, apply it when a GitHub
environment approves, then merge. It does what Terraform Cloud's VCS workflow
does, with GitHub Actions alone.

This repository has a GitHub Action, `action.yml`, and an OpenTofu module at
the root that creates the environments the apply waits on.

The documentation is at <https://femiwiki.github.io/terraform-github-tacos/>,
built from [`docs/`](docs) with [wikven](https://github.com/chaotic-ground/wikven).

## License

MIT
