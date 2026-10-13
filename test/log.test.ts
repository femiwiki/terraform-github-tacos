import { test } from 'node:test'
import assert from 'node:assert'
import log, { stepOutput } from '../scripts/log.ts'
import { fakeCore } from './fake.ts'
import { fakeGitHub, HttpError } from './github.ts'

const JOBS = 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs'
const LOGS = 'GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs'
const COMMENT = 'POST /repos/{owner}/{repo}/issues/{issue_number}/comments'
const PULLS = 'GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls'

const jobLog = [
  '2026-10-13T00:00:00.0000000Z ##[group]Run femiwiki/terraform-github-tacos@abc',
  '2026-10-13T00:00:01.0000000Z Approved by @someone.',
  '2026-10-13T00:00:02.0000000Z ##[endgroup]',
  '2026-10-13T00:00:03.0000000Z ##[group]Run dflook/tofu-apply@def',
  '2026-10-13T00:00:03.0000000Z with:',
  '2026-10-13T00:00:03.0000000Z ##[endgroup]',
  '2026-10-13T00:00:04.0000000Z ##[group]Installing OpenTofu',
  '2026-10-13T00:00:05.0000000Z downloading',
  '2026-10-13T00:00:06.0000000Z ##[endgroup]',
  '2026-10-13T00:00:07.0000000Z ##[command]tofu apply',
  '2026-10-13T00:00:08.0000000Z aws_s3_bucket.a: Creating...',
  '2026-10-13T00:00:09.0000000Z Apply complete! Resources: 1 added, 0 changed, 0 destroyed.',
  '2026-10-13T00:00:10.0000000Z ##[group]Run femiwiki/terraform-github-tacos@abc',
  '2026-10-13T00:00:11.0000000Z Applied.',
].join('\n')

test('keeps only the named step, without its groups or commands', () => {
  assert.strictEqual(stepOutput(jobLog, 'dflook/tofu-apply'),
    'aws_s3_bucket.a: Creating...\nApply complete! Resources: 1 added, 0 changed, 0 destroyed.')
  assert.strictEqual(stepOutput(jobLog, 'dflook/terraform-apply'), '')
})

const routes = (more: Record<string, (p: Record<string, any>) => unknown> = {}) => ({
  [JOBS]: () => [
    { id: 1, name: 'dns plan', conclusion: 'success' },
    { id: 2, name: 'dns apply', conclusion: 'success' },
    { id: 3, name: 'network apply', conclusion: 'failure' },
  ],
  [LOGS]: () => jobLog,
  [COMMENT]: () => ({}),
  ...more,
})

const run = async (r: ReturnType<typeof routes>, env: Record<string, string> = {}) => {
  const { github, calls } = fakeGitHub(r)
  const { core } = fakeCore()
  await log({
    github, core, sleep: async () => {},
    env: {
      PR: '5', LOG_STEP: 'dflook/tofu-apply', GITHUB_REPOSITORY: 'o/r', GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_RUN_ID: '9', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_NUMBER: '42', GITHUB_WORKFLOW: 'tofu', GITHUB_SHA: 'a',
      ...env,
    },
  })
  return calls
}

test('comments each apply job on the pull request', async () => {
  const calls = await run(routes())
  const comments = calls.filter(c => c.route === COMMENT).map(c => c.params)
  assert.deepStrictEqual(comments.map(c => c.issue_number), [5, 5])
  assert.match(comments[0].body, /^\*\*dns apply: success\*\* in \[tofu #42\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/9\)\n/)
  assert.match(comments[1].body, /^\*\*network apply: failure\*\*/)
  assert.match(comments[0].body, /Apply complete!/)
  assert.doesNotMatch(comments[0].body, /downloading|Approved by/)
  assert.deepStrictEqual(calls.filter(c => c.route === LOGS).map(c => c.params.job_id), [2, 3])
})

test('after the merge, comments on the pull request that merged the commit', async () => {
  const calls = await run(routes({
    [PULLS]: () => [{ number: 3, merged_at: null }, { number: 4, merged_at: '2026-10-13T00:00:00Z' }],
  }), { PR: '' })
  assert.deepStrictEqual(calls.filter(c => c.route === COMMENT).map(c => c.params.issue_number), [4, 4])
})

test('without a merged pull request, comments nowhere', async () => {
  const calls = await run(routes({ [PULLS]: () => [] }), { PR: '' })
  assert.deepStrictEqual(calls.map(c => c.route), [PULLS])
})

test('keeps the end of a long log', async () => {
  const long = jobLog.replace('Apply complete!', `${'x'.repeat(70_000)}\nApply complete!`)
  const calls = await run(routes({ [LOGS]: () => long }))
  const body: string = calls.find(c => c.route === COMMENT)!.params.body
  assert.match(body, /, the start cut to fit a comment/)
  assert.match(body, /Apply complete!/)
  assert.ok(body.length < 65_536)
})

test('waits for a log that is not readable yet', async () => {
  let tries = 0
  const calls = await run(routes({
    [LOGS]: () => {
      if (++tries < 3) throw new HttpError(404, 'Not Found')
      return jobLog
    },
  }))
  assert.strictEqual(calls.filter(c => c.route === COMMENT).length, 2)
})

test('skips a job whose step left no output', async () => {
  const calls = await run(routes(), { LOG_STEP: 'dflook/terraform-apply' })
  assert.strictEqual(calls.filter(c => c.route === COMMENT).length, 0)
})
