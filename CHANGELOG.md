# Changelog

## [0.2.3](https://github.com/femiwiki/terraform-github-tacos/compare/v0.2.2...v0.2.3) (2026-10-02)


### Bug Fixes

* count this run's own approval when deciding to merge ([#42](https://github.com/femiwiki/terraform-github-tacos/issues/42)) ([2804b14](https://github.com/femiwiki/terraform-github-tacos/commit/2804b14c67c13f7a03c03c1a10a78722395d6bb9))

## [0.2.2](https://github.com/femiwiki/terraform-github-tacos/compare/v0.2.1...v0.2.2) (2026-10-01)


### Bug Fixes

* tell a merged pull request by its state ([#34](https://github.com/femiwiki/terraform-github-tacos/issues/34)) ([4dd4ea6](https://github.com/femiwiki/terraform-github-tacos/commit/4dd4ea61e38662c0c65e87f8d039138c568aea5c))

## [0.2.1](https://github.com/femiwiki/terraform-github-tacos/compare/v0.2.0...v0.2.1) (2026-10-01)


### Bug Fixes

* merge a pull request that an earlier run applied ([#31](https://github.com/femiwiki/terraform-github-tacos/issues/31)) ([a2492b7](https://github.com/femiwiki/terraform-github-tacos/commit/a2492b75e27789f59e2cf130c4a07b3702a204e0)), closes [#29](https://github.com/femiwiki/terraform-github-tacos/issues/29)
* read plan annotations from the attempt that ran each job ([#28](https://github.com/femiwiki/terraform-github-tacos/issues/28)) ([50f27b8](https://github.com/femiwiki/terraform-github-tacos/commit/50f27b8d3fa4dca0578f119f5c5c40ce06147425)), closes [#27](https://github.com/femiwiki/terraform-github-tacos/issues/27)

## [0.2.0](https://github.com/femiwiki/terraform-github-tacos/compare/v0.1.0...v0.2.0) (2026-09-30)


### Features

* show the whole plan in the job summary ([#19](https://github.com/femiwiki/terraform-github-tacos/issues/19)) ([5be74d0](https://github.com/femiwiki/terraform-github-tacos/commit/5be74d03c418dbaa47ef2631085b2d8c6367d128))

## 0.1.0 (2026-09-30)


### Features

* allow planning and applying a branch behind its base ([#20](https://github.com/femiwiki/terraform-github-tacos/issues/20)) ([7afe018](https://github.com/femiwiki/terraform-github-tacos/commit/7afe018f40475b61f81fb7efe6748340e4d7a673))
* write the apply result to the job summary ([#13](https://github.com/femiwiki/terraform-github-tacos/issues/13)) ([641fcd7](https://github.com/femiwiki/terraform-github-tacos/commit/641fcd7bb46809d60833719d2cf95e5ec5269b50)), closes [#2](https://github.com/femiwiki/terraform-github-tacos/issues/2)
