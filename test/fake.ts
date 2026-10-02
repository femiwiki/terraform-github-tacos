// Stands in for the `core` that github-script passes, keeping what the steps write.
import type * as Core from '@actions/core'

export const fakeCore = () => {
  const written = {
    headings: [] as string[],
    tables: [] as unknown[][][],
    failed: undefined as string | undefined,
  }
  const summary = {
    addHeading(text: string) {
      written.headings.push(text)
      return summary
    },
    addTable(rows: unknown[][]) {
      written.tables.push(rows)
      return summary
    },
    async write() {
      return summary
    },
  }
  const core = {
    summary,
    setFailed(message: string) {
      written.failed = message
    },
    info() {},
  }
  // Only the parts the steps use are here
  return { core: core as unknown as typeof Core, written }
}
