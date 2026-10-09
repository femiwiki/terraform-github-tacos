// Before planning: whether the pull request changes this workspace, so a plan
// job can leave alone the workspaces it does not.
import { posix } from 'node:path'
import type * as Core from '@actions/core'
import type { GitHub } from './merge.ts'

// The pull request files API lists no more than this, so a longer list may
// miss the very file that matters
const FILES_LIMIT = 3000

export default async ({ github, core, env }: { github: GitHub; core: typeof Core; env: NodeJS.ProcessEnv }) => {
  // A push plans every workspace: only the newest commit of the default branch
  // applies, and its plan carries every change not yet applied
  if (!env.PR) {
    core.info('Not a pull request, so every workspace is planned.')
    core.setOutput('plan', true)
    return
  }
  const workspace = env.WORKSPACE
  if (!workspace) {
    core.setFailed('the plan step needs a workspace')
    return
  }
  // owner/repo/.github/workflows/tofu.yml@refs/pull/1/merge
  const workflow = (env.GITHUB_WORKFLOW_REF ?? '').split('@')[0].split('/').slice(2).join('/')
  const globs = [`${workspace}/**`, workflow, ...(env.SHARED_PATHS ?? '').split('\n')]
    .map(g => g.trim()).filter(Boolean)

  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/')
  const files: string[] = (await github.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
    owner, repo, pull_number: Number(env.PR), per_page: 100,
  })).map(f => f.filename)
  const touched = files.find(f => globs.some(g => posix.matchesGlob(f, g)))
  const plan = touched !== undefined || files.length >= FILES_LIMIT

  core.setOutput('plan', plan)
  if (plan) {
    core.info(touched ? `${touched} is in ${workspace}'s paths.` : `#${env.PR} changes too many files to tell.`)
    return
  }
  core.info(`#${env.PR} changes nothing in ${globs.join(', ')}.`)
  await core.summary.addRaw(`### ${workspace} plan\n\n#${env.PR} leaves \`${workspace}\` alone, so it is not planned.\n`).write()
}
