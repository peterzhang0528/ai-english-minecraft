import { randomUUID } from "node:crypto";
import {
  EventId,
  decodeFrame,
  encodeAudioEvent,
  encodeFinishConnection,
  encodeJsonEvent,
  encodeStartConnection,
  payloadJson,
  type ParsedFrame,
} from "./protocol.ts";
import { doubaoHeaders, missingCredentials, type DoubaoConfig } from "./config.ts";

export interface Upstream {
  send(data: Uint8Array): void;
  close(): void;
  onFrame(handler: (frame: ParsedFrame) => void): void;
  onClose(handler: () => void): void;
}

export interface ByteSocket {
  send(data: Uint8Array): void;
  close(): void;
  onMessage(handler: (data: Uint8Array) => void): void;
  onClose(handler: () => void): void;
}

export function socketToUpstream(socket: ByteSocket): Upstream {
  return {
    send(data) {
      socket.send(data);
    },
    close() {
      socket.close();
    },
    onFrame(handler) {
      socket.onMessage((data) => {
        try {
          handler(decodeFrame(data));
        } catch {
          // Ignore a partial or non-protocol message. The relay surfaces real API errors.
        }
      });
    },
    onClose(handler) {
      socket.onClose(handler);
    },
  };
}

export function mapleSessionPayload(config: DoubaoConfig): Record<string, unknown> {
  return {
    asr: {
      audio_info: { format: "pcm", sample_rate: 16000, channel: 1 },
      extra: { end_smooth_window_ms: 1500 },
    },
    tts: {
      speaker: config.speaker,
      audio_config: { format: "pcm_s16le", sample_rate: 24000, channel: 1 },
      extra: {},
    },
    dialog: {
      bot_name: "Maple",
      system_role:
        "You are Maple, a kind Minecraft friend helping Chinese students practice English. " +
        "Speak short, clear English at A1-A2 level, mostly one or two sentences. " +
        "After the English, add a brief Chinese hint in parentheses. " +
        "Talk about Minecraft blocks, tools, mobs, building, and classroom English. " +
        "Encourage the student to repeat a sentence. Never ask for passwords, API keys, or tokens.",
      speaking_style: "Warm, slow, and clear, like a patient classmate.",
      extra: {
        model: config.model,
        input_mod: "keep_alive",
        strict_audit: true,
      },
    },
  };
}

export const MAPLE_HELLO = "Hi! I'm Maple. Let's practice English in Minecraft. (你好，我是 Maple，我们一起在 Minecraft 里练英语。)";

export interface LiveSession {
  sessionId: string;
  start(): void;
  handle(frame: ParsedFrame): void;
  sendAudio(pcm: Uint8Array): void;
  sendText(text: string): void;
  speak(text: string): void;
  finish(): void;
  readonly ready: boolean;
}

export interface SessionEvents {
  onReady?: () => void;
  onEvent?: (name: string, payload: unknown) => void;
  onAudio?: (audio: Uint8Array) => void;
  onError?: (message: string) => void;
  onClosed?: () => void;
}

export function createLiveSession(upstream: Upstream, config: DoubaoConfig, events: SessionEvents = {}): LiveSession {
  const sessionId = randomUUID();
  let ready = false;
  let started = false;
  let finished = false;

  function sendJson(event: number, payload: unknown, withSession = true): void {
    upstream.send(encodeJsonEvent(event, payload, withSession ? sessionId : undefined));
  }

  const session: LiveSession = {
    sessionId,
    get ready() {
      return ready;
    },
    start() {
      if (started) return;
      started = true;
      upstream.send(encodeStartConnection());
    },
    handle(frame) {
      if (frame.event === EventId.ConnectionStarted) {
        sendJson(EventId.StartSession, mapleSessionPayload(config));
        return;
      }
      if (frame.event === EventId.ConnectionFailed) {
        const body = payloadJson(frame) as { error?: string };
        events.onError?.(body.error || "Doubao connection failed");
        return;
      }
      if (frame.event === EventId.SessionStarted) {
        ready = true;
        sendJson(EventId.SayHello, { content: MAPLE_HELLO });
        events.onReady?.();
        return;
      }
      if (frame.event === EventId.SessionFailed || frame.event === EventId.DialogCommonError) {
        const body = payloadJson(frame) as { error?: string; message?: string };
        events.onError?.(body.error || body.message || "Doubao session failed");
        return;
      }
      if (frame.event === EventId.TtsResponse) {
        events.onAudio?.(frame.payload);
        return;
      }
      if (frame.event === EventId.AsrResponse) {
        events.onEvent?.("asr", payloadJson(frame));
        return;
      }
      if (frame.event === EventId.ChatResponse || frame.event === EventId.TtsSentenceStart) {
        events.onEvent?.("chat", payloadJson(frame));
        return;
      }
      if (frame.event === EventId.AsrEnded || frame.event === EventId.ChatEnded || frame.event === EventId.TtsEnded) {
        events.onEvent?.("turn_end", { event: frame.event });
      }
    },
    sendAudio(pcm) {
      if (!ready || pcm.length === 0) return;
      upstream.send(encodeAudioEvent(EventId.TaskRequest, pcm, sessionId));
    },
    sendText(text) {
      if (!ready) return;
      sendJson(EventId.ChatTextQuery, { content: text });
    },
    speak(text) {
      if (!ready) return;
      sendJson(EventId.ChatTtsText, { start: true, content: text, end: false });
      sendJson(EventId.ChatTtsText, { start: false, content: "", end: true });
    },
    finish() {
      if (finished) return;
      finished = true;
      ready = false;
      if (started) {
        sendJson(EventId.FinishSession, {});
        upstream.send(encodeFinishConnection());
      }
      upstream.close();
      events.onClosed?.();
    },
  };

  upstream.onFrame((frame) => session.handle(frame));
  upstream.onClose(() => {
    ready = false;
    events.onClosed?.();
  });
  return session;
}

