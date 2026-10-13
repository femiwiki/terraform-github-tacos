import { test } from 'node:test'
import assert from 'node:assert'
import { createHash } from 'node:crypto'
import providers from '../scripts/providers.ts'
import { fakeCore } from './fake.ts'
import { fakeGitHub, HttpError } from './github.ts'

const LOCK = 'provider "registry.opentofu.org/hashicorp/aws" {}\n'
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

const run = async (routes: Record<string, (p: Record<string, any>) => unknown>, env: Record<string, string> = {}) => {
  const { github, calls } = fakeGitHub(routes)
  const { core, written } = fakeCore()
  await providers({
    github, core,
    env: { GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: 'abc', RUNNER_TEMP: '/tmp/r', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', WORKSPACE: 'infra/dns', ...env },
  })
  return { calls, written }
}

test('keys the cache on the hash of the lock file at this commit', async () => {
  const { calls, written } = await run({ 'GET /repos/{owner}/{repo}/contents/infra/dns/.terraform.lock.hcl': () => LOCK })
  assert.strictEqual(written.outputs.path, '/tmp/r/_github_home/.terraform.d/plugin-cache')
  assert.strictEqual(written.outputs.key, `terraform-github-tacos-providers-Linux-X64-${sha256(LOCK)}`)
  assert.strictEqual(calls[0].params.ref, 'abc')
})

test('finds the lock file of a workspace at the repository root', async () => {
  const { written } = await run({ 'GET /repos/{owner}/{repo}/contents/.terraform.lock.hcl': () => LOCK }, { WORKSPACE: '.' })
  assert.ok(written.outputs.key)
})

test('leaves the cache unkeyed without a lock file', async () => {
  const { written } = await run({ 'GET /repos/{owner}/{repo}/contents/infra/dns/.terraform.lock.hcl': () => { throw new HttpError(404, 'Not Found') } })
  assert.strictEqual(written.outputs.key, undefined)
  assert.ok(written.outputs.path)
})

test('leaves the cache unkeyed without a workspace', async () => {
  const { calls, written } = await run({}, { WORKSPACE: '' })
  assert.deepStrictEqual(calls, [])
  assert.strictEqual(written.outputs.key, undefined)
})

test('retries provider downloads unless the workflow already says how often', async () => {
  assert.strictEqual((await run({}, { WORKSPACE: '' })).written.variables.TF_PROVIDER_DOWNLOAD_RETRY, '5')
  assert.deepStrictEqual((await run({}, { WORKSPACE: '', TF_PROVIDER_DOWNLOAD_RETRY: '2' })).written.variables, {})
})
