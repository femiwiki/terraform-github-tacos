// With apply-before-merge, a pull request stacked on others plans its own
// branch, which carries every pull request below it, and merging it merges
// them all. That is safe only when one workspace changes: the applies of
// several run side by side, and one may need what another has yet to apply.
import type * as Core from '@actions/core'
import type { GitHub } from './merge.ts'

export default async ({ github, core, env }: { github: Pick<GitHub, 'request'>; core: typeof Core; env: NodeJS.ProcessEnv }) => {
  if (env.APPLY_BEFORE_MERGE !== 'true' || !env.PR) return
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/')
  const { data: pr } = await github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner, repo, pull_number: Number(env.PR), headers: { 'x-github-api-version': '2026-03-10' },
  })
  const stack: { position: number; base: { ref: string } } | undefined = pr.stack
  if (!stack || stack.position === 1) return
  const workspaces: string[] = JSON.parse(env.WORKSPACES || '[]')
  if (workspaces.length === 0) return

  const below = stack.position - 1
  const what = `#${pr.number} is stacked on ${below} pull request${below > 1 ? 's' : ''} and changes`
  if (workspaces.length > 1) {
    const list = workspaces.map(w => `\`${w}\``).join(', ')
    await core.summary.addHeading('Stack', 3)
      .addRaw(`**${what} ${list}.** Apply the stack from the bottom: approve the lowest pull request's run, and this one plans again once it merges.`, true)
      .write()
    core.setFailed(`${what} ${workspaces.join(', ')}, which may depend on each other. Apply the stack from the bottom.`)
    return
  }
  await core.summary.addHeading('Stack', 3)
    .addRaw(`${what} only \`${workspaces[0]}\`. Approving this run applies them all and merges the whole stack into \`${stack.base.ref}\`.`, true)
    .write()
}
