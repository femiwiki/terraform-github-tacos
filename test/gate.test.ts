import { test } from 'node:test'
import assert from 'node:assert'
import gate from '../scripts/gate.ts'
import { fakeCore } from './fake.ts'

const run = async (needs: object, maySkip = 'apply') => {
  const { core, written } = fakeCore()
  await gate({ core, env: { NEEDS: JSON.stringify(needs), MAY_SKIP: maySkip } })
  return written
}

test('passes when every job succeeded', async () => {
  const written = await run({ plan: { result: 'success' }, apply: { result: 'success' } })
  assert.strictEqual(written.failed, undefined)
})

test('passes when a job that may be skipped was skipped', async () => {
  const written = await run({ plan: { result: 'success' }, apply: { result: 'skipped' } })
  assert.strictEqual(written.failed, undefined)
})

test('fails when any other job was skipped', async () => {
  const written = await run({ plan: { result: 'skipped' }, apply: { result: 'success' } })
  assert.strictEqual(written.failed, 'plan=skipped')
})

test('fails naming every job that did not succeed', async () => {
  const written = await run({ plan: { result: 'failure' }, pending: { result: 'cancelled' } })
  assert.strictEqual(written.failed, 'plan=failure pending=cancelled')
})

test('lists every job in the summary', async () => {
  const written = await run({ plan: { result: 'success' }, apply: { result: 'skipped' } })
  assert.match(written.summary(), /<td>plan<\/td><td>success<\/td>.*<td>apply<\/td><td>skipped<\/td>/s)
})

test('fails without needs', async () => {
  const { core, written } = fakeCore()
  await gate({ core, env: { MAY_SKIP: 'apply' } })
  assert.strictEqual(written.failed, 'the gate step needs toJSON(needs)')
})
