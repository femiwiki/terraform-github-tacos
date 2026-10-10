# Changelog

## [0.7.0](https://github.com/femiwiki/terraform-github-tacos/compare/v0.6.1...v0.7.0) (2026-10-10)


### Features

* skip planning a workspace the pull request leaves alone ([#70](https://github.com/femiwiki/terraform-github-tacos/issues/70)) ([12c929d](https://github.com/femiwiki/terraform-github-tacos/commit/12c929d1b090f7ce9b7e26dd0032e51afc1c3042)), closes [#3](https://github.com/femiwiki/terraform-github-tacos/issues/3)

## [0.6.1](https://github.com/femiwiki/terraform-github-tacos/compare/v0.6.0...v0.6.1) (2026-10-09)


### Bug Fixes

* stop telling every workspace with changes that it waits for approval ([#75](https://github.com/femiwiki/terraform-github-tacos/issues/75)) ([388cbd8](https://github.com/femiwiki/terraform-github-tacos/commit/388cbd88b0d4c436e2ec8895ab3178b7d38696b3)), closes [#74](https://github.com/femiwiki/terraform-github-tacos/issues/74)

## [0.6.0](https://github.com/femiwiki/terraform-github-tacos/compare/v0.5.0...v0.6.0) (2026-10-09)


### Features

* cache the providers dflook downloads, and retry downloads more ([#71](https://github.com/femiwiki/terraform-github-tacos/issues/71)) ([e9f37b3](https://github.com/femiwiki/terraform-github-tacos/commit/e9f37b3953356deb9a3d1af3fe803bd49e5b7fae))


### Bug Fixes

* **docs:** keep the landing buttons readable on hover ([#64](https://github.com/femiwiki/terraform-github-tacos/issues/64)) ([496241b](https://github.com/femiwiki/terraform-github-tacos/commit/496241b4de48df139510a0615c6dc5759a1fd022))

## [0.5.0](https://github.com/femiwiki/terraform-github-tacos/compare/v0.4.0...v0.5.0) (2026-10-05)


### Features

* apply and merge native stacked pull requests ([#54](https://github.com/femiwiki/terraform-github-tacos/issues/54)) ([8f7c6de](https://github.com/femiwiki/terraform-github-tacos/commit/8f7c6de6a9e2e4027439fc75ce1a36fc8e2f835f))
* plan and apply a pull request from a run its review starts ([#61](https://github.com/femiwiki/terraform-github-tacos/issues/61)) ([7d1c93b](https://github.com/femiwiki/terraform-github-tacos/commit/7d1c93b495286ec031aefb5f8dca200e1c043686))

## [0.4.0](https://github.com/femiwiki/terraform-github-tacos/compare/v0.3.0...v0.4.0) (2026-10-05)


### ⚠ BREAKING CHANGES

* a v0.3.0 workflow no longer applies its pull requests. Add apply-before-merge: "true" to the pending, apply and merge steps to keep applying before the merge.

### Features

* apply after the merge by default ([#50](https://github.com/femiwiki/terraform-github-tacos/issues/50)) ([cc13623](https://github.com/femiwiki/terraform-github-tacos/commit/cc13623af122863e9bfb1d8040826c4a85a24819))

## [0.3.0](https://github.com/femiwiki/terraform-github-tacos/compare/v0.2.3...v0.3.0) (2026-10-02)


### Features

* add a collapse step that hides outdated plan comments ([#46](https://github.com/femiwiki/terraform-github-tacos/issues/46)) ([4e5ec39](https://github.com/femiwiki/terraform-github-tacos/commit/4e5ec396b6029f9841b4ea6585eaa7da8f1a957d)), closes [#5](https://github.com/femiwiki/terraform-github-tacos/issues/5)

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
