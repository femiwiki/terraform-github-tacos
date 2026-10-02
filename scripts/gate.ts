// One required check that stands for every job before it.
import type * as Core from '@actions/core'

type Needs = Record<string, { result: string }>

export default async ({ core, env }: { core: typeof Core; env: NodeJS.ProcessEnv }) => {
  if (!env.NEEDS) {
    core.setFailed('the gate step needs toJSON(needs)')
    return
  }
  const needs: Needs = JSON.parse(env.NEEDS)
  const maySkip = (env.MAY_SKIP ?? '').split(' ')

  const rows = []
  const failed = []
  for (const [job, { result }] of Object.entries(needs)) {
    rows.push([job, result])
    const passed = result === 'success' || (result === 'skipped' && maySkip.includes(job))
    if (!passed) {
      failed.push(`${job}=${result}`)
    }
  }

  await core.summary
    .addHeading('Gate', 3)
    .addTable([[{ data: 'Job', header: true }, { data: 'Result', header: true }], ...rows])
    .write()
  if (failed.length > 0) {
    core.setFailed(failed.join(' '))
    return
  }
  core.info('All green.')
}
