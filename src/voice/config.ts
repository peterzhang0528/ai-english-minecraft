import fs from "node:fs";

/** Volcengine documents this App Key as a fixed public value, not a user secret. */
export const PUBLIC_DOUBAO_APP_KEY = "PlgvMymc7f3tQnJ6";

export const DEFAULT_DOUBAO_RESOURCE_ID = "volc.speech.dialog";
export const DEFAULT_DOUBAO_WS_URL = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
export const DEFAULT_DOUBAO_MODEL = "1.2.1.1";
export const DEFAULT_DOUBAO_SPEAKER = "zh_female_vv_jupiter_bigtts";

export interface DoubaoConfig {
  appId: string;
  accessToken: string;
  appKey: string;
  resourceId: string;
  wsUrl: string;
  model: string;
  speaker: string;
  mock: boolean;
  port: number;
}

export interface EnvLike {
  [key: string]: string | undefined;
}

export function loadEnvFile(file: string, env: EnvLike = process.env): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
}

function flag(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export function loadConfig(env: EnvLike = process.env): DoubaoConfig {
  const port = Number(env.MAPLE_PORT || "8787");
  return {
    appId: (env.DOUBAO_APP_ID || "").trim(),
    accessToken: (env.DOUBAO_ACCESS_TOKEN || "").trim(),
    appKey: (env.DOUBAO_APP_KEY || PUBLIC_DOUBAO_APP_KEY).trim(),
    resourceId: (env.DOUBAO_RESOURCE_ID || DEFAULT_DOUBAO_RESOURCE_ID).trim(),
    wsUrl: (env.DOUBAO_WS_URL || DEFAULT_DOUBAO_WS_URL).trim(),
    model: (env.DOUBAO_MODEL || DEFAULT_DOUBAO_MODEL).trim(),
    speaker: (env.DOUBAO_SPEAKER || DEFAULT_DOUBAO_SPEAKER).trim(),
    mock: flag(env.DOUBAO_MOCK),
    port: Number.isFinite(port) && port > 0 ? port : 8787,
  };
}

export function missingCredentials(config: DoubaoConfig): string[] {
  if (config.mock) return [];
  const missing: string[] = [];
  if (!config.appId) missing.push("DOUBAO_APP_ID");
  if (!config.accessToken) missing.push("DOUBAO_ACCESS_TOKEN");
  return missing;
}

export function doubaoHeaders(config: DoubaoConfig, connectId: string): Record<string, string> {
  return {
    "X-Api-App-ID": config.appId,
    "X-Api-Access-Key": config.accessToken,
    "X-Api-Resource-Id": config.resourceId,
    "X-Api-App-Key": config.appKey,
    "X-Api-Connect-Id": connectId,
  };
}
