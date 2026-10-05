// After applying, whether or not it succeeded: what the apply did.
import { existsSync } from 'node:fs'
import type * as Core from '@actions/core'
import { addCountsTable, addPlanText, planCounts } from './common.ts'

// Returns the result rather than setting it, because github-script sets its
// own `result` output from what the script returns
export default async ({ core, env }: { core: typeof Core; env: NodeJS.ProcessEnv }) => {
  const workspace = env.WORKSPACE
  if (!workspace) {
    core.setFailed('the result step needs a workspace')
    return ''
  }
  const counts = planCounts(env.PLAN_JSON)
  const changed = counts.create + counts.update + counts.delete + counts.moved + counts.imported

  let result
  let line
  if (env.OUTCOME === 'success' && changed > 0) {
    result = 'applied'
    line = 'Applied.'
  } else if (env.OUTCOME === 'success') {
    result = 'no-changes'
    line = 'Nothing to apply.'
  } else if (env.OUTCOME === 'cancelled') {
    result = 'cancelled'
    line = '**Cancelled.**'
  } else if (env.OUTCOME === 'skipped') {
    result = 'skipped'
    line = 'Did not run, because an earlier step failed.'
  } else {
    result = 'failed'
    line = '**Failed.** Part of this plan may have been applied, and the job log says which.'
  }
  core.info(`${workspace}: ${result}`)

  core.summary.addRaw(`### ${workspace} apply\n\n${line}\n\n`)
  if (env.PLAN_JSON && existsSync(env.PLAN_JSON)) {
    addCountsTable(core.summary, counts)
  }
  addPlanText(core.summary, env.PLAN_TEXT)
  if (env.APPROVER) {
    core.summary.addRaw(`Approved by @${env.APPROVER}.\n`)
  }
  await core.summary.write()
  return result
}
