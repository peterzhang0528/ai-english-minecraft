export interface WordCard {
  word: string;
  chinese: string;
  sentence: string;
  tip: string;
  topic: "mobs" | "tools" | "blocks" | "places";
}

export interface ToolResult {
  speech: string;
  card: {
    title: string;
    lines: string[];
  };
}

export const WORDS: WordCard[] = [
  { word: "creeper", chinese: "苦力怕", sentence: "A creeper is hissing behind you!", tip: "Run away before it explodes.", topic: "mobs" },
  { word: "zombie", chinese: "僵尸", sentence: "A zombie is coming. Close the door.", tip: "Zombies burn in sunlight.", topic: "mobs" },
  { word: "skeleton", chinese: "骷髅", sentence: "The skeleton is shooting arrows.", tip: "Hide behind a block.", topic: "mobs" },
  { word: "spider", chinese: "蜘蛛", sentence: "I see a spider on the wall.", tip: "Spiders can climb.", topic: "mobs" },
  { word: "enderman", chinese: "末影人", sentence: "Don't look at the enderman.", tip: "Eye contact makes it angry.", topic: "mobs" },
  { word: "pickaxe", chinese: "镐", sentence: "My pickaxe broke.", tip: "Use a pickaxe for stone and ore.", topic: "tools" },
  { word: "sword", chinese: "剑", sentence: "I need a better sword.", tip: "A sword is for fighting mobs.", topic: "tools" },
  { word: "axe", chinese: "斧", sentence: "Chop the tree with an axe.", tip: "An axe is faster on wood.", topic: "tools" },
  { word: "torch", chinese: "火把", sentence: "Place a torch so mobs stay away.", tip: "Light stops most monsters from spawning.", topic: "tools" },
  { word: "crafting table", chinese: "工作台", sentence: "Put the crafting table on the ground.", tip: "You need it to craft tools.", topic: "tools" },
  { word: "diamond", chinese: "钻石", sentence: "I can't find any diamonds.", tip: "Dig deep, but watch out for lava.", topic: "blocks" },
  { word: "iron", chinese: "铁", sentence: "We need more iron.", tip: "Iron ore is common underground.", topic: "blocks" },
  { word: "furnace", chinese: "熔炉", sentence: "Smelt the iron in the furnace.", tip: "Furnaces need fuel, like coal.", topic: "blocks" },
  { word: "obsidian", chinese: "黑曜石", sentence: "Water on lava makes obsidian.", tip: "Mine obsidian with a diamond pickaxe.", topic: "blocks" },
  { word: "chest", chinese: "箱子", sentence: "Put the food in the chest.", tip: "A chest keeps your items safe.", topic: "blocks" },
  { word: "village", chinese: "村庄", sentence: "Let's trade with the village.", tip: "Villagers trade emeralds for goods.", topic: "places" },
  { word: "nether", chinese: "下界", sentence: "The nether is hot and dangerous.", tip: "Bring fire resistance if you can.", topic: "places" },
  { word: "cave", chinese: "洞穴", sentence: "Bring torches into the cave.", tip: "Listen for monsters.", topic: "places" },
  { word: "base", chinese: "基地", sentence: "This is our base.", tip: "A base is your safe home.", topic: "places" },
  { word: "portal", chinese: "传送门", sentence: "Light the portal with flint and steel.", tip: "A nether portal needs obsidian.", topic: "places" },
];

const PHRASES: { zh: string; en: string }[] = [
  { zh: "我的镐坏了", en: "My pickaxe broke." },
  { zh: "我找不到钻石", en: "I can't find any diamonds." },
  { zh: "帮帮我", en: "Can you help me?" },
  { zh: "天黑了", en: "It's getting dark." },
  { zh: "我饿了", en: "I'm hungry." },
  { zh: "小心苦力怕", en: "Watch out for the creeper!" },
  { zh: "我们回家吧", en: "Let's go home." },
  { zh: "这个怎么合成", en: "How do I craft this?" },
  { zh: "我迷路了", en: "I'm lost." },
  { zh: "跟我来", en: "Follow me." },
];

