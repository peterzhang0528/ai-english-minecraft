import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/voice/config.ts";
import { createMapleServer } from "../src/voice/gateway.ts";
import { fixEnglish, localTutor } from "../src/tutor/local.ts";
import { tutorReply } from "../src/tutor/reply.ts";
import { bodyBlocked, castRay, createWorld, setFollow, step } from "../web/client/world.ts";

const root = path.resolve(import.meta.dirname, "..");

test("local tutor corrects English and follows without an API key", () => {
  const follow = localTutor("跟我来");
  assert.equal(follow.action, "follow");
  assert.equal(follow.source, "local");
  assert.equal(follow.correction, "Follow me.");

  const englishFollow = localTutor("Follow me.");
  assert.equal(englishFollow.action, "follow");
  assert.equal(englishFollow.correction, null);

  const grammar = localTutor("he go to the cave");
  assert.match(grammar.correction || "", /He goes to the cave/);
  assert.match(grammar.say, /He goes to the cave/);

  const article = fixEnglish("i see tree");
  assert.equal(article.text, "I see a tree.");
  assert.equal(article.changed, true);
  assert.equal(fixEnglish("I see a tree.").changed, false);

  const tree = localTutor("I see a tree.");
  assert.equal(tree.correction, null);
  assert.match(tree.say, /wood/);

  const creeper = localTutor("What is a creeper?");
  assert.match(creeper.say, /creeper/);
  assert.match(creeper.say, /苦力怕/);
  assert.equal(creeper.correction, null);

  const phrase = localTutor("我的镐坏了怎么说");
  assert.match(phrase.correction || "", /My pickaxe broke/);
});

test("empty Anthropic key never calls the network and stays on the local tutor", async () => {
  let called = false;
  const reply = await tutorReply("Hello Maple", {
    apiKey: "",
    model: "claude-haiku-4-5",
    fetchImpl: async () => {
      called = true;
      throw new Error("network should not be used");
    },
  });
  assert.equal(called, false);
  assert.equal(reply.source, "local");
  assert.equal(JSON.stringify(reply).includes("ANTHROPIC"), false);
});

test("a failed cloud tutor falls back locally and does not echo the key", async () => {
  const secret = "server-only-tutor-secret";
  let seen = "";
  const failed = await tutorReply("follow me", {
    apiKey: secret,
    model: "claude-haiku-4-5",
    fetchImpl: async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      seen = headers["x-api-key"];
      return new Response("nope", { status: 500 });
    },
  });
  assert.equal(seen, secret);
  assert.equal(failed.source, "local");
  assert.equal(failed.action, "follow");
  assert.equal(JSON.stringify(failed).includes(secret), false);

  const remote = await tutorReply("I see grass.", {
    apiKey: secret,
    model: "claude-haiku-4-5",
    fetchImpl: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: '{"say":"Green and soft.","chinese":"绿色的，软软的。","correction":null,"action":"none"}' }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(remote.source, "anthropic");
  assert.equal(remote.say, "Green and soft.");
  assert.equal(JSON.stringify(remote).includes(secret), false);
});

test("player can walk, look down at blocks, and Maple follows", () => {
  const world = createWorld();
  assert.equal(bodyBlocked(world, world.player.x, world.player.y, world.player.z), false);
  const hit = castRay(world, world.player.x, world.player.y + 8, world.player.z, 0, -1, 0);
  assert.ok(hit);
  assert.ok(hit.dist > 0 && hit.dist < 16);

  world.player.yaw = 0;
  const startZ = world.player.z;
  const idle = { forward: false, back: false, left: false, right: false, jump: false };
  for (let i = 0; i < 30; i += 1) step(world, { ...idle, forward: true }, 1 / 30);
  assert.ok(world.player.z > startZ + 1);

  world.maple.x = world.player.x + 5;
  world.maple.z = world.player.z;
  setFollow(world, true);
  const before = Math.hypot(world.maple.x - world.player.x, world.maple.z - world.player.z);
  for (let i = 0; i < 20; i += 1) step(world, idle, 1 / 20);
  const after = Math.hypot(world.maple.x - world.player.x, world.maple.z - world.player.z);
  assert.ok(after < before - 0.5);
});

