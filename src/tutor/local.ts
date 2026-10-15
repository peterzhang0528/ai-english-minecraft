import { executeTool, interpretUtterance, type ToolResult } from "../voice/tools.ts";

export type TutorAction = "follow" | "wait" | "none";

export interface TutorReply {
  say: string;
  chinese: string;
  correction: string | null;
  action: TutorAction;
  source: "local" | "anthropic";
}

const GREETING: TutorReply = {
  say: "Hi! I'm Maple. Walk a little, then tell me what you see.",
  chinese: "你好，我是 Maple。走两步，再说说你看到什么。",
  correction: null,
  action: "none",
  source: "local",
};

function reply(partial: Omit<TutorReply, "source">): TutorReply {
  return { ...partial, source: "local" };
}

function wantsWait(raw: string): boolean {
  if (/停下|别跟|在这等|站住|等等/.test(raw)) return true;
  return /^(stop|wait|stay|wait here)\b/i.test(raw);
}

function wantsFollow(raw: string): boolean {
  if (/\b(don'?t|do not)\b/i.test(raw)) return false;
  if (/跟我来|跟着我|跟我走/.test(raw)) return true;
  return /\bfollow me\b/i.test(raw) || /\bcome with me\b/i.test(raw);
}

function glossFromCard(result: ToolResult): string {
  const line = result.card.lines.find((item) => item.startsWith("中文："));
  if (line) return line.slice("中文：".length).trim();
  return result.card.lines[0] || "";
}

function englishFromCard(result: ToolResult): string | null {
  const line = result.card.lines.find((item) => item.startsWith("English:"));
  if (!line) return null;
  const sentence = line.slice("English:".length).trim();
  return sentence || null;
}

export function fixEnglish(input: string): { text: string; changed: boolean } {
  let text = input.trim().replace(/\s+/g, " ");
  if (!text) return { text: "", changed: false };
  const replacements: [RegExp, string][] = [
    [/\bi'm\b/gi, "I'm"],
    [/\bim\b/gi, "I'm"],
    [/\bdont\b/gi, "don't"],
    [/\bcant\b/gi, "can't"],
    [/\bwont\b/gi, "won't"],
    [/\blets\b/gi, "let's"],
    [/\bits\b/gi, "it's"],
  ];
  for (const [pattern, value] of replacements) text = text.replace(pattern, value);
  text = text.replace(/\bvery like\b/gi, "really like");
  text = text.replace(/\bgo to home\b/gi, "go home");
  text = text.replace(
    /\b(he|she|it)\s+(go|like|want|need|have|see|mine|walk|come)\b/gi,
    (full, subject: string, verb: string) => {
      const name = subject.toLowerCase();
      const titled = name[0].toUpperCase() + name.slice(1);
      const subjectOut = /^[A-Z]/.test(subject) ? titled : name;
      const base = verb.toLowerCase();
      const third = base === "have" ? "has" : base === "go" ? "goes" : `${base}s`;
      return `${subjectOut} ${third}`;
    },
  );
  text = text.replace(
    /\b(see|mine|need|want|place|has|needs|wants)\s+(tree|creeper|pickaxe|diamond|cave|torch|sword|zombie|spider|village)\b/gi,
    (_full, verb: string, noun: string) => `${verb} a ${noun.toLowerCase()}`,
  );
  text = text.replace(/\ba ([aeiou])/gi, "an $1");
  text = text.replace(/\bi\b/g, "I");
  text = text.replace(/^[a-z]/, (letter) => letter.toUpperCase());
  if (!/[.!?]$/.test(text)) text += ".";
  const words = (value: string) => value.toLowerCase().replace(/[.!?]/g, "").replace(/\s+/g, " ").trim();
  return { text, changed: words(input) !== words(text) };
}

function knownReply(text: string): TutorReply | null {
  if (/^(hi|hello|hey)\b/i.test(text)) return GREETING;
  if (/\bi see (a )?tree\b/i.test(text)) {
    return reply({
      say: "Yes! The brown block is wood, and the green top is leaves.",
      chinese: "对。棕色是木头 wood，上面的绿色是树叶 leaves。",
      correction: null,
      action: "none",
    });
  }
  if (/\bi see grass\b/i.test(text)) {
    return reply({
      say: "Yes. Grass is the green block under your feet.",
      chinese: "对。脚下的绿色方块就是 grass。",
      correction: null,
      action: "none",
    });
  }
  if (/\bi see water\b/i.test(text)) {
    return reply({
      say: "Yes. The blue block is water. You can say: I see water.",
      chinese: "对。蓝色的是水 water。",
      correction: null,
      action: "none",
    });
  }
  return null;
}

export function localTutor(text: string): TutorReply {
  const raw = text.trim().slice(0, 400);
  if (!raw) {
    return reply({
      say: "Type a short English sentence, or tap one of the buttons.",
      chinese: "打一句英语，或点下面的按钮。",
      correction: null,
      action: "none",
    });
  }

  if (wantsWait(raw)) {
    return reply({
      say: "Okay, I'll wait here.",
      chinese: "好，我在这里等你。",
      correction: /[\u4e00-\u9fff]/.test(raw) ? "Wait here." : null,
      action: "wait",
    });
  }

  if (wantsFollow(raw)) {
    const alreadyEnglish = /\bfollow me\b/i.test(raw) && !/[\u4e00-\u9fff]/.test(raw);
    return reply({
      say: "Okay, I'll follow you. Walk slowly so I can stay close.",
      chinese: "好，我跟着你。走慢一点。",
      correction: alreadyEnglish ? null : "Follow me.",
      action: "follow",
    });
  }

  const tool = interpretUtterance(raw);
  if (tool) {
    const result = executeTool(tool.name, tool.args);
    const askedInChinese = /[\u4e00-\u9fff]/.test(raw);
    return reply({
      say: result.speech,
      chinese: glossFromCard(result) || result.card.title,
      correction: askedInChinese ? englishFromCard(result) : null,
      action: "none",
    });
  }

  if (/^(你好|嗨|哈喽)/.test(raw) && raw.length <= 12) {
    return reply({
      ...GREETING,
      correction: "Hello, Maple.",
      source: "local",
    });
  }

  if (/[\u4e00-\u9fff]/.test(raw)) {
    const result = executeTool("translate_phrase", { chinese: raw });
    return reply({
      say: result.speech,
      chinese: "先跟读这句英语。",
      correction: englishFromCard(result) || "Can you help me?",
      action: "none",
    });
  }

  const fixed = fixEnglish(raw);
  if (fixed.changed) {
    return reply({
      say: `Close. You can say: ${fixed.text}`,
      chinese: "差不多了。用下面这句再试一次。",
      correction: fixed.text,
      action: "none",
    });
  }

  return knownReply(raw) ?? reply({
    say: "I heard you. Say one short sentence about this world.",
    chinese: "我听到了。用一句短英语说说这个世界，例如 I see grass.",
    correction: null,
    action: "none",
  });
}
