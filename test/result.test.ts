import { test } from 'node:test'
import assert from 'node:assert'
import result from '../scripts/result.ts'
import { fakeCore, tempFile } from './fake.ts'

const plan = (...resourceChanges: object[]) => tempFile(JSON.stringify({ resource_changes: resourceChanges }))
const update = { change: { actions: ['update'] } }

const run = async (env: NodeJS.ProcessEnv) => {
  const { core, written } = fakeCore()
  const returned = await result({ core, env: { WORKSPACE: 'dns', ...env } })
  return { returned, written }
}

test('a successful apply with changes is applied', async () => {
  const { returned, written } = await run({ OUTCOME: 'success', PLAN_JSON: plan(update), APPROVER: 'someone' })
  assert.strictEqual(returned, 'applied')
  assert.match(written.summary(), /### dns apply\n\nApplied\./)
  assert.match(written.summary(), /\| 0 \| 1 \| 0 \| 0 \| 0 \|/)
  assert.match(written.summary(), /Approved by @someone\./)
})

test('a successful apply without changes has no changes', async () => {
  const { returned } = await run({ OUTCOME: 'success', PLAN_JSON: plan() })
  assert.strictEqual(returned, 'no-changes')
})

test('the other outcomes', async () => {
  assert.strictEqual((await run({ OUTCOME: 'cancelled' })).returned, 'cancelled')
  assert.strictEqual((await run({ OUTCOME: 'skipped' })).returned, 'skipped')
  assert.strictEqual((await run({ OUTCOME: 'failure' })).returned, 'failed')
})

test('leaves out the counts without a plan', async () => {
  const { written } = await run({ OUTCOME: 'failure' })
  assert.doesNotMatch(written.summary(), /\| Add \|/)
})

test('cuts a plan text too long for the summary', async () => {
  const { written } = await run({ OUTCOME: 'success', PLAN_TEXT: tempFile('x'.repeat(900_001)) })
  assert.match(written.summary(), /Cut at 900000 of 900001 bytes\./)
})
