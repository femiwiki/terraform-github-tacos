// Stands in for the octokit that github-script passes, answering each route
// from a handler and keeping what was called.
import type { GitHub } from '../scripts/merge.ts'

type Handler = (params: Record<string, any>) => unknown
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const fakeGitHub = (routes: Record<string, Handler>) => {
  const calls: { route: string; params: Record<string, any> }[] = []
  const answer = async (route: string, params: Record<string, any> = {}) => {
    calls.push({ route, params })
    const handler = routes[route]
    if (!handler) throw new Error(`unexpected ${route}`)
    return handler(params)
  }
  const github: GitHub = {
    async request(route, params) {
      return { status: 200, data: await answer(route, params) }
    },
    async paginate(route, params) {
      return (await answer(route, params)) as any[]
    },
    async graphql(query, variables) {
      return answer(query.includes('markPullRequestReadyForReview') ? 'ready' : query, variables)
    },
  }
  return { github, calls }
}
