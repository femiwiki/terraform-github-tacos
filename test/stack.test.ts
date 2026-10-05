import { test } from 'node:test'
import assert from 'node:assert'
import stack from '../scripts/stack.ts'
import { fakeCore } from './fake.ts'
import { fakeGitHub } from './github.ts'

const run = async (pr: object, workspaces: string[], env: Record<string, string> = {}) => {
  const { github, calls } = fakeGitHub({ 'GET /repos/{owner}/{repo}/pulls/{pull_number}': () => ({ number: 5, ...pr }) })
  const { core, written } = fakeCore()
  await stack({ github, core, env: { APPLY_BEFORE_MERGE: 'true', PR: '5', GITHUB_REPOSITORY: 'o/r', WORKSPACES: JSON.stringify(workspaces), ...env } })
  return { calls, written }
}
const upper = { stack: { position: 3, size: 3, base: { ref: 'main' } } }

test('fails a stacked pull request that changes several workspaces', async () => {
  const { written } = await run(upper, ['aws', 'docker'])
  assert.strictEqual(written.failed, '#5 is stacked on 2 pull requests and changes aws, docker, which may depend on each other. Apply the stack from the bottom.')
})

test('lets a stacked pull request that changes one workspace apply the whole stack', async () => {
  const { written } = await run(upper, ['aws'])
  assert.strictEqual(written.failed, undefined)
  assert.match(written.raw[0], /merges the whole stack into `main`/)
})

test('leaves the bottom of a stack and unstacked pull requests alone', async () => {
  for (const pr of [{ stack: { position: 1, base: { ref: 'main' } } }, {}]) {
    const { written } = await run(pr, ['aws', 'docker'])
    assert.strictEqual(written.failed, undefined)
    assert.deepStrictEqual(written.raw, [])
  }
})

test('does nothing without apply-before-merge', async () => {
  const { calls } = await run(upper, ['aws', 'docker'], { APPLY_BEFORE_MERGE: '' })
  assert.deepStrictEqual(calls, [])
})
