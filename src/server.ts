import path from "node:path";
import { loadConfig, loadEnvFile, missingCredentials } from "./voice/config.ts";
import { createMapleServer } from "./voice/gateway.ts";
import { tutorSettingsFromEnv } from "./tutor/reply.ts";

const root = path.resolve(import.meta.dirname, "..");
loadEnvFile(path.join(root, ".env"));
const config = loadConfig();
const tutor = tutorSettingsFromEnv();
const missing = missingCredentials(config);
const server = createMapleServer({ webRoot: path.join(root, "web"), config, tutor });

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Maple 英语伴学已打开：http://127.0.0.1:${config.port}`);
  console.log("同学直接打开首页，点「开始玩」。不用安装 Minecraft。");
  if (tutor.apiKey) {
    console.log("Anthropic 陪练已配置。密钥只留在服务端，不会写进网页。");
  } else {
    console.log("未设置 ANTHROPIC_API_KEY，浏览器演示使用本地陪练。");
  }
  if (config.mock) {
    console.log("当前是本地排练（DOUBAO_MOCK=1），不会连接豆包，也不会使用密钥。");
  } else if (missing.length) {
    console.log(`豆包语音凭证未配置：${missing.join("、")}。浏览器里玩不需要它们。语音页可稍后填写 .env，或先用 DOUBAO_MOCK=1。`);
  } else {
    console.log("豆包凭证已配置。Access Token 只留在本机，不会写进网页。");
  }
});
