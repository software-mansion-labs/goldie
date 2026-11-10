import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createArgentClient, listFlags } from "@swmansion/argent/client";

/**
 * argent through its Node client. It talks to the same tool-server as the CLI
 * and starts it when none is running, so no process is spawned per call.
 */
const client = createArgentClient();

type Primitive = string | number | boolean;

/** Invoke a tool and return its `data`. Artifacts in it are local file paths. */
export async function run<T = any>(
  tool: string,
  args: Record<string, Primitive | undefined>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await client.callTool<T>(tool, args)).data;
    } catch (err) {
      // The tool-server prepare() restarts after rebooting a simulator to pin
      // its locale can miss the client's 15 s ready window while the device is
      // still settling (seen on the iPhone Duo, about one reboot in three).
      const slowStart = String((err as Error)?.message ?? err).includes(
        "Timed out waiting for tools server",
      );
      if (!slowStart || attempt >= SERVER_START_ATTEMPTS) throw err;
      console.log(
        `    argent tool-server was slow to start, retrying (${attempt}/${SERVER_START_ATTEMPTS - 1})`,
      );
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/** Starts of the tool-server to try before giving up, 5 s apart. */
const SERVER_START_ATTEMPTS = 5;

/** Invoke a tool that returns an image artifact, copying it to `out`. */
export async function runToFile(
  tool: string,
  args: Record<string, Primitive | undefined>,
  out: string,
): Promise<string> {
  const data = await run<{ image?: unknown }>(tool, args);
  if (typeof data?.image !== "string") throw new Error(`argent ${tool} returned no image`);
  await mkdir(dirname(resolve(out)), { recursive: true });
  await copyFile(data.image, out);
  return out;
}

/** Mirrors argent's StepReport (packages/tool-server/src/tools/flows/flow-run.ts). */
export type FlowStepReport = {
  index?: number;
  kind?: string;
  status?: string;
  /** Machine-readable explanation; always set when the step did not pass. */
  reason?: string;
  warning?: string;
  tool?: string;
  /** Display-only "what this step acts on" - the selector, the snapshot name. */
  target?: string;
  message?: string;
  error?: string;
  [k: string]: unknown;
};

export type FlowReport = {
  ok: boolean;
  raw: unknown;
  steps: FlowStepReport[];
  failed: FlowStepReport | null;
  stdout: string;
};

/** Replay a flow YAML headlessly. Never throws - inspect `ok` / `failed`. */
export async function flow(pathOrName: string, udid: string): Promise<FlowReport> {
  try {
    // The payload `argent flow run` sends.
    const { data: raw } = await client.callTool<any>("flow-execute", {
      flow_path: resolve(pathOrName),
      project_root: process.cwd(),
      device: udid,
      // Headless runs never block on the LLM prerequisite handshake.
      prerequisiteAcknowledged: true,
    });
    const steps: FlowStepReport[] = raw?.steps ?? [];
    const failed = steps.find((s) => s.status === "fail" || s.status === "error") ?? null;
    return { ok: raw?.ok === true, raw, steps, failed, stdout: JSON.stringify(raw, null, 2) };
  } catch (err) {
    // Rejected before any step ran: a bad flow file, an unknown device.
    const stdout = err instanceof Error ? err.message : String(err);
    return { ok: false, raw: null, steps: [], failed: null, stdout };
  }
}

/** Is the argent corner watermark disabled? Previews must not carry it. */
export async function watermarkDisabled(): Promise<boolean> {
  return listFlags().find((f) => f.name === "video-watermark")?.enabled === false;
}

/**
 * Stop the tool-server so the next call starts a fresh one.
 * Needed after a simulator shutdown: the running server keeps a transport
 * session pointed at the device that went away, and every later `launch`
 * then fails its native-devtools handshake.
 */
export async function restartServer(): Promise<void> {
  await client.stopServer();
}

/** Can goldie reach argent's tool-server? Starts it when none is running. */
export async function available(): Promise<boolean> {
  return client.listTools().then(
    () => true,
    () => false,
  );
}
