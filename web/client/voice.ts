export interface MapleEvent {
  type: string;
  text?: string;
  title?: string;
  lines?: string[];
  message?: string;
  format?: "pcm" | "ogg";
  sampleRate?: number;
  data?: string;
  final?: boolean;
}

export type MapleHandler = (event: MapleEvent) => void;

export function defaultVoiceUrl(): string {
  if (typeof location === "undefined") return "ws://127.0.0.1:8787/voice";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/voice`;
}

export function floatToPcm16(input: Float32Array, inputRate: number, outputRate = 16000): Int16Array {
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j];
      count += 1;
    }
    const sample = count ? sum / count : input[Math.min(start, input.length - 1)] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

export function pcm16ToFloat(pcm: Uint8Array): Float32Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = new Float32Array(Math.floor(pcm.byteLength / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
}

export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class MapleVoice {
  socket: WebSocket | null = null;
  handlers = new Set<MapleHandler>();
  audioContext: AudioContext | null = null;
  media: MediaStream | null = null;
  processor: ScriptProcessorNode | null = null;
  playTime = 0;
  url: string;

  constructor(url = defaultVoiceUrl()) {
    this.url = url;
  }

  on(handler: MapleHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      socket.binaryType = "arraybuffer";
      this.socket = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("无法连接 Maple 语音网关"));
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const parsed = JSON.parse(event.data) as MapleEvent;
        if (parsed.type === "audio" && parsed.data) void this.play(parsed);
        for (const handler of this.handlers) handler(parsed);
      };
      socket.onclose = () => {
        this.emit({ type: "status", text: "连接已断开" });
      };
    });
  }

  async startCall(): Promise<void> {
    await this.connect();
    this.sendJson({ type: "session.start" });
    await this.startMic();
  }

  sendText(text: string): void {
    this.sendJson({ type: "text", text });
  }

  runTool(name: string, args: Record<string, unknown> = {}): void {
    this.sendJson({ type: "tool", name, args });
  }

  stop(): void {
    this.processor?.disconnect();
    this.processor = null;
    this.media?.getTracks().forEach((track) => track.stop());
    this.media = null;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendJson({ type: "session.stop" });
    }
    this.socket?.close();
    this.socket = null;
  }

  sendJson(message: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  emit(event: MapleEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  async startMic(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    this.audioContext = this.audioContext ?? new AudioContext();
    this.media = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext.createMediaStreamSource(this.media);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    processor.onaudioprocess = (event) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.audioContext) return;
      const pcm = floatToPcm16(event.inputBuffer.getChannelData(0), this.audioContext.sampleRate);
      this.socket.send(pcm.buffer);
    };
    const silent = this.audioContext.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(this.audioContext.destination);
  }

  async play(event: MapleEvent): Promise<void> {
    if (!event.data || typeof AudioContext === "undefined") return;
    this.audioContext = this.audioContext ?? new AudioContext();
    const bytes = decodeBase64(event.data);
    const sampleRate = event.sampleRate || 24000;
    let buffer: AudioBuffer;
    if (event.format === "ogg") {
      buffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    } else {
      const samples = pcm16ToFloat(bytes);
      buffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
    }
    const node = this.audioContext.createBufferSource();
    node.buffer = buffer;
    node.connect(this.audioContext.destination);
    const startAt = Math.max(this.audioContext.currentTime + 0.05, this.playTime);
    node.start(startAt);
    this.playTime = startAt + buffer.duration;
  }
}
