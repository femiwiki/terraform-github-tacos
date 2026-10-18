// Before planning: with require-up-to-date, a branch behind its base cannot be planned.
import type * as Core from '@actions/core'
import { behind, onPullRequest, STACK_API } from './common.ts'
import type { GitHub } from './merge.ts'

export default async ({
  github,
  core,
  env,
}: {
  github: Pick<GitHub, 'request'>
  core: typeof Core
  env: NodeJS.ProcessEnv
}) => {
  if (env.REQUIRE_UP_TO_DATE !== 'true') {
    core.info('A branch behind its base may be planned. The apply compares a fresh plan with the approved one.')
    return
  }
  if (!onPullRequest(env)) {
    core.info('Not a pull request, so there is no base to compare with.')
    return
  }
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/')
  const { data: pr } = await github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: Number(env.PR),
    headers: STACK_API,
  })
  const base: string = pr.stack?.base.ref ?? pr.base.ref
  const why = await behind(github, env, base, pr.head.sha, 'plan again')
  if (why) {
    core.setFailed(why)
    return
  }
  core.info(`Up to date with ${base}.`)
}
