// After planning: whether anything is left to apply, left where pending finds it.
import type * as Core from '@actions/core'
import { MARKER, addCountsTable, addPlanText, planCounts } from './common.ts'

export default async ({ core, env }: { core: typeof Core; env: NodeJS.ProcessEnv }) => {
  const workspace = env.WORKSPACE
  if (!workspace) {
    core.setFailed('the changes step needs a workspace')
    return
  }
  const counts = planCounts(env.PLAN_JSON)
  // A plan that only moves or imports resources can still count as having no changes
  const apply = env.CHANGES === 'true' || counts.moved + counts.imported > 0
  if (apply) {
    // A matrix job has one set of outputs for all of its legs, so pending reads
    // this annotation from each leg's check run instead
    core.notice(workspace, { title: MARKER })
    core.info(`The plan has changes for ${workspace} to apply.`)
  } else {
    core.info('The plan is empty.')
  }
  core.setOutput('apply', apply)

  core.summary.addRaw(`### ${workspace} plan\n\n`)
  addCountsTable(core.summary, counts)
  addPlanText(core.summary, env.PLAN_TEXT)
  if (apply) {
    // Whether and for whom it waits is pending's to say, which knows auto-apply and apply-before-merge
    core.summary.addRaw('Changes to apply. The run\'s To apply summary says who approves them, and when.\n')
  } else {
    core.summary.addRaw('Nothing to apply.\n')
  }
  await core.summary.write()
}
