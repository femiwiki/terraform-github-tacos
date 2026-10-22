import assert from "node:assert";
import { test } from "node:test";
import { MARKER, NOTHING } from "../scripts/common.ts";
import pending from "../scripts/pending.ts";
import { fakeCore } from "./fake.ts";
import { fakeGitHub, HttpError } from "./github.ts";

const RUN = "GET /repos/{owner}/{repo}/actions/runs/{run_id}";
const WAITING =
	"GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs";
const JOBS = "GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs";
const CANCEL = "POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel";
const ATTEMPT =
	"GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}";
const ANNOTATIONS =
	"GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations";
const ENVIRONMENT = "GET /repos/{owner}/{repo}/environments/{environment_name}";

const reviewed = {
	protection_rules: [
		{
			type: "required_reviewers",
			reviewers: [{ reviewer: { slug: "pager" } }],
		},
	],
};
const unprotected = { protection_rules: [] };

type Routes = Record<string, (p: Record<string, any>) => unknown>;
const routes = (more: Routes = {}): Routes => ({
	[RUN]: () => ({ workflow_id: 7 }),
	[WAITING]: () => [],
	[JOBS]: () => [],
	[CANCEL]: () => ({}),
	[ATTEMPT]: () => ({ run_started_at: "2026-10-13T10:00:00Z" }),
	[ANNOTATIONS]: () => [],
	[ENVIRONMENT]: () => reviewed,
	...more,
});

const run = async (
	r: Routes,
	env: Record<string, string> = {},
	clock = { now: 0, slept: [] as number[] },
) => {
	const { github, calls } = fakeGitHub(r);
	const { core, written } = fakeCore();
	await pending({
		github,
		core,
		now: () => clock.now,
		sleep: async (ms) => {
			clock.slept.push(ms);
			clock.now += ms;
		},
		env: {
			GITHUB_EVENT_NAME: "pull_request",
			GITHUB_REPOSITORY: "o/r",
			GITHUB_RUN_ID: "10",
			GITHUB_RUN_ATTEMPT: "1",
			HEAD_REF: "feature",
			DEFAULT_BRANCH: "main",
			APPLY_BEFORE_MERGE: "true",
			...env,
		},
	});
	return { calls, written };
};

test("a pull request applied after the merge has nothing to apply", async () => {
	const { calls, written } = await run(routes(), { APPLY_BEFORE_MERGE: "" });
	assert.deepStrictEqual(calls, []);
	assert.deepStrictEqual(written.outputs.workspaces, []);
	assert.match(written.summary(), /Nothing to apply until the merge/);
});

test("lists the given workspaces with who can approve them", async () => {
	const { written } = await run(routes(), { WORKSPACES: '["dns"]' });
	assert.strictEqual(written.failed, undefined);
	assert.deepStrictEqual(written.outputs.workspaces, ["dns"]);
	assert.match(written.summary(), /\| `dns` \| pager \|/);
});

test("cancels older runs of the branch that wait, but not one that is applying", async () => {
	const jobs: Record<number, object[]> = {
		8: [{ status: "waiting" }],
		9: [{ status: "in_progress" }],
	};
	const { calls, written } = await run(
		routes({
			[WAITING]: () => [{ id: 8 }, { id: 9 }, { id: 11 }],
			[JOBS]: (p) => jobs[p.run_id],
		}),
		{ WORKSPACES: "[]" },
	);
	const cancelled = calls
		.filter((c) => c.route === CANCEL)
		.map((c) => c.params.run_id);
	assert.deepStrictEqual(cancelled, [8]);
	assert.match(written.warnings[0], /run 9 .* is applying/);
	assert.strictEqual(
		calls.find((c) => c.route === WAITING)!.params.branch,
		"feature",
	);
});

