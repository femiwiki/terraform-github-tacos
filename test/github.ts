// Stands in for the octokit that github-script passes, answering each route
// from a handler and keeping what was called.
import type { GitHub } from "../scripts/merge.ts";

export type Args = Record<string, string | number>;
type Handler = (params: Args) => unknown;
export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export const fakeGitHub = (routes: Record<string, Handler>) => {
	const calls: { route: string; params: Record<string, unknown> }[] = [];
	const answer = async (
		route: string,
		params: Record<string, unknown> = {},
	) => {
		calls.push({ route, params });
		const handler = routes[route];
		if (!handler) throw new Error(`unexpected ${route}`);
		return handler(params as Args);
	};
	const github: GitHub = {
		async request<T>(route: string, params?: Record<string, unknown>) {
			return { status: 200, data: (await answer(route, params)) as T };
		},
		async paginate<T>(route: string, params?: Record<string, unknown>) {
			return (await answer(route, params)) as T[];
		},
		async graphql(query, variables) {
			return answer(
				query.includes("markPullRequestReadyForReview") ? "ready" : query,
				variables,
			);
		},
	};
	return { github, calls };
};