function pcmTone(sampleRate: number, frequency: number, ms: number): Uint8Array {
  const count = Math.floor((sampleRate * ms) / 1000);
  const bytes = new Uint8Array(count * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < count; i += 1) {
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.2;
    view.setInt16(i * 2, Math.round(sample * 0x7fff), true);
  }
  return bytes;
}

export function openMockUpstream(): Upstream {
  let onFrame: ((frame: ParsedFrame) => void) | null = null;
  let onClose: (() => void) | null = null;
  let closed = false;
  let sessionId = "";
  let heardAudio = false;

  function emit(event: number, payload: unknown, withSession = true): void {
    if (closed || !onFrame) return;
    const frameBytes = encodeJsonEvent(event, payload, withSession ? sessionId : undefined);
    onFrame(decodeFrame(frameBytes));
  }

  function emitAudio(pcm: Uint8Array): void {
    if (closed || !onFrame) return;
    onFrame(decodeFrame(encodeAudioEvent(EventId.TtsResponse, pcm, sessionId || "mock")));
  }

  return {
    send(data) {
      const frame = decodeFrame(data);
      if (frame.event === EventId.StartConnection) {
        emit(EventId.ConnectionStarted, {}, false);
        return;
      }
      if (frame.event === EventId.StartSession) {
        sessionId = frame.sessionId || "mock-session";
        emit(EventId.SessionStarted, { dialog_id: "mock" });
        return;
      }
      if (frame.event === EventId.SayHello) {
        const body = payloadJson(frame) as { content?: string };
        emit(EventId.ChatResponse, { content: body.content || "" });
        emitAudio(pcmTone(24000, 523, 180));
        emit(EventId.TtsEnded, {});
        return;
      }
      if (frame.event === EventId.ChatTextQuery || frame.event === EventId.ChatTtsText) {
        const body = payloadJson(frame) as { content?: string; start?: boolean; end?: boolean };
        if (frame.event === EventId.ChatTtsText && body.end && !body.content) return;
        const content = body.content || "Let's try that sentence again.";
        if (frame.event === EventId.ChatTextQuery) emit(EventId.ChatResponse, { content: `Nice. Repeat after me: ${content}` });
        emitAudio(pcmTone(24000, 440, 160));
        emit(EventId.TtsEnded, {});
        return;
      }
      if (frame.event === EventId.TaskRequest && frame.payload.length > 0 && !heardAudio) {
        heardAudio = true;
        emit(EventId.AsrResponse, { results: [{ text: "Hello Maple", is_interim: false }] });
        emit(EventId.AsrEnded, {});
        emit(EventId.ChatResponse, { content: "Hello! Say: I need a wooden pickaxe. (你好！试着说：我需要一把木镐。)" });
        emitAudio(pcmTone(24000, 392, 140));
        return;
      }
      if (frame.event === EventId.FinishConnection) {
        emit(EventId.ConnectionFinished, {}, false);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      onClose?.();
    },
    onFrame(handler) {
      onFrame = handler;
    },
    onClose(handler) {
      onClose = handler;
    },
  };
}

export async function openDoubaoUpstream(config: DoubaoConfig): Promise<Upstream> {
  if (config.mock) return openMockUpstream();
  const missing = missingCredentials(config);
  if (missing.length) {
    throw new Error(`缺少环境变量：${missing.join("、")}。复制 .env.example 为 .env 后填写豆包试用凭证。`);
  }
  const { default: WebSocket } = await import("ws");
  const socket = new WebSocket(config.wsUrl, {
    headers: doubaoHeaders(config, randomUUID()),
    handshakeTimeout: 10000,
  });
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      socket.terminate();
      reject(error);
    };
    socket.once("open", () => resolve());
    socket.once("error", (error: Error) => fail(error));
    socket.once("unexpected-response", (_request: unknown, response: { statusCode?: number }) => {
      fail(new Error(`Doubao handshake failed: HTTP ${response.statusCode ?? "?"}`));
    });
  });
  return socketToUpstream({
    send(data) {
      socket.send(data);
    },
    close() {
      socket.close();
    },
    onMessage(handler) {
      socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
        handler(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      });
    },
    onClose(handler) {
      socket.on("close", () => handler());
    },
  });
}

export function describeAudio(payload: Uint8Array): { format: "ogg" | "pcm"; sampleRate: number } {
  const ogg = payload.length >= 4 && payload[0] === 0x4f && payload[1] === 0x67 && payload[2] === 0x67 && payload[3] === 0x53;
  return ogg ? { format: "ogg", sampleRate: 24000 } : { format: "pcm", sampleRate: 24000 };
}
