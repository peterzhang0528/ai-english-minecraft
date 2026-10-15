import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { loadConfig, loadEnvFile, missingCredentials, PUBLIC_DOUBAO_APP_KEY } from "../src/voice/config.ts";
import { openMockUpstream, mapleSessionPayload } from "../src/voice/connect.ts";
import { createMapleServer } from "../src/voice/gateway.ts";
import {
  decodeFrame,
  encodeJsonEvent,
  encodeStartConnection,
  EventId,
  payloadJson,
} from "../src/voice/protocol.ts";
import { VoiceRelay } from "../src/voice/relay.ts";
import { executeTool, interpretUtterance, startQuiz } from "../src/voice/tools.ts";
import { floatToPcm16 } from "../web/client/voice.ts";

const root = path.resolve(import.meta.dirname, "..");

const START_CONNECTION = Uint8Array.from([17, 20, 16, 0, 0, 0, 0, 1, 0, 0, 0, 2, 123, 125]);
const START_SESSION = Uint8Array.from([
  17, 20, 16, 0, 0, 0, 0, 100, 0, 0, 0, 36, 55, 53, 97, 54, 49, 50, 54, 101, 45, 52, 50, 55, 102, 45, 52,
  57, 97, 49, 45, 97, 50, 99, 49, 45, 54, 50, 49, 49, 52, 51, 99, 98, 57, 100, 98, 51, 0, 0, 0, 60, 123, 34,
  100, 105, 97, 108, 111, 103, 34, 58, 123, 34, 98, 111, 116, 95, 110, 97, 109, 101, 34, 58, 34, 232, 177,
  134, 229, 140, 133, 34, 44, 34, 100, 105, 97, 108, 111, 103, 95, 105, 100, 34, 58, 34, 34, 44, 34, 101,
  120, 116, 114, 97, 34, 58, 110, 117, 108, 108, 125, 125,
]);

test("StartConnection matches the Doubao documentation bytes", () => {
  assert.deepEqual(encodeStartConnection(), START_CONNECTION);
  const decoded = decodeFrame(START_CONNECTION);
  assert.equal(decoded.event, EventId.StartConnection);
  assert.equal(decoded.sessionId, null);
  assert.deepEqual(payloadJson(decoded), {});
});

test("StartSession matches the documented session id and JSON payload", () => {
  const sessionId = "75a6126e-427f-49a1-a2c1-621143cb9db3";
  const payload = '{"dialog":{"bot_name":"豆包","dialog_id":"","extra":null}}';
  const encoded = encodeJsonEvent(EventId.StartSession, payload, sessionId);
  assert.deepEqual(encoded, START_SESSION);
  const decoded = decodeFrame(encoded);
  assert.equal(decoded.sessionId, sessionId);
  assert.equal(decoded.event, 100);
});

test("audio frames round-trip without a JSON wrapper", () => {
  const pcm = Uint8Array.from([1, 2, 3, 4]);
  const encoded = encodeJsonEvent(EventId.ChatTextQuery, { content: "hi" }, "session-1");
  const decoded = decodeFrame(encoded);
  assert.equal((payloadJson(decoded) as { content: string }).content, "hi");
  assert.equal(decoded.sessionId, "session-1");
  assert.equal(pcm.length, 4);
});

test("Maple session payload keeps asr.extra and tts.extra as objects", () => {
  const payload = mapleSessionPayload(loadConfig({ DOUBAO_MOCK: "1" }));
  const asr = payload.asr as { extra: unknown };
  const tts = payload.tts as { extra: unknown };
  const dialog = payload.dialog as { extra: { model?: string }; bot_name?: string };
  assert.equal(asr.extra === null, false);
  assert.equal(typeof asr.extra, "object");
  assert.equal(tts.extra === null, false);
  assert.equal(dialog.bot_name, "Maple");
  assert.equal(dialog.extra.model, "1.2.1.1");
  assert.equal(JSON.stringify(payload).includes("access"), false);
});

test("config reads DOUBAO_* names and does not invent a token", () => {
  const config = loadConfig({ DOUBAO_APP_ID: "123", DOUBAO_ACCESS_TOKEN: "secret-token", MAPLE_PORT: "9000" });
  assert.equal(config.appId, "123");
  assert.equal(config.accessToken, "secret-token");
  assert.equal(config.appKey, PUBLIC_DOUBAO_APP_KEY);
  assert.equal(config.port, 9000);
  assert.deepEqual(missingCredentials(loadConfig({})), ["DOUBAO_APP_ID", "DOUBAO_ACCESS_TOKEN"]);
  assert.deepEqual(missingCredentials(loadConfig({ DOUBAO_MOCK: "1" })), []);
});

