import { test } from 'node:test'
import assert from 'node:assert'
import changes from '../scripts/changes.ts'
import { MARKER } from '../scripts/common.ts'
import { fakeCore, tempFile } from './fake.ts'

const plan = (...resourceChanges: object[]) => tempFile(JSON.stringify({ resource_changes: resourceChanges }))
const create = { change: { actions: ['create'] } }
const moved = { previous_address: 'old.a', change: { actions: ['no-op'] } }

const run = async (env: NodeJS.ProcessEnv) => {
  const { core, written } = fakeCore()
  await changes({ core, env: { WORKSPACE: 'dns', ...env } })
  return written
}

test('a plan with changes leaves the marker, and no claim about approval', async () => {
  const written = await run({ CHANGES: 'true', PLAN_JSON: plan(create) })
  assert.strictEqual(written.outputs.apply, true)
  assert.deepStrictEqual(written.notices, [{ message: 'dns', title: MARKER }])
  assert.match(written.summary(), /\| 1 \| 0 \| 0 \| 0 \| 0 \|/)
  assert.match(written.summary(), /Changes to apply\./)
  assert.doesNotMatch(written.summary(), /[Ww]ait/)
})

test('an empty plan has nothing to apply', async () => {
  const written = await run({ CHANGES: 'false', PLAN_JSON: plan() })
  assert.strictEqual(written.outputs.apply, false)
  assert.deepStrictEqual(written.notices, [])
  assert.match(written.summary(), /Nothing to apply\./)
})

test('a plan that only moves resources still has something to apply', async () => {
  const written = await run({ CHANGES: 'false', PLAN_JSON: plan(moved) })
  assert.strictEqual(written.outputs.apply, true)
})

test('shows the plan text folded', async () => {
  const written = await run({ CHANGES: 'true', PLAN_TEXT: tempFile('+ resource "a" "b"') })
  assert.match(written.summary(), /<details><summary>Plan<\/summary>\n\n```\n\+ resource "a" "b"\n```/)
})

test('fails without a workspace', async () => {
  const written = await run({ WORKSPACE: '' })
  assert.strictEqual(written.failed, 'the changes step needs a workspace')
})