test("landing and play pages explain the no-install demo and tablet controls", async () => {
  const server = createMapleServer({
    webRoot: path.join(root, "web"),
    config: loadConfig({ DOUBAO_MOCK: "1", MAPLE_PORT: "0" }),
    tutor: { apiKey: "", model: "claude-haiku-4-5" },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const origin = `http://127.0.0.1:${address.port}`;

  const landing = await fetch(`${origin}/`);
  const landingHtml = await landing.text();
  assert.equal(landing.status, 200);
  assert.match(landingHtml, /不用安装/);
  assert.match(landingHtml, /打开这个链接就能和 Maple 玩英语，不用装 Minecraft。/);
  assert.match(landingHtml, /Minecraft Java/);
  assert.match(landingHtml, /href="\/play"/);
  assert.equal(landingHtml.includes("ANTHROPIC_API_KEY"), false);

  const play = await fetch(`${origin}/play`);
  const playHtml = await play.text();
  assert.equal(play.status, 200);
  assert.match(playHtml, /滑动/);
  assert.match(playHtml, /前/);
  assert.match(playHtml, /发送/);
  assert.match(playHtml, /跟我来/);
  assert.match(playHtml, /No keyboard needed/);
  assert.equal(playHtml.includes("ANTHROPIC_API_KEY"), false);

  const voice = await fetch(`${origin}/voice`);
  const voiceHtml = await voice.text();
  assert.equal(voice.status, 200);
  assert.match(voiceHtml, /开始通话/);

  const css = await fetch(`${origin}/demo.css`);
  const cssText = await css.text();
  assert.match(cssText, /min-height:\s*76px/);
  assert.match(cssText, /pointer:\s*coarse/);
  assert.match(cssText, /touch-action:\s*none/);
  assert.match(cssText, /font-size:\s*16px/);

  const client = await fetch(`${origin}/client/play.ts`);
  const clientText = await client.text();
  assert.equal(client.status, 200);
  assert.match(clientText, /data-move/);
  assert.equal(clientText.includes("ANTHROPIC_API_KEY"), false);
  assert.equal(clientText.includes("x-api-key"), false);

  const health = await fetch(`${origin}/health`);
  const body = await health.json() as { tutor: string };
  assert.equal(body.tutor, "local");

  const tutor = await fetch(`${origin}/api/tutor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "he go to the cave" }),
  });
  const tutorBody = await tutor.json() as { source: string; correction: string };
  assert.equal(tutor.status, 200);
  assert.equal(tutorBody.source, "local");
  assert.match(tutorBody.correction, /He goes to the cave/);
  assert.equal(JSON.stringify(tutorBody).includes("ANTHROPIC_API_KEY"), false);

  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("docker and fly serve the web demo on 8080 without baking secrets", () => {
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  const fly = fs.readFileSync(path.join(root, "fly.toml"), "utf8");
  const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  assert.match(dockerfile, /node:22/);
  assert.match(dockerfile, /MAPLE_PORT=8080/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.match(fly, /internal_port\s*=\s*8080/);
  assert.match(fly, /MAPLE_PORT\s*=\s*"8080"/);
  assert.match(fly, /path\s*=\s*"\/health"/);
  assert.match(fly, /primary_region\s*=\s*"hkg"/);
  assert.equal(dockerfile.includes("ANTHROPIC_API_KEY="), false);
  assert.equal(/ANTHROPIC_API_KEY\s*=/.test(fly), false);
  assert.match(example, /^ANTHROPIC_API_KEY=\s*$/m);
  assert.match(pkg, /"web":/);
});
