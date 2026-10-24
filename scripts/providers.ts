// Before planning or applying: key the provider cache on the workspace's lock
// file, read from the API since the checkout comes later, so the apply reuses
// what the plan downloaded.
import { createHash } from "node:crypto";
import { posix } from "node:path";
import type * as Core from "@actions/core";
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
	// dflook's container runs with HOME=/github/home, mounted from here, and keeps
	// its plugin cache under it
	core.setOutput(
		"path",
		`${env.RUNNER_TEMP}/_github_home/.terraform.d/plugin-cache`,
	);

	if (!env.TF_PROVIDER_DOWNLOAD_RETRY) {
		core.exportVariable("TF_PROVIDER_DOWNLOAD_RETRY", "5");
	}

	if (!env.WORKSPACE) {
		core.info("No workspace, so no provider cache.");
		return;
	}
	const lock = posix
		.normalize(`/${env.WORKSPACE}/.terraform.lock.hcl`)
		.slice(1);
	const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
	let content: string;
	try {
		// Each segment is encoded alone, so the slashes between them stay slashes
		const path = lock.split("/").map(encodeURIComponent).join("/");
		const { data } = await github.request<string>(
			`GET /repos/{owner}/{repo}/contents/${path}`,
			{
				owner,
				repo,
				ref: env.GITHUB_SHA,
				headers: { accept: "application/vnd.github.raw" },
			},
		);
		content = data;
	} catch {
		core.info(`No ${lock} at ${env.GITHUB_SHA}, so no provider cache.`);
		return;
	}
	const hash = createHash("sha256").update(content).digest("hex");
	core.setOutput(
		"key",
		`terraform-github-tacos-providers-${env.RUNNER_OS}-${env.RUNNER_ARCH}-${hash}`,
	);
};
