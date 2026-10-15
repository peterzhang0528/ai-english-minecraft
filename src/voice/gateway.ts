import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { WebSocket, WebSocketServer } from "ws";
import { missingCredentials, type DoubaoConfig } from "./config.ts";
import { VoiceRelay } from "./relay.ts";
import type { Upstream } from "./connect.ts";
import { tutorReply, type TutorSettings } from "../tutor/reply.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface MapleServerOptions {
  webRoot: string;
  config: DoubaoConfig;
  openUpstream?: (config: DoubaoConfig) => Promise<Upstream>;
  tutor?: TutorSettings;
}

const PAGES: Record<string, string> = {
  "/": "/index.html",
  "/play": "/play.html",
  "/voice": "/voice.html",
};

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16_000) {
        failed = true;
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function safeFile(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function serveFile(root: string, reqPath: string, res: http.ServerResponse): void {
  const full = safeFile(root, reqPath);
  if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  if (full.endsWith(".ts")) {
    const source = fs.readFileSync(full, "utf8");
    const javascript = stripTypeScriptTypes(source, { mode: "strip" });
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(javascript);
    return;
  }
  const ext = path.extname(full);
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

export function createMapleServer(options: MapleServerOptions): http.Server {
  const tutor = options.tutor ?? { apiKey: "", model: "claude-haiku-4-5" };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
      if (pathname === "/health") {
        const missing = missingCredentials(options.config);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({
          ok: true,
          mock: options.config.mock,
          credentials: missing.length === 0,
          missing,
          tutor: tutor.apiKey ? "anthropic" : "local",
        }));
        return;
      }
      if (pathname === "/api/tutor") {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json; charset=utf-8", allow: "POST" });
          res.end(JSON.stringify({ error: "Use POST" }));
          return;
        }
        const body = await readJson(req);
        const text = body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string"
          ? (body as { text: string }).text
          : "";
        const reply = await tutorReply(text, tutor);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(reply));
        return;
      }
      serveFile(options.webRoot, PAGES[pathname] || pathname, res);
    } catch {
      if (res.headersSent) return;
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "无法读取这句话" }));
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/voice") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const missing = missingCredentials(options.config);
    if (missing.length) {
      ws.send(JSON.stringify({
        type: "error",
        message: `还没有豆包凭证（${missing.join("、")}）。复制 .env.example 为 .env 并填入试用 App ID 和 Access Token，或暂时设置 DOUBAO_MOCK=1。`,
      }));
    }
    const relay = new VoiceRelay({
      config: options.config,
      openUpstream: options.openUpstream,
      send: (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(event instanceof Uint8Array ? Buffer.from(event) : JSON.stringify(event));
      },
    });
    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      relay.onClientMessage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), isBinary);
    });
    ws.on("close", () => relay.stop());
  });

  return server;
}
