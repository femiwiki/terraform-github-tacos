// Shared by the step scripts.
import { existsSync, readFileSync, statSync } from "node:fs";
import type * as Core from "@actions/core";
import type { GitHub } from "./merge.ts";

// The annotations the changes step leaves and the pending step looks for, one
// of the two for each workspace it plans
export const MARKER = "Changes to apply";
export const NOTHING = "Nothing to apply";

export type Counts = {
	create: number;
	update: number;
	delete: number;
	moved: number;
	imported: number;
};

type ResourceChange = {
	previous_address?: string;
	change: { actions: string[]; importing?: object };
};

// Resource counts of a plan in JSON, such as `tofu show -json` writes
export const planCounts = (path: string | undefined): Counts => {
	const counts = { create: 0, update: 0, delete: 0, moved: 0, imported: 0 };
	if (!path || !existsSync(path)) {
		return counts;
	}
	const plan = JSON.parse(readFileSync(path, "utf8"));
	const changes: ResourceChange[] = plan.resource_changes ?? [];
	for (const { previous_address, change } of changes) {
		if (change.actions.includes("create")) counts.create++;
		if (change.actions.length === 1 && change.actions[0] === "update")
			counts.update++;
		if (change.actions.includes("delete")) counts.delete++;
		if (previous_address) counts.moved++;
		if (change.importing) counts.imported++;
	}
	return counts;
};

export const addCountsTable = (
	summary: typeof Core.summary,
	counts: Counts,
) => {
	const row = [
		counts.create,
		counts.update,
		counts.delete,
		counts.moved,
		counts.imported,
	];
	summary.addRaw(
		"| Add | Change | Destroy | Move | Import |\n|---|---|---|---|---|\n",
	);
	summary.addRaw(`| ${row.join(" | ")} |\n\n`);
};

// A step summary may hold 1 MiB, and the plan shares it with the rest
const PLAN_TEXT_LIMIT = 900_000;

// The plan with each action at the start of its line, in the same column, for diff highlighting
// An update in place starts with `!`, which highlights as changed. Heredoc bodies stay as they are
export const planDiff = (text: string): string => {
	let heredoc: string | undefined;
	return text
		.split("\n")
		.map((line) => {
			if (heredoc) {
				if (line.trim() === heredoc) heredoc = undefined;
				return line;
			}
			heredoc = line.match(/<<-?(\w+)$/)?.[1];
			const action = line.match(/^(\s+)([-+~]|-\/\+|\+\/-)( .*)$/);
			if (!action) return line;
			const [, indent, symbol, rest] = action;
			return symbol === "~"
				? `!~${indent.slice(1)}${rest}`
				: `${symbol}${indent}${rest}`;
		})
		.join("\n");
};

// The plan as text, open, and cut short of what a step summary may hold
export const addPlanText = (
	summary: typeof Core.summary,
	path: string | undefined,
) => {
	if (!path || !existsSync(path)) {
		return;
	}
	const size = statSync(path).size;
	let text = readFileSync(path).subarray(0, PLAN_TEXT_LIMIT).toString();
	if (!text.endsWith("\n")) {
		text += "\n";
	}
	summary.addRaw(
		`<details open><summary>Plan</summary>\n\n\`\`\`diff\n${planDiff(text)}\`\`\`\n\n`,
	);
	if (size > PLAN_TEXT_LIMIT) {
		summary.addRaw(
			`Cut at ${PLAN_TEXT_LIMIT} of ${size} bytes. The job log has the whole plan.\n\n`,
		);
	}
	summary.addRaw("</details>\n\n");
};

// The REST API version whose pull requests carry their native stack
export const STACK_API = { "x-github-api-version": "2026-03-10" };

// A review runs for its pull request, which plans Dependabot's without its secrets
export const onPullRequest = (env: NodeJS.ProcessEnv) =>
	env.GITHUB_EVENT_NAME === "pull_request" ||
	env.GITHUB_EVENT_NAME === "pull_request_review";

// Why a head behind its base cannot be applied, or undefined when it is not behind
export const behind = async (
	github: Pick<GitHub, "request">,
	env: NodeJS.ProcessEnv,
	base: string,
	head: string,
	then: string,
) => {
	const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
	const { data } = await github.request(
		"GET /repos/{owner}/{repo}/compare/{basehead}",
		{
			owner,
			repo,
			basehead: `${base}...${head}`,
		},
	);
	if (data.behind_by > 0) {
		return `#${env.PR} is ${data.behind_by} commits behind ${base}, so a plan from it describes a tree that no longer exists and applying it would undo what landed meanwhile. Update the branch, then ${then}.`;
	}
};
