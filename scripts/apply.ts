// Before applying. Approval can come long after the plan, so check again what
// the plan step checked, and record who approved. An auto-apply workspace has
// no approval, and the person who started the run stands in.
import type * as Core from "@actions/core";
import { behind, onPullRequest, STACK_API } from "./common.ts";
import type { GitHub } from "./merge.ts";

export default async ({
	github,
	core,
	env,
}: {
	github: Pick<GitHub, "request">;
	core: typeof Core;
	env: NodeJS.ProcessEnv;
}) => {
	const onPr = onPullRequest(env);
	const defaultBranch = env.DEFAULT_BRANCH;
	if (onPr && env.APPLY_BEFORE_MERGE !== "true") {
		core.setFailed(
			`#${env.PR} is applied after it merges, by the run for the push to ${defaultBranch}. Run the apply job on push rather than pull_request, or set apply-before-merge to "true" on the pending, apply and merge steps to apply before the merge.`,
		);
		return;
	}
	const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");

	let approved: string | undefined;
	try {
		const { data: approvals } = await github.request(
			"GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals",
			{
				owner,
				repo,
				run_id: Number(env.GITHUB_RUN_ID),
			},
		);
		approved = approvals
			.filter((a: { state: string }) => a.state === "approved")
			.at(-1)?.user.login;
	} catch {
		// Without the approvals, the person who started the run is named instead
	}
	const approver = approved ?? env.GITHUB_ACTOR;
	core.setOutput("approver", approver);

	let subject = env.GITHUB_REF_NAME;
	if (onPr) {
		subject = `#${env.PR}`;
		const { data: pr } = await github.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}",
			{
				owner,
				repo,
				pull_number: Number(env.PR),
				headers: STACK_API,
			},
		);
		if (pr.merged) {
			core.setFailed(
				`#${env.PR} has merged, so there is no pull request left to apply. Apply ${defaultBranch} with workflow_dispatch instead.`,
			);
			return;
		}
		const head: string = pr.head.sha;
		if (head !== env.PLANNED) {
			core.setFailed(
				`#${env.PR} is at ${head} now, not ${env.PLANNED}, which this run planned. Approve the run for ${head} instead.`,
			);
			return;
		}
		// A native stack merges into its base all at once, and pending has checked
		// that applying from this pull request is safe
		const base: string = pr.stack?.base.ref ?? pr.base.ref;
		if (base !== defaultBranch) {
			core.setFailed(
				`#${env.PR} targets ${base} rather than ${defaultBranch}, outside a native stack. An apply runs before the merge, so a plan from a stacked branch carries whatever is below it. Merge the branch underneath first, retarget this one at ${defaultBranch}, then plan again.`,
			);
			return;
		}
		if (env.REQUIRE_UP_TO_DATE === "true") {
			const why = await behind(github, env, base, head, "approve the new run");
			if (why) {
				core.setFailed(why);
				return;
			}
			core.info(`Still ${env.PLANNED}, up to date with ${base}.`);
		} else {
			core.info(`Still ${env.PLANNED}.`);
		}
	} else if (env.GITHUB_EVENT_NAME === "push") {
		// Only the newest commit applies, since its plan carries every older one's
		// changes; pending cancels the older runs that wait
		const { data: commit } = await github.request(
			"GET /repos/{owner}/{repo}/commits/{ref}",
			{
				owner,
				repo,
				ref: env.GITHUB_REF_NAME,
			},
		);
		if (commit.sha !== env.GITHUB_SHA) {
			core.setFailed(
				`${env.GITHUB_REF_NAME} is at ${commit.sha} now, not ${env.GITHUB_SHA}, which this run planned. Approve the run for ${commit.sha} instead.`,
			);
			return;
		}
		core.info(`Still the head of ${env.GITHUB_REF_NAME}, ${env.GITHUB_SHA}.`);
	}

	const line = approved
		? `Approved by @${approver}`
		: `Applied without an approval, in a run @${approver} started,`;
	await core.summary
		.addRaw(
			`### ${env.WORKSPACE || "Apply"} approval\n\n${line} for ${subject} at \`${env.PLANNED || env.GITHUB_SHA}\`.\n`,
		)
		.write();
};
