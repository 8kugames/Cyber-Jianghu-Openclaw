// Minimal test handler to verify hook invocation
import { promises as fs } from "fs";

type HookEvent = {
	type: "agent";
	action: "bootstrap" | "cron";
	context: {
		workspaceDir: string;
		[key: string]: unknown;
	};
	timestamp: number;
};

const handler = async (event: HookEvent): Promise<void> => {
	console.log("[bootstrap-TEST] Handler invoked!", JSON.stringify({ type: event.type, action: event.action }));
	console.log("[bootstrap-TEST] workspaceDir:", event.context.workspaceDir);
	
	try {
		const testPath = "/home/node/workspace/TEST_BOOTSTRAP.txt";
		await fs.writeFile(testPath, `Bootstrap hook fired at ${new Date().toISOString()}\n`, "utf-8");
		console.log("[bootstrap-TEST] Wrote test file");
	} catch (e) {
		console.error("[bootstrap-TEST] Failed to write:", e);
	}
};

export default handler;