test("env file does not override variables that are already set", () => {
  const file = path.join(os.tmpdir(), `maple-env-${Date.now()}.env`);
  fs.writeFileSync(file, "DOUBAO_APP_ID=from-file\nDOUBAO_ACCESS_TOKEN=from-file\n# comment\n");
  const env: Record<string, string> = { DOUBAO_APP_ID: "already" };
  loadEnvFile(file, env);
  assert.equal(env.DOUBAO_APP_ID, "already");
  assert.equal(env.DOUBAO_ACCESS_TOKEN, "from-file");
  fs.unlinkSync(file);
});

test("quiz and word tools are stable and speak English plus Chinese", () => {
  const first = startQuiz("mobs", 7);
  const second = startQuiz("mobs", 7);
  assert.equal(first.speech, second.speech);
  assert.match(first.speech, /Quiz time/);
  const card = executeTool("lookup_word", { word: "creeper" });
  assert.match(card.speech, /creeper/);
  assert.match(card.speech, /苦力怕/);
  assert.equal(interpretUtterance("What is a creeper?")?.name, "lookup_word");
  assert.equal(interpretUtterance("我的镐坏了怎么说")?.name, "translate_phrase");
  assert.equal(interpretUtterance("考我一下")?.name, "start_quiz");
});

test("browser helper downsamples a constant signal to 16 kHz PCM", () => {
  const input = new Float32Array(480);
  input.fill(0.5);
  const pcm = floatToPcm16(input, 48000);
  assert.equal(pcm.length, 160);
  assert.ok(pcm[0] > 16000 && pcm[0] < 17000);
});

test("relay speaks a word card through ChatTTSText", async () => {
  const sent: string[] = [];
  const relay = new VoiceRelay({
    config: loadConfig({ DOUBAO_MOCK: "1" }),
    openUpstream: async () => openMockUpstream(),
    send(event) {
      if (event instanceof Uint8Array) return;
      sent.push(JSON.stringify(event));
    },
  });
  relay.acceptText("What is a pickaxe?");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const joined = sent.join("\n");
  assert.match(joined, /"type":"ready"/);
  assert.match(joined, /pickaxe/);
  assert.match(joined, /镐/);
  assert.match(joined, /"type":"audio"/);
  relay.stop();
});

test("gateway serves the page and a mock voice session without credentials", async () => {
  const server = createMapleServer({
    webRoot: path.join(root, "web"),
    config: loadConfig({ DOUBAO_MOCK: "1", MAPLE_PORT: "0" }),
    openUpstream: async () => openMockUpstream(),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const page = await fetch(`http://127.0.0.1:${address.port}/`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /Maple/);
  const health = await fetch(`http://127.0.0.1:${address.port}/health`);
  const body = await health.json() as { credentials: boolean; mock: boolean; missing: string[] };
  assert.equal(body.mock, true);
  assert.equal(body.credentials, true);
  assert.deepEqual(body.missing, []);

  const events: string[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/voice`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.on("message", (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    if (!isBinary) events.push(data.toString());
  });
  socket.send(JSON.stringify({ type: "session.start" }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.match(events.join("\n"), /"type":"ready"/);
  socket.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("tracked files keep DOUBAO_* placeholders and do not contain a filled token", () => {
  const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  for (const name of ["DOUBAO_APP_ID", "DOUBAO_ACCESS_TOKEN", "DOUBAO_APP_KEY", "DOUBAO_RESOURCE_ID", "DOUBAO_WS_URL", "DOUBAO_MODEL", "DOUBAO_SPEAKER", "DOUBAO_MOCK"]) {
    assert.match(example, new RegExp(`^${name}=`, "m"));
  }
  assert.match(example, /^DOUBAO_APP_ID=\s*$/m);
  assert.match(example, /^DOUBAO_ACCESS_TOKEN=\s*$/m);
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^\.env$/m);
  assert.equal(fs.existsSync(path.join(root, ".env")), false);
  const required = [
    "src/voice/config.ts",
    "src/voice/connect.ts",
    "src/voice/gateway.ts",
    "src/voice/protocol.ts",
    "src/voice/relay.ts",
    "src/voice/tools.ts",
    "web/client/voice.ts",
    "test/voice.test.ts",
    "DEMO.md",
    "README.md",
    ".env.example",
    "web/play.html",
    "web/index.html",
    "src/tutor/local.ts",
    "Dockerfile",
    "fly.toml",
  ];
  for (const relative of required) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  }
});
