type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [k: string]: JsonValue };

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: JsonValue;
  error?: string | JsonValue;
}

function tryLoadDotEnvFile(path: string): void {
  try {
    const txt = require("node:fs").readFileSync(path, "utf8") as string;
    for (const rawLine of txt.split(/\r?\n/g)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (!key) continue;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
}

function tryLoadDotEnv(): void {
  // Load from cwd and a couple parent levels (works when running from game folders).
  tryLoadDotEnvFile(".env");
  tryLoadDotEnvFile(".env.local");
  tryLoadDotEnvFile("../.env");
  tryLoadDotEnvFile("../.env.local");
  tryLoadDotEnvFile("../../.env");
  tryLoadDotEnvFile("../../.env.local");
}

function getToken(): string {
  if (!process.env.REPLICATE_API_TOKEN) tryLoadDotEnv();
  const tok = process.env.REPLICATE_API_TOKEN;
  if (!tok) {
    throw new Error(
      "Missing REPLICATE_API_TOKEN env var. Set it in your shell (or .env) before running asset generation.",
    );
  }
  return tok;
}

export async function replicateCreatePrediction(params: {
  owner: string;
  model: string;
  input: JsonObject;
}): Promise<ReplicatePrediction> {
  const token = getToken();
  const url = "https://api.replicate.com/v1/models/" + params.owner + "/" + params.model + "/predictions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input: params.input }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      "Replicate create prediction failed: " +
        String(res.status) +
        " " +
        String(res.statusText) +
        " " +
        txt,
    );
  }

  return (await res.json()) as ReplicatePrediction;
}

export async function replicateGetPrediction(id: string): Promise<ReplicatePrediction> {
  const token = getToken();
  const url = "https://api.replicate.com/v1/predictions/" + id;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      "Replicate get prediction failed: " + String(res.status) + " " + String(res.statusText) + " " + txt,
    );
  }
  return (await res.json()) as ReplicatePrediction;
}

export async function replicateWaitForPrediction(
  id: string,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<ReplicatePrediction> {
  const timeoutMs = opts?.timeoutMs ?? 5 * 60 * 1000;
  const pollMs = opts?.pollMs ?? 900;

  const t0 = Date.now();
  while (true) {
    const p = await replicateGetPrediction(id);
    if (p.status === "succeeded") return p;
    if (p.status === "failed" || p.status === "canceled") {
      throw new Error("Replicate prediction " + p.status + ": " + (p.error ? JSON.stringify(p.error) : "unknown"));
    }
    if (Date.now() - t0 > timeoutMs) {
      throw new Error("Replicate prediction timed out after " + String(timeoutMs) + "ms: " + id);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export function coerceOutputUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (output && typeof output === "object") {
    const o = output as any;
    if (typeof o.url === "string") return o.url;
    if (Array.isArray(o.images) && typeof o.images[0] === "string") return o.images[0];
    if (Array.isArray(o.output) && typeof o.output[0] === "string") return o.output[0];
  }
  throw new Error("Unsupported Replicate output format: " + JSON.stringify(output));
}

export async function downloadToFile(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to download: " + url + " (" + String(res.status) + ")");
  const buf = Buffer.from(await res.arrayBuffer());
  await Bun.write(outputPath, buf);
}
