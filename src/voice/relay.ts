import { createLiveSession, openDoubaoUpstream, describeAudio, type LiveSession, type Upstream } from "./connect.ts";
import type { DoubaoConfig } from "./config.ts";
import { executeTool, interpretUtterance } from "./tools.ts";

export interface ClientEvent {
  type: string;
  [key: string]: unknown;
}

export interface RelayOptions {
  config: DoubaoConfig;
  send: (event: ClientEvent | Uint8Array) => void;
  openUpstream?: (config: DoubaoConfig) => Promise<Upstream>;
}

interface PendingText {
  kind: "text" | "tool";
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export class VoiceRelay {
  session: LiveSession | null = null;
  upstream: Upstream | null = null;
  queue: PendingText[] = [];
  audioQueue: Uint8Array[] = [];
  opening: Promise<void> | null = null;
  options: RelayOptions;

  constructor(options: RelayOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.session || this.opening) return;
    this.opening = this.open();
    try {
      await this.opening;
    } finally {
      this.opening = null;
    }
  }

  async open(): Promise<void> {
    const openUpstream = this.options.openUpstream ?? openDoubaoUpstream;
    try {
      this.upstream = await openUpstream(this.options.config);
    } catch (error) {
      this.options.send({
        type: "error",
        message: error instanceof Error ? error.message : "无法连接豆包",
      });
      return;
    }
    this.session = createLiveSession(this.upstream, this.options.config, {
      onReady: () => {
        this.options.send({ type: "ready" });
        this.flush();
      },
      onEvent: (name, payload) => this.forwardModelEvent(name, payload),
      onAudio: (audio) => {
        const described = describeAudio(audio);
        this.options.send({
          type: "audio",
          format: described.format,
          sampleRate: described.sampleRate,
          data: Buffer.from(audio).toString("base64"),
        });
      },
      onError: (message) => this.options.send({ type: "error", message }),
      onClosed: () => this.options.send({ type: "status", text: "通话已结束" }),
    });
    this.session.start();
  }

  onClientMessage(data: Uint8Array, isBinary: boolean): void {
    if (isBinary) {
      this.enqueueAudio(data);
      return;
    }
    let message: { type?: string; text?: string; name?: string; args?: Record<string, unknown> };
    try {
      message = JSON.parse(Buffer.from(data).toString("utf8"));
    } catch {
      this.options.send({ type: "error", message: "无法解析浏览器消息" });
      return;
    }
    if (message.type === "session.start") {
      void this.start();
      return;
    }
    if (message.type === "session.stop") {
      this.stop();
      return;
    }
    if (message.type === "text" && message.text) {
      this.acceptText(message.text);
      return;
    }
    if (message.type === "tool" && message.name) {
      this.acceptTool(message.name, message.args ?? {});
    }
  }

  acceptText(text: string): void {
    const tool = interpretUtterance(text);
    if (tool) {
      this.acceptTool(tool.name, tool.args);
      return;
    }
    this.enqueue({ kind: "text", text });
  }

  acceptTool(name: string, args: Record<string, unknown>): void {
    this.enqueue({ kind: "tool", name, args });
  }

  stop(): void {
    this.queue = [];
    this.audioQueue = [];
    this.session?.finish();
    this.session = null;
    this.upstream = null;
  }

  enqueue(item: PendingText): void {
    if (!this.session?.ready) {
      this.queue.push(item);
      if (!this.session && !this.opening) void this.start();
      return;
    }
    this.dispatch(item);
  }

  enqueueAudio(pcm: Uint8Array): void {
    if (!this.session?.ready) {
      if (this.audioQueue.length < 20) this.audioQueue.push(pcm);
      return;
    }
    this.session.sendAudio(pcm);
  }

  flush(): void {
    const pending = this.queue.splice(0);
    for (const item of pending) this.dispatch(item);
    const audio = this.audioQueue.splice(0);
    for (const chunk of audio) this.session?.sendAudio(chunk);
  }

  dispatch(item: PendingText): void {
    if (!this.session?.ready) return;
    if (item.kind === "text" && item.text) {
      this.options.send({ type: "asr", text: item.text, final: true });
      this.session.sendText(item.text);
      return;
    }
    if (item.kind === "tool" && item.name) {
      const result = executeTool(item.name, item.args ?? {});
      this.options.send({ type: "card", title: result.card.title, lines: result.card.lines });
      this.options.send({ type: "chat", text: result.speech });
      this.session.speak(result.speech);
    }
  }

  forwardModelEvent(name: string, payload: unknown): void {
    if (name === "asr") {
      const body = payload as { results?: { text?: string; is_interim?: boolean }[] };
      const last = body.results?.[body.results.length - 1];
      if (!last?.text) return;
      this.options.send({ type: "asr", text: last.text, final: last.is_interim === false });
      if (last.is_interim === false && last.text.startsWith("/")) {
        const tool = interpretUtterance(last.text);
        if (tool) this.acceptTool(tool.name, tool.args);
      }
      return;
    }
    if (name === "chat") {
      const body = payload as { content?: string; text?: string };
      const text = body.content || body.text;
      if (text) this.options.send({ type: "chat", text });
    }
  }
}