test("finds workspaces from the changes annotations of this run", async () => {
	const annotations: Record<number, object[]> = {
		1: [{ annotation_level: "notice", title: MARKER, message: "network" }],
		2: [
			{ annotation_level: "notice", title: MARKER, message: "dns" },
			{ annotation_level: "warning", title: MARKER, message: "x" },
		],
		3: [{ annotation_level: "notice", title: "Other", message: "y" }],
	};
	const { written } = await run(
		routes({
			[JOBS]: () => [
				{
					id: 1,
					name: "network changes",
					status: "completed",
					run_attempt: 1,
					started_at: "2026-10-13T10:01:00Z",
				},
				{
					id: 2,
					name: "dns changes",
					status: "completed",
					run_attempt: 1,
					started_at: "2026-10-13T10:01:00Z",
				},
				{
					id: 3,
					name: "other",
					status: "completed",
					run_attempt: 1,
					started_at: "2026-10-13T10:01:00Z",
				},
			],
			[ANNOTATIONS]: (p) => annotations[p.check_run_id],
		}),
	);
	assert.deepStrictEqual(written.outputs.workspaces, ["dns", "network"]);
});

const COMPLETED = "2026-10-22T14:27:32Z";
const planJob = (id: number, name: string) => ({
	id,
	name,
	status: "completed",
	run_attempt: 1,
	started_at: "2026-10-22T14:25:48Z",
	completed_at: COMPLETED,
});

test("reads a just completed job again until its verdict is listed", async () => {
	let reads = 0;
	const clock = { now: Date.parse(COMPLETED) + 6_000, slept: [] as number[] };
	const { written } = await run(
		routes({
			[JOBS]: () => [planJob(1, "aws plan"), planJob(2, "dns plan")],
			[ANNOTATIONS]: (p) => {
				if (p.check_run_id === 2)
					return [
						{ annotation_level: "notice", title: NOTHING, message: "dns" },
					];
				reads++;
				return reads < 3
					? []
					: [{ annotation_level: "notice", title: MARKER, message: "aws" }];
			},
		}),
		{},
		clock,
	);
	assert.strictEqual(written.failed, undefined);
	assert.deepStrictEqual(written.outputs.workspaces, ["aws"]);
	assert.strictEqual(clock.slept.length, 2);
});

test("stops waiting on a job without a verdict once it has settled", async () => {
	const clock = { now: Date.parse(COMPLETED) + 6_000, slept: [] as number[] };
	const { written } = await run(
		routes({
			[JOBS]: () => [planJob(1, "lint")],
			[ANNOTATIONS]: () => [],
		}),
		{},
		clock,
	);
	assert.deepStrictEqual(written.outputs.workspaces, []);
	assert.ok(clock.now - Date.parse(COMPLETED) >= 120_000);
	assert.ok(clock.now - Date.parse(COMPLETED) < 130_000);
});

test("does not wait on a job that completed long ago", async () => {
	const clock = { now: Date.parse(COMPLETED) + 600_000, slept: [] as number[] };
	await run(
		routes({
			[JOBS]: () => [planJob(1, "lint")],
			[ANNOTATIONS]: () => [],
		}),
		{},
		clock,
	);
	assert.deepStrictEqual(clock.slept, []);
});

test("waits for a job GitHub has not yet listed as completed", async () => {
	let lists = 0;
	const clock = { now: Date.parse(COMPLETED) + 6_000, slept: [] as number[] };
	const { written } = await run(
		routes({
			[JOBS]: () => {
				lists++;
				return [
					lists < 3
						? {
								...planJob(1, "aws plan"),
								status: "queued",
								completed_at: null,
							}
						: planJob(1, "aws plan"),
					{
						...planJob(2, "pending"),
						status: "in_progress",
						completed_at: null,
						runner_name: "runner 7",
					},
				];
			},
			[ANNOTATIONS]: () => [
				{ annotation_level: "notice", title: MARKER, message: "aws" },
			],
		}),
		{ RUNNER_NAME: "runner 7" },
		clock,
	);
	assert.strictEqual(written.failed, undefined);
	assert.deepStrictEqual(written.outputs.workspaces, ["aws"]);
	assert.strictEqual(clock.slept.length, 2);
});

