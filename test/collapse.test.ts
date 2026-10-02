import { test } from 'node:test'
import assert from 'node:assert'
import collapse, { kind } from '../scripts/collapse.ts'
import { fakeCore } from './fake.ts'

const bot = { __typename: 'Bot' }
const user = { __typename: 'User' }
const comment = (id: string, createdAt: string, body: string, author: object | null = bot, isMinimized = false) =>
  ({ id, createdAt, body, author, isMinimized })

// Serves the comments in pages of two and keeps what was minimized
const fakeGitHub = (comments: object[]) => {
  const minimized: string[] = []
  const github = {
    async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      if (query.includes('minimizeComment')) {
        minimized.push(variables.id as string)
        return {} as T
      }
      const start = Number(variables.after ?? 0)
      const nodes = comments.slice(start, start + 2)
      const hasNextPage = start + 2 < comments.length
      return { repository: { pullRequest: { comments: { pageInfo: { hasNextPage, endCursor: String(start + 2) }, nodes } } } } as T
    },
  }
  return { github, minimized }
}

const run = async (comments: object[]) => {
  const { github, minimized } = fakeGitHub(comments)
  const { core } = fakeCore()
  await collapse({ github, core, env: { PR: '1', GITHUB_REPOSITORY: 'o/r' } })
  return minimized
}

const plan = (path: string) => `<!-- dflook/terraform-github-actions {} -->\nOpenTofu plan in __${path}__\n<details open>`
const apply = (workspace: string) => `**${workspace} apply: success** in [tofu #1](https://example.com)`

test('names plan and apply comments by workspace', () => {
  assert.strictEqual(kind(plan('dns')), 'plan dns')
  assert.strictEqual(kind('Terraform plan in __infra/dns__ in the __prod__ workspace'), 'plan infra/dns prod')
  assert.strictEqual(kind(apply('dns')), 'apply dns')
  assert.strictEqual(kind('Looks good to me'), null)
})

test('collapses all but the newest of each workspace, across pages', async () => {
  const minimized = await run([
    comment('a', '2026-10-01T00:00:00Z', plan('dns')),
    comment('b', '2026-10-01T00:00:00Z', plan('network')),
    comment('c', '2026-10-02T00:00:00Z', plan('dns')),
    comment('d', '2026-10-02T00:00:00Z', apply('dns')),
    comment('e', '2026-10-03T00:00:00Z', apply('dns')),
  ])
  assert.deepStrictEqual(minimized, ['a', 'd'])
})

test('leaves people and collapsed comments alone', async () => {
  const minimized = await run([
    comment('a', '2026-10-01T00:00:00Z', plan('dns'), user),
    comment('b', '2026-10-01T00:00:00Z', plan('dns'), bot, true),
    comment('c', '2026-10-02T00:00:00Z', plan('dns'), null),
    comment('d', '2026-10-03T00:00:00Z', plan('dns')),
  ])
  assert.deepStrictEqual(minimized, [])
})

test('does nothing outside a pull request', async () => {
  const { github, minimized } = fakeGitHub([])
  const { core } = fakeCore()
  await collapse({ github, core, env: {} })
  assert.deepStrictEqual(minimized, [])
})
