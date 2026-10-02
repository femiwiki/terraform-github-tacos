// Shared by the step scripts.
import { existsSync, readFileSync, statSync } from 'node:fs'
import type * as Core from '@actions/core'

// The annotation the changes step leaves and the pending step looks for
export const MARKER = 'Changes to apply'

export type Counts = { create: number; update: number; delete: number; moved: number; imported: number }

type ResourceChange = {
  previous_address?: string
  change: { actions: string[]; importing?: object }
}

// Resource counts of a plan in JSON, such as `tofu show -json` writes
export const planCounts = (path: string | undefined): Counts => {
  const counts = { create: 0, update: 0, delete: 0, moved: 0, imported: 0 }
  if (!path || !existsSync(path)) {
    return counts
  }
  const plan = JSON.parse(readFileSync(path, 'utf8'))
  const changes: ResourceChange[] = plan.resource_changes ?? []
  for (const { previous_address, change } of changes) {
    if (change.actions.includes('create')) counts.create++
    if (change.actions.length === 1 && change.actions[0] === 'update') counts.update++
    if (change.actions.includes('delete')) counts.delete++
    if (previous_address) counts.moved++
    if (change.importing) counts.imported++
  }
  return counts
}

export const addCountsTable = (summary: typeof Core.summary, counts: Counts) => {
  const row = [counts.create, counts.update, counts.delete, counts.moved, counts.imported]
  summary.addRaw('| Add | Change | Destroy | Move | Import |\n|---|---|---|---|---|\n')
  summary.addRaw(`| ${row.join(' | ')} |\n\n`)
}

// A step summary may hold 1 MiB, and the plan shares it with the rest
const PLAN_TEXT_LIMIT = 900_000

// The plan as text, folded, and cut short of what a step summary may hold
export const addPlanText = (summary: typeof Core.summary, path: string | undefined) => {
  if (!path || !existsSync(path)) {
    return
  }
  const size = statSync(path).size
  let text = readFileSync(path).subarray(0, PLAN_TEXT_LIMIT).toString()
  if (!text.endsWith('\n')) {
    text += '\n'
  }
  summary.addRaw(`<details><summary>Plan</summary>\n\n\`\`\`\n${text}\`\`\`\n\n`)
  if (size > PLAN_TEXT_LIMIT) {
    summary.addRaw(`Cut at ${PLAN_TEXT_LIMIT} of ${size} bytes. The job log has the whole plan.\n\n`)
  }
  summary.addRaw('</details>\n\n')
}
