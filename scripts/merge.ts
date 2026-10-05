// With apply-before-merge, an apply runs before the merge, so until the pull
// request lands the default branch describes less than what is deployed, and
// the next apply from any other branch takes production back to it.
import type * as Core from '@actions/core'

type Params = Record<string, unknown>
export type GitHub = {
  request: (route: string, params?: Params) => Promise<{ status: number; data: any }>
  paginate: (route: string, params?: Params) => Promise<any[]>
  graphql: (query: string, variables: Params) => Promise<unknown>
}
type Merge = { status: 'pending' | 'merged' | 'enqueued' | 'failed'; details: { uuid?: string; message?: string } }

// The async merge API is the only one that merges a stacked pull request
const VERSION = { 'x-github-api-version': '2026-03-10' }
// The gate has just reported, and branch protection can take a moment to see
// it, so a merge it refuses is tried again for 2 minutes
const TRIES = 12
const INTERVAL = 10_000

export default async ({ github, core, env, sleep = ms => new Promise(r => setTimeout(r, ms)) }: {
  github: GitHub; core: typeof Core; env: NodeJS.ProcessEnv; sleep?: (ms: number) => Promise<unknown>
}) => {
  const say = async (text: string) => { await core.summary.addHeading('Merge', 3).addRaw(text, true).write() }
  if (env.APPLY_BEFORE_MERGE !== 'true') {
    core.info('Applies follow the merge, so there is nothing for this step to merge.')
    return
  }
  if (!env.PR) {
    core.info('Not a pull request, so there is nothing to merge.')
    return
  }
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/')
  const pull_number = Number(env.PR)
  const pr = () => github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', { owner, repo, pull_number })

  if ((await pr()).data.merged) {
    await say(`#${pull_number} was already merged.`)
    return
  }
  if (!(await applied(github, owner, repo, pull_number, Number(env.GITHUB_RUN_ID)))) {
    core.notice(`#${pull_number} was never applied, so it is left for a person to merge.`)
    await say(`#${pull_number} was never applied, so it is left for a person to merge.`)
    return
  }
  // A draft cannot be merged at all
  const { data } = await pr()
  if (data.draft) {
    await github.graphql('mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }', { id: data.node_id })
  }

  const unmerged = async (why: string) => {
    core.setFailed(`#${pull_number} was applied but ${why}, so production is ahead of ${env.DEFAULT_BRANCH}. Merge it by hand.`)
    await say(`**#${pull_number} was applied but ${why}.** Merge it by hand so \`${env.DEFAULT_BRANCH}\` matches what is deployed.`)
  }
  const submit = async (): Promise<Merge | undefined> => {
    try {
      return (await github.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async', {
        owner, repo, pull_number, merge_method: env.METHOD, headers: VERSION,
      })).data
    } catch (e) {
      const { status, message } = e as { status?: number; message?: string }
      // An earlier try is still going, without a request id to follow
      if (status === 409) return { status: 'pending', details: {} }
      await unmerged(`could not be merged: ${message}`)
    }
  }
  const follow = async ({ details: { uuid } }: Merge): Promise<Merge> => {
    if (uuid) {
      return (await github.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid}', {
        owner, repo, pull_number, uuid, headers: VERSION,
      })).data
    }
    return (await pr()).data.merged ? { status: 'merged', details: {} } : { status: 'pending', details: {} }
  }

  let merge: Merge | undefined
  for (let i = 0; i < TRIES; i++) {
    if (i > 0) await sleep(INTERVAL)
    merge = !merge || merge.status === 'failed' ? await submit() : await follow(merge)
    if (!merge) return
    if (merge.status === 'merged') {
      await say(`Merged #${pull_number}.`)
      return
    }
    if (merge.status === 'enqueued') {
      await say(`Added #${pull_number} to the merge queue.`)
      return
    }
  }
  await unmerged(merge?.status === 'failed' ? `could not be merged: ${merge.details.message}` : 'has not merged in 2 minutes')
}

// A run with nothing to apply merges only what an earlier run of this pull
// request applied: one a person approved, or that applied an auto-apply
// workspace, which leaves a successful deployment and no approval
const applied = async (github: GitHub, owner: string, repo: string, pull_number: number, run_id: number) => {
  const { data: run } = await github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', { owner, repo, run_id })
  const shas = (await github.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', { owner, repo, pull_number }))
    .map(c => c.sha as string)
  // This run first, since a runs listing missed it once (infra#1039); then by
  // commit, as a branch name can be reused by a later pull request
  const runs = [run_id]
  const deployed = new Set<number>()
  for (const head_sha of shas) {
    const listed = await github.paginate('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
      owner, repo, workflow_id: run.workflow_id, event: 'pull_request', head_sha,
    })
    runs.push(...listed.map(r => r.id as number))
    const deployments = await github.paginate('GET /repos/{owner}/{repo}/deployments', { owner, repo, sha: head_sha })
      .catch(() => { throw new Error('could not list deployments; the merge step needs deployments: read.') })
    for (const deployment of deployments) {
      const statuses = await github.paginate('GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses', {
        owner, repo, deployment_id: deployment.id,
      })
      for (const s of statuses.filter(s => s.state === 'success')) {
        const m = String(s.log_url ?? '').match(/\/actions\/runs\/(\d+)\//)
        if (m) deployed.add(Number(m[1]))
      }
    }
  }
  for (const id of runs) {
    if (deployed.has(id)) return true
    const approvals = await github.paginate('GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals', { owner, repo, run_id: id })
    if (approvals.some(a => a.state === 'approved')) return true
  }
  return false
}
