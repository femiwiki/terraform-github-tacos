// Which workspaces to apply, each behind an environment that asks first.
import type * as Core from "@actions/core";
import { MARKER, NOTHING, onPullRequest } from "./common.ts";
import type { GitHub } from "./merge.ts";

type Job = {
	id: number;
	name: string;
	status: string;
	run_attempt: number;
	started_at: string | null;
	completed_at?: string | null;
	runner_name?: string | null;
};

type Wait = {
	sleep: (ms: number) => Promise<unknown>;
	now: () => number;
};

// A job's annotations can be listed some seconds after the job completes, so a
// job without a verdict is read again until this long after it completed, or
// after pending started, whichever comes first
const SETTLE = 300_000;
const INTERVAL = 5_000;

export default async ({
	github,
	core,
	env,
	sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
	now = Date.now,
}: {
	github: Pick<GitHub, "request" | "paginate">;
	core: typeof Core;
	env: NodeJS.ProcessEnv;
} & Partial<Wait>) => {
	const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
	const runId = Number(env.GITHUB_RUN_ID);
	const attempt = Number(env.GITHUB_RUN_ATTEMPT);

	if (onPullRequest(env) && env.APPLY_BEFORE_MERGE !== "true") {
		core.info(
			`A pull request is applied after it merges, by the run for the push to ${env.DEFAULT_BRANCH}.`,
		);
		core.setOutput("workspaces", []);
		await core.summary
			.addRaw(
				`### To apply\n\nNothing to apply until the merge. The run for the push to \`${env.DEFAULT_BRANCH}\` applies it.\n`,
			)
			.write();
		return;
	}

	// Each push leaves a run behind, and one still waiting for approval would apply
	// a plan of a commit the branch no longer has at its head. The apply step
	// refuses that too; this keeps it from being offered at all.
	let branch: string | undefined;
	if (onPullRequest(env)) {
		branch = env.HEAD_REF;
	} else if (env.GITHUB_EVENT_NAME === "push") {
		branch = env.GITHUB_REF_NAME;
	}
	if (branch) {
		const { data: run } = await github.request<{ workflow_id: number }>(
			"GET /repos/{owner}/{repo}/actions/runs/{run_id}",
			{ owner, repo, run_id: runId },
		);
		const waiting = await github.paginate<{ id: number }>(
			"GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
			{
				owner,
				repo,
				workflow_id: run.workflow_id,
				event: env.GITHUB_EVENT_NAME,
				status: "waiting",
				branch,
				per_page: 100,
			},
		);
		for (const older of waiting.filter((r) => r.id < runId)) {
			const jobs = await github.paginate<Job>(
				"GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs",
				{
					owner,
					repo,
					run_id: older.id,
					per_page: 100,
				},
			);
			// A run waiting on one workspace may be applying another, and cancelling
			// it would stop that apply halfway
			if (jobs.some((j) => j.status === "in_progress")) {
				core.warning(
					`run ${older.id} waits on an older commit but is applying, so it is left alone`,
				);
				continue;
			}
			try {
				await github.request(
					"POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel",
					{ owner, repo, run_id: older.id },
				);
				core.info(`Cancelled run ${older.id}, which waited on an older commit`);
			} catch {
				core.warning(`could not cancel run ${older.id}`);
			}
		}
	}

	let workspaces: string[];
	if (env.WORKSPACES) {
		workspaces = JSON.parse(env.WORKSPACES);
	} else {
		const found = await annotated(
			github,
			core,
			owner,
			repo,
			runId,
			attempt,
			{ id: Number(env.CHECK_RUN_ID), runner: env.RUNNER_NAME },
			{ sleep, now },
		);
		if (!found) return;
		workspaces = found;
	}

	core.summary.addRaw("### To apply\n\n");
	if (workspaces.length === 0) {
		core.summary.addRaw("Nothing to apply.\n");
	} else {
		core.summary.addRaw("| Environment | Who can approve |\n|---|---|\n");
	}
	const stop = async (error: string, row: string) => {
		core.setFailed(error);
		await core.summary.addRaw(row).write();
	};
	// A job naming an environment that does not exist creates it without any
	// protection, and the apply would then run without asking anyone. Only a
	// workspace listed in auto-apply may go without required reviewers.
	const autoApply = (env.AUTO_APPLY ?? "").split(/\s+/);
	for (const w of workspaces) {
		let environment: Environment;
		try {
			environment = (
				await github.request<Environment>(
					"GET /repos/{owner}/{repo}/environments/{environment_name}",
					{
						owner,
						repo,
						environment_name: w,
					},
				)
			).data;
		} catch {
			return stop(
				`the ${w} environment does not exist, and the apply job would create it with nobody to approve.`,
				`| \`${w}\` | **no environment, so this run stops here** |\n`,
			);
		}
		const reviewers = reviewersOf(environment);
		if (autoApply.includes(w)) {
			if (reviewers) {
				core.warning(
					`${w} is listed in auto-apply, but its environment has required reviewers, so it waits for them.`,
				);
				core.summary.addRaw(`| \`${w}\` | ${reviewers} |\n`);
			} else {
				core.summary.addRaw(
					`| \`${w}\` | nobody, it applies automatically |\n`,
				);
			}
		} else if (!reviewers) {
			return stop(
				`the ${w} environment has no required reviewers, so nothing would stop its apply. List ${w} in auto-apply if it should apply without an approval.`,
				`| \`${w}\` | **nobody, so this run stops here** |\n`,
			);
		} else {
			core.summary.addRaw(`| \`${w}\` | ${reviewers} |\n`);
		}
	}
	await core.summary.write();
	core.setOutput("workspaces", workspaces);
	core.info(`Applying ${JSON.stringify(workspaces)}`);
};

