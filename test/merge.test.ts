import { test } from 'node:test'
import assert from 'node:assert'
import merge from '../scripts/merge.ts'
import { fakeCore } from './fake.ts'
import { fakeGitHub, HttpError } from './github.ts'

const MERGE = 'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async'
const FOLLOW = 'GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid}'
const PULL = 'GET /repos/{owner}/{repo}/pulls/{pull_number}'

// Run 1 is this run, approved unless a route says otherwise
const routes = (more: Record<string, (p: Record<string, any>) => unknown> = {}) => ({
  [PULL]: () => ({ merged: false, draft: false, node_id: 'PR_1' }),
  'GET /repos/{owner}/{repo}/actions/runs/{run_id}': () => ({ workflow_id: 7 }),
  'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits': () => [{ sha: 'a' }],
  'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs': () => [{ id: 2 }],
  'GET /repos/{owner}/{repo}/deployments': () => [],
  'GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals': () => [{ state: 'approved' }],
  [MERGE]: () => ({ status: 'pending', details: { uuid: 'u' } }),
  [FOLLOW]: () => ({ status: 'merged', details: { sha: 'm' } }),
  ready: () => ({}),
  ...more,
})

const run = async (r: ReturnType<typeof routes>, env: Record<string, string> = {}) => {
  const { github, calls } = fakeGitHub(r)
  const { core, written } = fakeCore()
  await merge({
    github, core, sleep: async () => {},
    env: { APPLY_BEFORE_MERGE: 'true', PR: '5', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1', DEFAULT_BRANCH: 'main', METHOD: 'squash', ...env },
  })
  return { calls: calls.map(c => c.route), params: calls, written }
}

test('does nothing without apply-before-merge', async () => {
  const { calls } = await run(routes(), { APPLY_BEFORE_MERGE: '' })
  assert.deepStrictEqual(calls, [])
})

test('merges through the async API and follows the request', async () => {
  const { calls, params, written } = await run(routes())
  assert.strictEqual(written.failed, undefined)
  assert.match(written.summary(), /Merged #5\./)
  assert.deepStrictEqual(calls.slice(-2), [MERGE, FOLLOW])
  assert.strictEqual(params.find(c => c.route === MERGE)!.params.merge_method, 'squash')
})

test('leaves a pull request that was never applied', async () => {
  const { calls, written } = await run(routes({ 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals': () => [] }))
  assert.ok(!calls.includes(MERGE))
  assert.deepStrictEqual(written.notices.map(n => n.message), ['#5 was never applied, so it is left for a person to merge.'])
  assert.strictEqual(written.failed, undefined)
})

test('counts a successful deployment of an earlier run as applied', async () => {
  const { calls } = await run(routes({
    'GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals': () => [],
    'GET /repos/{owner}/{repo}/deployments': () => [{ id: 9 }],
    'GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses': () =>
      [{ state: 'success', log_url: 'https://github.com/o/r/actions/runs/2/job/3' }],
  }))
  assert.ok(calls.includes(MERGE))
})

test('readies a draft first', async () => {
  const { calls } = await run(routes({ [PULL]: () => ({ merged: false, draft: true, node_id: 'PR_1' }) }))
  assert.ok(calls.indexOf('ready') < calls.indexOf(MERGE))
})

test('does nothing to a merged pull request', async () => {
  const { calls, written } = await run(routes({ [PULL]: () => ({ merged: true }) }))
  assert.deepStrictEqual(calls, [PULL])
  assert.match(written.summary(), /#5 was already merged\./)
})

test('tries again after a refused merge', async () => {
  let tries = 0
  const { written } = await run(routes({
    [MERGE]: () => ++tries === 1
      ? { status: 'failed', details: { message: 'required check missing' } }
      : { status: 'merged', details: {} },
  }))
  assert.strictEqual(tries, 2)
  assert.strictEqual(written.failed, undefined)
})

test('fails when it has not merged in 2 minutes', async () => {
  const { written } = await run(routes({ [FOLLOW]: () => ({ status: 'pending', details: { uuid: 'u' } }) }))
  assert.match(written.failed!, /^#5 was applied but has not merged in 2 minutes/)
})

test('fails at once when the merge cannot be asked for', async () => {
  let tries = 0
  const { written } = await run(routes({ [MERGE]: () => { tries++; throw new HttpError(422, 'nope') } }))
  assert.strictEqual(tries, 1)
  assert.match(written.failed!, /could not be merged: nope/)
})

test('watches the pull request when a merge is already going', async () => {
  let pulls = 0
  const { written } = await run(routes({
    [MERGE]: () => { throw new HttpError(409, 'pending') },
    [PULL]: () => ({ merged: ++pulls > 2, draft: false }),
  }))
  assert.match(written.summary(), /Merged #5\./)
})

test('stops at the merge queue', async () => {
  const { written } = await run(routes({ [MERGE]: () => ({ status: 'enqueued', details: {} }) }))
  assert.match(written.summary(), /Added #5 to the merge queue\./)
})
