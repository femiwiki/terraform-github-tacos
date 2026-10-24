// Minimizes every plan and apply comment on a pull request but the newest of
// each workspace, so only the latest of each stays open.
import type * as Core from "@actions/core";

type Comment = {
	id: string;
	isMinimized: boolean;
	createdAt: string;
	body: string;
	author: { __typename: string } | null;
};
type Page = {
	repository: {
		pullRequest: {
			comments: {
				pageInfo: { hasNextPage: boolean; endCursor: string };
				nodes: Comment[];
			};
		};
	};
};
type GitHub = {
	graphql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
};

// dflook's plan comment names its path, and its workspace unless default.
// The apply comment starts with its workspace.
export const kind = (body: string) => {
	let m = body.match(
		/(?:OpenTofu|Terraform) plan in __([\w./-]+)__(?: in the __([\w-]+)__ workspace)?/,
	);
	if (m) return m[2] ? `plan ${m[1]} ${m[2]}` : `plan ${m[1]}`;
	m = body.match(/^\*\*([\w./-]+) apply: /);
	return m ? `apply ${m[1]}` : null;
};

export default async ({
	github,
	core,
	env,
}: {
	github: GitHub;
	core: typeof Core;
	env: NodeJS.ProcessEnv;
}) => {
	if (!env.PR) {
		core.info("Not a pull request, so there are no comments to collapse.");
		return;
	}
	const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
	const comments: Comment[] = [];
	let after: string | null = null;
	do {
		const { repository } = await github.graphql<Page>(
			`
      query($owner: String!, $repo: String!, $pr: Int!, $after: String) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pr) {
            comments(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { id isMinimized createdAt body author { __typename } }
            }
          }
        }
      }`,
			{ owner, repo, pr: Number(env.PR), after },
		);
		const page: Page["repository"]["pullRequest"]["comments"] =
			repository.pullRequest.comments;
		comments.push(...page.nodes);
		after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
	} while (after);

	const ours = comments.flatMap((c) => {
		const k = c.author?.__typename === "Bot" ? kind(c.body) : undefined;
		return k ? [{ c, k }] : [];
	});
	const newest = new Map<string, Comment>();
	for (const { c, k } of ours) {
		const seen = newest.get(k);
		if (!seen || seen.createdAt < c.createdAt) newest.set(k, c);
	}
	for (const { c, k } of ours) {
		if (c.isMinimized || newest.get(k) === c) continue;
		await github.graphql(
			`
      mutation($id: ID!) {
        minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) { clientMutationId }
      }`,
			{ id: c.id },
		);
		core.info(`Collapsed ${k} from ${c.createdAt}.`);
	}
};
