import { test } from 'node:test'
import assert from 'node:assert'
import plan from '../scripts/plan.ts'
import { fakeCore } from './fake.ts'
import { fakeGitHub } from './github.ts'

const PULL = 'GET /repos/{owner}/{repo}/pulls/{pull_number}'
const COMPARE = 'GET /repos/{owner}/{repo}/compare/{basehead}'

const run = async (behindBy: number, env: Record<string, string> = {}, pr: object = { base: { ref: 'main' }, head: { sha: 'h' } }) => {
  const { github, calls } = fakeGitHub({ [PULL]: () => pr, [COMPARE]: () => ({ behind_by: behindBy }) })
  const { core, written } = fakeCore()
  await plan({
    github, core,
    env: { REQUIRE_UP_TO_DATE: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'o/r', PR: '5', ...env },
  })
  return { calls, written }
}

test('does not compare without require-up-to-date', async () => {
  const { calls, written } = await run(3, { REQUIRE_UP_TO_DATE: 'false' })
  assert.deepStrictEqual(calls, [])
  assert.strictEqual(written.failed, undefined)
})

test('does not compare outside a pull request', async () => {
  const { calls } = await run(3, { GITHUB_EVENT_NAME: 'push' })
  assert.deepStrictEqual(calls, [])
})

test('passes a branch up to date with its base', async () => {
  const { calls, written } = await run(0)
  assert.strictEqual(written.failed, undefined)
  assert.strictEqual(calls[1].params.basehead, 'main...h')
})

test('fails a branch behind its base', async () => {
  const { written } = await run(2)
  assert.match(written.failed!, /^#5 is 2 commits behind main.*then plan again\.$/)
})

test('compares a stacked pull request with the base of its stack', async () => {
  const { calls } = await run(0, {}, { base: { ref: 'below' }, head: { sha: 'h' }, stack: { base: { ref: 'main' } } })
  assert.strictEqual(calls[1].params.basehead, 'main...h')
})
