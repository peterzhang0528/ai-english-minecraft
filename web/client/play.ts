import { renderWorld } from "./render.ts";
import {
  createWorld,
  lookingAt,
  look,
  seeSentence,
  setFollow,
  step,
  type MoveInput,
  type World,
} from "./world.ts";

interface TutorPayload {
  say?: string;
  chinese?: string;
  correction?: string | null;
  action?: string;
  source?: string;
  error?: string;
}

const world: World = createWorld();
const held: MoveInput = { forward: false, back: false, left: false, right: false, jump: false };
const keys = new Set<string>();

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const log = document.querySelector<HTMLElement>("#log");
const line = document.querySelector<HTMLInputElement>("#line");
const followButton = document.querySelector<HTMLButtonElement>("#follow");
const mapleState = document.querySelector<HTMLElement>("#maple-state");
const looking = document.querySelector<HTMLElement>("#looking");
const tutorMode = document.querySelector<HTMLElement>("#tutor-mode");
const form = document.querySelector<HTMLFormElement>("#composer");

function syncViewport(): void {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-h", `${height}px`);
}

function addBubble(text: string, kind: "me" | "maple" | "fix"): void {
  if (!log) return;
  const item = document.createElement("div");
  item.className = `bubble ${kind}`;
  item.textContent = text;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

function syncFollow(): void {
  if (followButton) followButton.textContent = world.maple.follow ? "停下" : "跟我来";
  if (mapleState) {
    mapleState.textContent = world.maple.follow ? "Maple 正在跟着你" : "穿红衣服的 Maple 站在旁边";
  }
}

function keyboardInput(): MoveInput {
  const down = (name: string) => keys.has(name);
  return {
    forward: held.forward || down("w") || down("arrowup"),
    back: held.back || down("s") || down("arrowdown"),
    left: held.left || down("a") || down("arrowleft"),
    right: held.right || down("d") || down("arrowright"),
    jump: held.jump || down(" "),
  };
}

function bindPad(button: HTMLButtonElement): void {
  const dir = button.dataset.move;
  if (dir !== "forward" && dir !== "back" && dir !== "left" && dir !== "right" && dir !== "jump") return;
  const press = (event: PointerEvent) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    held[dir] = true;
    button.classList.add("down");
  };
  const release = () => {
    held[dir] = false;
    button.classList.remove("down");
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

let drag: { id: number; x: number; y: number } | null = null;

function bindLook(): void {
  if (!canvas) return;
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    look(world, dx, dy);
  });
  const end = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) drag = null;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

let sending = false;

async function send(text: string, focusAfter = false): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || sending) return;
  sending = true;
  addBubble(`你：${trimmed}`, "me");
  if (line && line.value.trim() === trimmed) line.value = "";
  try {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });
    const payload = await response.json() as TutorPayload;
    if (!response.ok || !payload.say) {
      addBubble("Maple 暂时没接到这句话。你可以继续在画面里走动。", "maple");
      return;
    }
    const gloss = payload.chinese ? `（${payload.chinese}）` : "";
    addBubble(`Maple：${payload.say}${gloss}`, "maple");
    if (payload.correction && payload.correction.trim() && payload.correction.trim() !== trimmed) {
      addBubble(`更自然的说法：${payload.correction}`, "fix");
    }
    if (payload.action === "follow") setFollow(world, true);
    if (payload.action === "wait") setFollow(world, false);
    if (tutorMode) {
      tutorMode.textContent = payload.source === "anthropic"
        ? "云端陪练已接通。密钥只留在服务器上。"
        : "本地英语陪练，不需要账号或密钥。";
    }
    syncFollow();
  } catch {
    addBubble("网络中断了。走路和转身仍然可用，英语可以等一下再发。", "maple");
  } finally {
    sending = false;
    if (focusAfter) line?.focus();
  }
}

function bindChat(): void {
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void send(line?.value || "", true);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-say]").forEach((button) => {
    button.addEventListener("click", () => {
      void send(button.dataset.say || "");
    });
  });
  followButton?.addEventListener("click", () => {
    void send(world.maple.follow ? "Wait here." : "Follow me.");
  });
  document.querySelector<HTMLButtonElement>("#look-block")?.addEventListener("click", () => {
    const block = lookingAt(world);
    void send(block ? seeSentence(block.en) : "I see grass.");
  });
}

function bindKeys(): void {
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    keys.add(event.key.toLowerCase());
    if (event.key === " ") event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });
  window.addEventListener("blur", () => keys.clear());
}

function loop(): void {
  let last = performance.now();
  let seen = "";
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(world, keyboardInput(), dt);
    if (canvas) renderWorld(world, canvas);
    const block = lookingAt(world);
    const label = block ? `看着：${block.en} · ${block.zh}` : "看着：天空";
    if (looking && label !== seen) {
      looking.textContent = label;
      seen = label;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

syncViewport();
window.visualViewport?.addEventListener("resize", syncViewport);
window.addEventListener("resize", syncViewport);
document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach(bindPad);
bindLook();
bindChat();
bindKeys();
syncFollow();
loop();
