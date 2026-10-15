# Maple 课堂演示（约 5 分钟）

给还没有豆包额度的同学：先在项目目录运行 `DOUBAO_MOCK=1 npm start`，打开 <http://127.0.0.1:8787> 。本地排练不连接豆包。

已经开通免费试用的同学：把 App ID 和 Access Token 写进 `.env`（不要写进这个文件），然后 `npm start`。

## 演示顺序

1. 打开网页，指出标题 **Maple · Minecraft 英语伴学**。说明麦克风的声音先到你自己的电脑，再由电脑去连豆包，网页里看不到 Access Token。
2. 点 **creeper 是什么**。单词卡应出现 creeper / 苦力怕，以及一句英语 `A creeper is hissing behind you!`
3. 跟读这句英语。真实通话时可以对着麦克风说；排练模式可以在输入框打 `A creeper is hissing behind you!` 再发送。
4. 点 **「我的镐坏了」怎么说**。Maple 应给出 `My pickaxe broke.`
5. 点 **考我一题**。听完 A/B/C 后，让一位同学口头选答案。卡片上有 Answer。
6. 如果已经 `开始通话` 并且豆包连通，说 `Hello Maple`，等 Maple 用英语回答，并在括号里给中文提示。
7. 切回 Minecraft：把刚学的句子打进聊天，例如 `Watch out for the creeper!`

## 同学可以接着说的句子

- `What is a diamond?`
- `I can't find any diamonds.`
- `It's getting dark.`
- `How do I craft this?`

## 排错

| 现象 | 处理 |
| --- | --- |
| 页面提示缺少 `DOUBAO_APP_ID` 或 `DOUBAO_ACCESS_TOKEN` | 复制 `.env.example` 为 `.env` 再填写。或先设 `DOUBAO_MOCK=1` |
| 麦克风没声音 | 浏览器地址栏允许麦克风；用 `localhost`，不要用奇怪的文件路径打开网页 |
| 豆包返回 401 / 403 | Access Token 填错，或控制台里的试用还没开通、已经过期 |
| 能连上但没有声音 | 检查系统音量。文档默认音色是 `zh_female_vv_jupiter_bigtts`，可在 `.env` 的 `DOUBAO_SPEAKER` 更换 |
| 额度用完 | 控制台会显示用量。不要把 Token 发给别人续用 |

## 不要提交的东西

- `.env`
- 任何 App ID、Access Token、控制台截图里的密钥

`DOUBAO_APP_KEY` 的默认值 `PlgvMymc7f3tQnJ6` 来自火山引擎公开接入文档，是固定值，可以留在 `.env.example`。
