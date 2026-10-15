// Doubao realtime dialogue binary frames.
// Spec: 火山引擎「端到端实时语音大模型 API 接入文档」section 2.2.
// Layout: 4-byte header, optional event id, optional session id, payload size, payload.

export const EventId = {
  StartConnection: 1,
  FinishConnection: 2,
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  ConnectionFinished: 52,
  StartSession: 100,
  FinishSession: 102,
  SessionStarted: 150,
  SessionFinished: 152,
  SessionFailed: 153,
  TaskRequest: 200,
  SayHello: 300,
  ChatTtsText: 500,
  ChatTextQuery: 501,
  ChatRagText: 502,
  AsrInfo: 450,
  AsrResponse: 451,
  AsrEnded: 459,
  TtsSentenceStart: 350,
  TtsResponse: 352,
  TtsEnded: 359,
  ChatResponse: 550,
  ChatEnded: 559,
  DialogCommonError: 599,
} as const;

const CONNECT_EVENTS = new Set<number>([
  EventId.StartConnection,
  EventId.FinishConnection,
  EventId.ConnectionStarted,
  EventId.ConnectionFailed,
  EventId.ConnectionFinished,
]);

const MessageType = {
  FullClient: 0x1,
  AudioClient: 0x2,
  FullServer: 0x9,
  AudioServer: 0xb,
  Error: 0xf,
} as const;

export interface ParsedFrame {
  messageType: number;
  flags: number;
  event: number | null;
  sessionId: string | null;
  payload: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readU32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error(`truncated frame at ${offset}`);
  }
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, false);
}

function writeU32(target: number[], value: number): void {
  target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

export function encodeFrame(options: {
  event: number;
  sessionId?: string;
  payload?: Uint8Array;
  json?: boolean;
  audio?: boolean;
}): Uint8Array {
  const payload = options.payload ?? new Uint8Array();
  const messageType = options.audio ? MessageType.AudioClient : MessageType.FullClient;
  const serialization = options.json === false || options.audio ? 0x0 : 0x1;
  const bytes: number[] = [
    0x11,
    ((messageType & 0x0f) << 4) | 0x04,
    ((serialization & 0x0f) << 4) | 0x00,
    0x00,
  ];
  writeU32(bytes, options.event);
  if (!CONNECT_EVENTS.has(options.event)) {
    const sessionId = options.sessionId ?? "";
    const sessionBytes = textEncoder.encode(sessionId);
    writeU32(bytes, sessionBytes.length);
    for (const byte of sessionBytes) bytes.push(byte);
  }
  writeU32(bytes, payload.length);
  for (const byte of payload) bytes.push(byte);
  return Uint8Array.from(bytes);
}

export function encodeJsonEvent(event: number, payload: unknown, sessionId?: string): Uint8Array {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  return encodeFrame({
    event,
    sessionId,
    payload: textEncoder.encode(json),
    json: true,
  });
}

export function encodeAudioEvent(event: number, audio: Uint8Array, sessionId: string): Uint8Array {
  return encodeFrame({ event, sessionId, payload: audio, audio: true, json: false });
}

export function encodeStartConnection(): Uint8Array {
  return encodeJsonEvent(EventId.StartConnection, {});
}

export function encodeFinishConnection(): Uint8Array {
  return encodeJsonEvent(EventId.FinishConnection, {});
}

export function decodeFrame(data: Uint8Array): ParsedFrame {
  if (data.length < 4) throw new Error("frame too short");
  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  let offset = 4;
  let event: number | null = null;
  if ((flags & 0x04) !== 0) {
    event = readU32(data, offset);
    offset += 4;
  }
  let sessionId: string | null = null;
  if (event !== null && !CONNECT_EVENTS.has(event)) {
    const size = readU32(data, offset);
    offset += 4;
    if (offset + size > data.length) throw new Error("truncated session id");
    sessionId = textDecoder.decode(data.subarray(offset, offset + size));
    offset += size;
  }
  const payloadSize = readU32(data, offset);
  offset += 4;
  if (offset + payloadSize > data.length) throw new Error("truncated payload");
  return {
    messageType,
    flags,
    event,
    sessionId,
    payload: data.subarray(offset, offset + payloadSize),
  };
}

export function payloadText(frame: ParsedFrame): string {
  return textDecoder.decode(frame.payload);
}

export function payloadJson(frame: ParsedFrame): unknown {
  const text = payloadText(frame);
  if (!text) return {};
  return JSON.parse(text);
}

export function isConnectEvent(event: number): boolean {
  return CONNECT_EVENTS.has(event);
}
