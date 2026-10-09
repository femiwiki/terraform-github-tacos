import { test } from 'node:test'
import assert from 'node:assert'
import scope from '../scripts/scope.ts'
import { fakeCore } from './fake.ts'
import { fakeGitHub } from './github.ts'

const run = async (files: string[], env: NodeJS.ProcessEnv = {}) => {
  const { github, calls } = fakeGitHub({
    'GET /repos/{owner}/{repo}/pulls/{pull_number}/files': () => files.map(filename => ({ filename })),
  })
  const { core, written } = fakeCore()
  await scope({
    github, core,
    env: {
      PR: '1', WORKSPACE: 'dns', GITHUB_REPOSITORY: 'o/r',
      GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/tofu.yml@refs/pull/1/merge', ...env,
    },
  })
  return { written, calls }
}

test('plans a workspace whose directory changed', async () => {
  const { written } = await run(['README.md', 'dns/records.tf'])
  assert.strictEqual(written.outputs.plan, true)
})

test('skips a workspace the pull request leaves alone', async () => {
  const { written } = await run(['network/vpc.tf', 'dnsx/a.tf'])
  assert.strictEqual(written.outputs.plan, false)
  assert.match(written.summary(), /#1 leaves `dns` alone/)
})

test('plans every workspace when the calling workflow changed', async () => {
  const { written } = await run(['.github/workflows/tofu.yml'])
  assert.strictEqual(written.outputs.plan, true)
})

test('plans when a shared path changed', async () => {
  const shared = '.github/actions/**\n  serving/**\n'
  assert.strictEqual((await run(['serving/Caddyfile'], { SHARED_PATHS: shared })).written.outputs.plan, true)
  assert.strictEqual((await run(['.github/actions/a/action.yml'], { SHARED_PATHS: shared })).written.outputs.plan, true)
  assert.strictEqual((await run(['servingx/Caddyfile'], { SHARED_PATHS: shared })).written.outputs.plan, false)
})

test('a single star stays within a directory', async () => {
  assert.strictEqual((await run(['versions.tf'], { SHARED_PATHS: '*.tf' })).written.outputs.plan, true)
  assert.strictEqual((await run(['network/versions.tf'], { SHARED_PATHS: '*.tf' })).written.outputs.plan, false)
})

test('plans when there are too many files to list them all', async () => {
  const files = Array.from({ length: 3000 }, (_, i) => `network/${i}.tf`)
  assert.strictEqual((await run(files)).written.outputs.plan, true)
})

test('plans every workspace outside a pull request, without asking', async () => {
  const { written, calls } = await run([], { PR: '' })
  assert.strictEqual(written.outputs.plan, true)
  assert.deepStrictEqual(calls, [])
})

test('fails without a workspace', async () => {
  const { written } = await run([], { WORKSPACE: '' })
  assert.strictEqual(written.failed, 'the plan step needs a workspace')
})
