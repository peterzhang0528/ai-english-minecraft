import path from "node:path";
import { loadConfig, loadEnvFile, missingCredentials } from "./voice/config.ts";
import { createMapleServer } from "./voice/gateway.ts";

const root = path.resolve(import.meta.dirname, "..");
loadEnvFile(path.join(root, ".env"));
const config = loadConfig();
const missing = missingCredentials(config);
const server = createMapleServer({ webRoot: path.join(root, "web"), config });

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Maple 英语伴学已打开：http://127.0.0.1:${config.port}`);
  if (config.mock) {
    console.log("当前是本地排练（DOUBAO_MOCK=1），不会连接豆包，也不会使用密钥。");
  } else if (missing.length) {
    console.log(`豆包凭证未配置：${missing.join("、")}。填写 .env，或先用 DOUBAO_MOCK=1 看界面。`);
  } else {
    console.log("豆包凭证已配置。Access Token 只留在本机，不会写进网页。");
  }
});