type Environment = {
	protection_rules?: {
		type: string;
		reviewers?: { reviewer: { slug?: string; login?: string } }[];
	}[];
};

const reviewersOf = (environment: Environment) => {
	const names = [];
	for (const rule of environment.protection_rules ?? []) {
		if (rule.type !== "required_reviewers") continue;
		for (const { reviewer } of rule.reviewers ?? []) {
			names.push(reviewer.slug ?? reviewer.login);
		}
	}
	return names.join(", ");
};

// The workspaces whose changes step left the marker, read from every job of
// this run. "Re-run failed jobs" copies the other jobs into the new attempt
// without their annotations, so they are read from the attempt that ran each
// job. A copy keeps the name and start time of the job it came from.
const annotated = async (
	github: Pick<GitHub, "request" | "paginate">,
	core: typeof Core,
	owner: string,
	repo: string,
	runId: number,
	attempt: number,
	self: { id: number; runner: string | undefined },
	{ sleep, now }: Wait,
) => {
	const { data } = await github.request<{ run_started_at: string }>(
		"GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}",
		{
			owner,
			repo,
			run_id: runId,
			attempt_number: attempt,
		},
	);
	const started: string = data.run_started_at;

	// Each workspace a plan job plans or skips leaves one of the two verdicts.
	// A job without one either is no plan job or has not had its annotations
	// listed yet, and only time tells them apart. The jobs list can show a job
	// as running minutes after it completed, so that is no help.
	const begun = now();
	const read = new Set<number>();
	const found = new Set<string>();
	for (;;) {
		const jobs: Job[] = await github.paginate(
			"GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs",
			{
				owner,
				repo,
				run_id: runId,
				filter: "all",
				per_page: 100,
			},
		);
		const groups = new Map<string, Job[]>();
		for (const job of jobs) {
			const key = JSON.stringify([job.name, job.started_at]);
			groups.set(key, [...(groups.get(key) ?? []), job]);
		}
		const later: Job[] = [];
		for (const group of groups.values()) {
			if (!group.some((j) => j.run_attempt === attempt)) continue;
			const first = group.reduce((a, b) =>
				b.run_attempt < a.run_attempt ? b : a,
			);
			if (
				first.run_attempt === attempt &&
				first.started_at !== null &&
				first.started_at < started
			) {
				core.setFailed(
					`${first.name} was copied from an earlier attempt that is not listed, so its changes are unknown. Re-run all jobs.`,
				);
				return;
			}
			if (read.has(first.id)) continue;
			// This job, which runs pending, and which the list may not show running yet
			if (
				first.id === self.id ||
				(first.status !== "completed" &&
					self.runner &&
					first.runner_name === self.runner)
			)
				continue;
			const at = now();
			const annotations = await github.paginate<{
				annotation_level: string;
				title: string;
				message: string;
			}>("GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations", {
				owner,
				repo,
				check_run_id: first.id,
				per_page: 100,
			});
			const verdicts = annotations.filter(
				(a) =>
					a.annotation_level === "notice" &&
					(a.title === MARKER || a.title === NOTHING) &&
					a.message,
			);
			for (const a of verdicts) {
				if (a.title === MARKER) found.add(a.message);
			}
			const completed = Date.parse(first.completed_at ?? "");
			if (
				verdicts.length > 0 ||
				at - completed >= SETTLE ||
				at - begun >= SETTLE
			) {
				read.add(first.id);
			} else {
				later.push(first);
			}
		}
		if (later.length === 0) break;
		core.info(
			`Waiting for ${later.map((j) => j.name).join(", ")} to show what ${later.length === 1 ? "it" : "they"} planned`,
		);
		await sleep(INTERVAL);
	}
	return [...found].sort();
};
