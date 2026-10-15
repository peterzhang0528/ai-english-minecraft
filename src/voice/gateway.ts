import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { WebSocket, WebSocketServer } from "ws";
import { missingCredentials, type DoubaoConfig } from "./config.ts";
import { VoiceRelay } from "./relay.ts";
import type { Upstream } from "./connect.ts";

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
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/health") {
      const missing = missingCredentials(options.config);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        mock: options.config.mock,
        credentials: missing.length === 0,
        missing,
      }));
      return;
    }
    serveFile(options.webRoot, url.pathname, res);
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