const HINTS: { id: string; speech: string; title: string; lines: string[] }[] = [
  {
    id: "night",
    title: "Night",
    speech: "It's getting dark. Say: Let's go home and sleep. In Chinese, 天黑了，我们回家睡觉吧。",
    lines: ["English: It's getting dark.", "Try: Let's go home and sleep.", "中文：天黑了，我们回家睡觉吧。"],
  },
  {
    id: "lava",
    title: "Lava",
    speech: "Lava is dangerous. Say: Watch out, there is lava! Don't dig straight down.",
    lines: ["English: Watch out, there is lava!", "Tip: Don't dig straight down.", "中文：小心，下面有岩浆！"],
  },
  {
    id: "hungry",
    title: "Hungry",
    speech: "You are hungry. Say: I'm hungry. Let's cook some food.",
    lines: ["English: I'm hungry.", "Try: Let's cook some food.", "中文：我饿了，我们做点吃的吧。"],
  },
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cardFromWord(word: WordCard): ToolResult {
  return {
    speech: `${word.word}. ${word.chinese}. Try this sentence: ${word.sentence}`,
    card: {
      title: word.word,
      lines: [
        `中文：${word.chinese}`,
        `Sentence: ${word.sentence}`,
        `Tip: ${word.tip}`,
      ],
    },
  };
}

export function lookupWord(query: string): ToolResult {
  const needle = query.trim().toLowerCase();
  const found = WORDS.find(
    (word) => word.word === needle || word.chinese === query.trim() || needle.includes(word.word),
  );
  if (!found) {
    const samples = WORDS.slice(0, 6).map((word) => word.word).join(", ");
    return {
      speech: `I don't have a card for that yet. Try one of these words: ${samples}.`,
      card: {
        title: "Word list",
        lines: [`Try: ${samples}`, "Say: What is a creeper?"],
      },
    };
  }
  return cardFromWord(found);
}

export function startQuiz(topic: string, seed = 1): ToolResult {
  const normalized = topic.trim().toLowerCase();
  const pool = WORDS.filter((word) => !normalized || normalized === "any" || word.topic === normalized);
  const choices = pool.length >= 3 ? pool : WORDS;
  const rand = mulberry32(seed || 1);
  const answer = choices[Math.floor(rand() * choices.length)];
  const distractors: WordCard[] = [];
  while (distractors.length < 2) {
    const pick = WORDS[Math.floor(rand() * WORDS.length)];
    if (pick.word !== answer.word && !distractors.some((item) => item.word === pick.word)) {
      distractors.push(pick);
    }
  }
  const options = [answer, ...distractors];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const labels = ["A", "B", "C"];
  const spoken = options.map((word, index) => `${labels[index]} ${word.word}`).join(", ");
  return {
    speech: `Quiz time. Which word means ${answer.chinese}? ${spoken}. The answer is ${answer.word}. ${answer.sentence}`,
    card: {
      title: `Quiz · ${answer.chinese}`,
      lines: [
        ...options.map((word, index) => `${labels[index]}. ${word.word}`),
        `Answer: ${answer.word}`,
        answer.sentence,
      ],
    },
  };
}

export function translatePhrase(chinese: string): ToolResult {
  const query = chinese.trim();
  const found = PHRASES.find((phrase) => query.includes(phrase.zh) || phrase.zh.includes(query));
  if (!found) {
    return {
      speech: "You can say: Can you help me? I am learning English in Minecraft.",
      card: {
        title: "Say it in English",
        lines: ["Can you help me?", "I am learning English in Minecraft.", "中文：你能帮我吗？我在 Minecraft 里学英语。"],
      },
    };
  }
  return {
    speech: `In English, say: ${found.en}`,
    card: {
      title: found.zh,
      lines: [`English: ${found.en}`, "Repeat it slowly, then try it in the game chat."],
    },
  };
}

export function situationHint(situation: string): ToolResult {
  const query = situation.trim().toLowerCase();
  const found = HINTS.find((hint) => query.includes(hint.id) || hint.title.toLowerCase() === query);
  const hint = found ?? HINTS[0];
  return {
    speech: hint.speech,
    card: { title: hint.title, lines: hint.lines },
  };
}

export function executeTool(name: string, args: Record<string, unknown>): ToolResult {
  if (name === "lookup_word") return lookupWord(String(args.word ?? args.query ?? ""));
  if (name === "start_quiz") {
    const seed = Number(args.seed ?? 1);
    return startQuiz(String(args.topic ?? "any"), Number.isFinite(seed) ? seed : 1);
  }
  if (name === "translate_phrase") return translatePhrase(String(args.chinese ?? args.text ?? ""));
  if (name === "situation_hint") return situationHint(String(args.situation ?? "night"));
  return {
    speech: "I can look up a word, start a quiz, translate a phrase, or give a night, lava, or hungry hint.",
    card: {
      title: "Maple tools",
      lines: ["lookup_word", "start_quiz", "translate_phrase", "situation_hint"],
    },
  };
}

export function interpretUtterance(text: string): { name: string; args: Record<string, unknown> } | null {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;
  if (/^(\/quiz|quiz me|考我|来一题)/i.test(raw)) {
    const topic = raw.replace(/^(\/quiz|quiz me|考我|来一题)\s*/i, "").trim();
    return { name: "start_quiz", args: { topic: topic || "any", seed: 7 } };
  }
  const wordCommand = raw.match(/^\/word\s+(.+)$/i);
  if (wordCommand) return { name: "lookup_word", args: { word: wordCommand[1] } };
  const whatIs = raw.match(/what is (?:a |an )?([a-z][a-z\s-]{1,40})\??$/i);
  if (whatIs) return { name: "lookup_word", args: { word: whatIs[1] } };
  if (/是什么/.test(raw)) {
    const word = WORDS.find((item) => lower.includes(item.word) || raw.includes(item.chinese));
    if (word) return { name: "lookup_word", args: { word: word.word } };
  }
  const phrase = raw.match(/^\/phrase\s+(.+)$/);
  if (phrase) return { name: "translate_phrase", args: { chinese: phrase[1] } };
  if (/怎么说/.test(raw)) return { name: "translate_phrase", args: { chinese: raw } };
  if (/(天黑|night)/i.test(raw)) return { name: "situation_hint", args: { situation: "night" } };
  if (/(岩浆|lava)/i.test(raw)) return { name: "situation_hint", args: { situation: "lava" } };
  if (/(饿|hungry)/i.test(raw)) return { name: "situation_hint", args: { situation: "hungry" } };
  return null;
}
