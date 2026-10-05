// Stands in for the `core` that github-script passes, keeping what the steps
// write. The summary is the real one, writing to a temporary file. It keeps
// the path it first wrote to, so every test shares one file, emptied each time.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Core from '@actions/core'

const file = join(mkdtempSync(join(tmpdir(), 'tacos-')), 'summary.md')
process.env.GITHUB_STEP_SUMMARY = file

export const fakeCore = () => {
  writeFileSync(file, '')
  Core.summary.emptyBuffer()

  const written = {
    failed: undefined as string | undefined,
    notices: [] as { message: string; title?: string }[],
    outputs: {} as Record<string, unknown>,
    summary: () => readFileSync(file, 'utf8'),
  }
  const core = {
    summary: Core.summary,
    setFailed(message: string) {
      written.failed = message
    },
    notice(message: string, properties: { title?: string } = {}) {
      written.notices.push({ message, title: properties.title })
    },
    setOutput(name: string, value: unknown) {
      written.outputs[name] = value
    },
    info() {},
  }
  // Only the parts the steps use are here
  return { core: core as unknown as typeof Core, written }
}

// Writes a file the steps read, such as a plan, and returns its path
export const tempFile = (content: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'tacos-')), 'file')
  writeFileSync(path, content)
  return path
}
