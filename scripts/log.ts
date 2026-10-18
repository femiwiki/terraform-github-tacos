// Run logs expire, so each apply's output goes on the pull request it applied.
import type * as Core from "@actions/core";
import type { GitHub } from "./merge.ts";

type Job = { id: number; name: string; conclusion: string | null };

// A comment holds 65,536 characters, and the header takes some of them
const LIMIT = 60_000;
// A job's log can take a few seconds to be readable after the job ends
const TRIES = 5;
const INTERVAL = 5_000;

// The output of the step that `uses` this action, without its folded groups
export const stepOutput = (log: string, uses: string) => {
	const lines = [];
	let inside = false;
	let group = false;
	for (let line of log.split("\n")) {
		line = line.replace(/^\S+Z /, "");
		if (line.startsWith("##[group]Run ")) {
			if (inside) break;
			if (line.startsWith(`##[group]Run ${uses}@`)) {
				inside = true;
				group = true;
				continue;
			}
		}
		if (!inside || line.startsWith("##[command]")) continue;
		if (line.startsWith("##[group]")) {
			group = true;
		} else if (line.startsWith("##[endgroup]")) {
			group = false;
		} else if (!group) {
			lines.push(line);
		}
	}
	return lines.join("\n").trimEnd();
};

export default async ({
	github,
	core,
	env,
	sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: {
	github: GitHub;
	core: typeof Core;
	env: NodeJS.ProcessEnv;
	sleep?: (ms: number) => Promise<unknown>;
}) => {
	const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
	const uses = env.LOG_STEP ?? "";

	// After the merge, the apply's pull request is the one that merged this commit
	let issue_number = Number(env.PR);
	if (!issue_number) {
		const pulls = await github.request(
			"GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls",
			{
				owner,
				repo,
				commit_sha: env.GITHUB_SHA,
			},
		);
		const merged = pulls.data.find(
			(p: { merged_at: string | null }) => p.merged_at,
		);
		if (!merged) {
			core.info(
				`No pull request merged ${env.GITHUB_SHA}, so there is nowhere to keep the logs.`,
			);
			return;
		}
		issue_number = merged.number;
	}

	const run = `${env.GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`;
	const jobs: Job[] = await github.paginate(
		"GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs",
		{
			owner,
			repo,
			run_id: Number(env.GITHUB_RUN_ID),
			attempt_number: Number(env.GITHUB_RUN_ATTEMPT),
		},
	);
	for (const job of jobs) {
		if (!job.name.endsWith(" apply")) continue;
		const workspace = job.name.slice(0, -" apply".length);

		let log: string | undefined;
		for (let i = 1; log === undefined; i++) {
			try {
				const { data } = await github.request(
					"GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs",
					{ owner, repo, job_id: job.id },
				);
				log = String(data);
			} catch (e) {
				if (i === TRIES) throw e;
				await sleep(INTERVAL);
			}
		}

		let text = stepOutput(log, uses);
		if (!text) {
			core.info(`${workspace}: ${uses} left no output.`);
			continue;
		}
		let note = "";
		if (text.length > LIMIT) {
			text = text.slice(-LIMIT).replace(/^.*\n/, "");
			note = ", the start cut to fit a comment";
		}
		// collapse finds this comment by how it starts
		const body =
			`**${workspace} apply: ${job.conclusion}** in [${env.GITHUB_WORKFLOW} #${env.GITHUB_RUN_NUMBER}](${run})${note}\n\n` +
			`<details><summary>Apply log</summary>\n\n\`\`\`\`\n${text}\n\`\`\`\`\n\n</details>`;
		await github.request(
			"POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
			{ owner, repo, issue_number, body },
		);
		core.info(`${workspace}: kept the apply log on #${issue_number}.`);
	}
};