test("does not wait on its own job, even listed as queued", async () => {
	const clock = { now: Date.parse(COMPLETED), slept: [] as number[] };
	const { written } = await run(
		routes({
			[JOBS]: () => [
				{ ...planJob(3, "annotated"), status: "queued", completed_at: null },
			],
		}),
		{ CHECK_RUN_ID: "3" },
		clock,
	);
	assert.strictEqual(written.failed, undefined);
	assert.deepStrictEqual(clock.slept, []);
});

test("fails when a job is never listed as completed", async () => {
	const clock = { now: Date.parse(COMPLETED), slept: [] as number[] };
	const { written } = await run(
		routes({
			[JOBS]: () => [
				{
					...planJob(1, "preview changes"),
					status: "queued",
					completed_at: null,
				},
			],
		}),
		{},
		clock,
	);
	assert.match(
		written.failed!,
		/^preview changes is still not listed as completed/,
	);
	assert.strictEqual(written.outputs.workspaces, undefined);
});

test("reads a job copied into a re-run from the attempt that ran it", async () => {
	const { calls } = await run(
		routes({
			[JOBS]: () => [
				{
					id: 1,
					name: "dns changes",
					status: "completed",
					run_attempt: 1,
					started_at: "2026-10-13T10:01:00Z",
				},
				{
					id: 4,
					name: "dns changes",
					status: "completed",
					run_attempt: 2,
					started_at: "2026-10-13T10:01:00Z",
				},
			],
			[ATTEMPT]: () => ({ run_started_at: "2026-10-13T11:00:00Z" }),
		}),
		{ GITHUB_RUN_ATTEMPT: "2" },
	);
	assert.deepStrictEqual(
		calls
			.filter((c) => c.route === ANNOTATIONS)
			.map((c) => c.params.check_run_id),
		[1],
	);
});

test("fails when a copied job came from an attempt that is not listed", async () => {
	const { written } = await run(
		routes({
			[JOBS]: () => [
				{
					id: 4,
					name: "dns changes",
					status: "completed",
					run_attempt: 2,
					started_at: "2026-10-13T10:01:00Z",
				},
			],
			[ATTEMPT]: () => ({ run_started_at: "2026-10-13T11:00:00Z" }),
		}),
		{ GITHUB_RUN_ATTEMPT: "2" },
	);
	assert.match(
		written.failed!,
		/^dns changes was copied from an earlier attempt/,
	);
});

test("stops at an environment that does not exist", async () => {
	const { written } = await run(
		routes({
			[ENVIRONMENT]: () => {
				throw new HttpError(404, "Not Found");
			},
		}),
		{ WORKSPACES: '["dns"]' },
	);
	assert.match(written.failed!, /the dns environment does not exist/);
	assert.match(written.summary(), /no environment, so this run stops here/);
	assert.strictEqual(written.outputs.workspaces, undefined);
});

test("stops at an environment without required reviewers", async () => {
	const { written } = await run(routes({ [ENVIRONMENT]: () => unprotected }), {
		WORKSPACES: '["dns"]',
	});
	assert.match(written.failed!, /has no required reviewers/);
});

test("lets an auto-apply workspace through without reviewers", async () => {
	const { written } = await run(routes({ [ENVIRONMENT]: () => unprotected }), {
		WORKSPACES: '["dns"]',
		AUTO_APPLY: "network dns",
	});
	assert.strictEqual(written.failed, undefined);
	assert.match(
		written.summary(),
		/\| `dns` \| nobody, it applies automatically \|/,
	);
});

test("warns when an auto-apply workspace has reviewers anyway", async () => {
	const { written } = await run(routes(), {
		WORKSPACES: '["dns"]',
		AUTO_APPLY: "dns",
	});
	assert.match(written.warnings[0], /dns is listed in auto-apply/);
	assert.match(written.summary(), /\| `dns` \| pager \|/);
});

test("an empty list has nothing to apply", async () => {
	const { written } = await run(routes(), { WORKSPACES: "[]" });
	assert.deepStrictEqual(written.outputs.workspaces, []);
	assert.match(written.summary(), /### To apply\n\nNothing to apply\./);
});
