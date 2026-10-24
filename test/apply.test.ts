import assert from "node:assert";
import { test } from "node:test";
import apply from "../scripts/apply.ts";
import { fakeCore } from "./fake.ts";
import { type Args, fakeGitHub, HttpError } from "./github.ts";

const APPROVALS = "GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals";
const PULL = "GET /repos/{owner}/{repo}/pulls/{pull_number}";
const COMPARE = "GET /repos/{owner}/{repo}/compare/{basehead}";
const COMMIT = "GET /repos/{owner}/{repo}/commits/{ref}";

type Routes = Record<string, (p: Args) => unknown>;
const routes = (more: Routes = {}): Routes => ({
	[APPROVALS]: () => [{ state: "approved", user: { login: "someone" } }],
	[PULL]: () => ({ merged: false, head: { sha: "h" }, base: { ref: "main" } }),
	[COMPARE]: () => ({ behind_by: 0 }),
	[COMMIT]: () => ({ sha: "h" }),
	...more,
});

const run = async (r: Routes, env: Record<string, string> = {}) => {
	const { github, calls } = fakeGitHub(r);
	const { core, written } = fakeCore();
	await apply({
		github,
		core,
		env: {
			GITHUB_EVENT_NAME: "pull_request",
			GITHUB_REPOSITORY: "o/r",
			GITHUB_RUN_ID: "1",
			GITHUB_ACTOR: "starter",
			GITHUB_REF_NAME: "main",
			GITHUB_SHA: "h",
			PR: "5",
			PLANNED: "h",
			DEFAULT_BRANCH: "main",
			APPLY_BEFORE_MERGE: "true",
			WORKSPACE: "dns",
			...env,
		},
	});
	return { calls: calls.map((c) => c.route), written };
};

test("applies the pull request it planned and names the approver", async () => {
	const { written } = await run(routes());
	assert.strictEqual(written.failed, undefined);
	assert.strictEqual(written.outputs.approver, "someone");
	assert.match(
		written.summary(),
		/### dns approval\n\nApproved by @someone for #5 at `h`\./,
	);
});

test("refuses a pull request without apply-before-merge", async () => {
	const { calls, written } = await run(routes(), { APPLY_BEFORE_MERGE: "" });
	assert.deepStrictEqual(calls, []);
	assert.match(written.failed!, /is applied after it merges/);
});

test("names the person who started the run when nobody approved", async () => {
	const { written } = await run(
		routes({
			[APPROVALS]: () => {
				throw new HttpError(403, "no");
			},
		}),
	);
	assert.strictEqual(written.outputs.approver, "starter");
	assert.match(
		written.summary(),
		/Applied without an approval, in a run @starter started, for #5/,
	);
});

test("refuses a merged pull request", async () => {
	const { written } = await run(
		routes({
			[PULL]: () => ({
				merged: true,
				head: { sha: "h" },
				base: { ref: "main" },
			}),
		}),
	);
	assert.match(written.failed!, /^#5 has merged/);
});

test("refuses a pull request that moved since the plan", async () => {
	const { written } = await run(
		routes({
			[PULL]: () => ({
				merged: false,
				head: { sha: "new" },
				base: { ref: "main" },
			}),
		}),
	);
	assert.match(written.failed!, /^#5 is at new now, not h/);
});

test("refuses a pull request on another branch outside a native stack", async () => {
	const { written } = await run(
		routes({
			[PULL]: () => ({
				merged: false,
				head: { sha: "h" },
				base: { ref: "below" },
			}),
		}),
	);
	assert.match(written.failed!, /^#5 targets below rather than main/);
});

test("applies a pull request in a native stack on the default branch", async () => {
	const pr = {
		merged: false,
		head: { sha: "h" },
		base: { ref: "below" },
		stack: { base: { ref: "main" } },
	};
	const { written } = await run(routes({ [PULL]: () => pr }));
	assert.strictEqual(written.failed, undefined);
});

test("with require-up-to-date, refuses a pull request behind its base", async () => {
	const { written } = await run(
		routes({ [COMPARE]: () => ({ behind_by: 1 }) }),
		{ REQUIRE_UP_TO_DATE: "true" },
	);
	assert.match(written.failed!, /behind main.*then approve the new run\.$/);
});

test("on a push, refuses a commit that is no longer the head", async () => {
	const { written } = await run(
		routes({ [COMMIT]: () => ({ sha: "newer" }) }),
		{ GITHUB_EVENT_NAME: "push", PR: "", PLANNED: "" },
	);
	assert.match(written.failed!, /^main is at newer now, not h/);
});

test("on a push, applies the head and says so in the summary", async () => {
	const { written } = await run(routes(), {
		GITHUB_EVENT_NAME: "push",
		PR: "",
		PLANNED: "",
	});
	assert.strictEqual(written.failed, undefined);
	assert.match(written.summary(), /Approved by @someone for main at `h`\./);
});
