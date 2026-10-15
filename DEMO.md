# Maple 课堂演示（约 5 分钟）

同学第一次试用，用浏览器。把首页链接发到群里，并附上这一句：

> 打开这个链接就能和 Maple 玩英语，不用装 Minecraft。

iPad（包括香港的同学）用 Safari 打开即可。不用安装 Minecraft，也不用把基岩版连到 Java 服务器。

在自己电脑上先跑起来：

```bash
npm install
npm run web
```

打开 <http://127.0.0.1:8787> 。没有 `ANTHROPIC_API_KEY` 也会有本地陪练。

## 演示顺序

1. 打开首页。指出标题是分享演示：打开链接就能玩，不用安装。把「发给同学的一句话」念出来。
2. 点 **开始玩**。说明穿红衣服的是 Maple。
3. 在画面上滑动转身，点 **前** 走两步。不要先讲键盘。
4. 点 **I see a tree** 或 **说说我看着的方块**。Maple 用英语回答，并在括号里给中文。
5. 点 **镐坏了怎么说**。应出现更自然的说法 `My pickaxe broke.`
6. 点 **跟我来**。Maple 走到你旁边。再说一句 `Wait here.` 或点 **停下**，她会站住。
7. 如果还想看语音：打开 `/voice`。没有豆包额度时先在项目目录运行 `DOUBAO_MOCK=1 npm run web`。这是进阶，不是同学试用的必经步骤。
8. 完整的 Minecraft Java 以后可以再装，把刚学的句子打进游戏聊天。现在先停在浏览器里。

## 已经开通豆包时

把 App ID 和 Access Token 写进 `.env`（不要写进这个文件），然后 `npm run web`，从 `/voice` 点 **开始通话**。可以说 `Hello Maple`。

## 同学可以接着说的句子

- `What is a diamond?`
- `I can't find any diamonds.`
- `It's getting dark.`
- `How do I craft this?`
- `he go to the cave`（Maple 会改成 `He goes to the cave.`）

## 排错

| 现象 | 处理 |
| --- | --- |
| iPad 上页面在滚、不好转身 | 手指放在画面上滑动，走路用「前 / 左 / 后 / 右」，不要依赖键盘 |
| 英语没有回复 | 确认打开的是 `/play`，不是把网页存成了文件。本地陪练不需要密钥 |
| 页面提示缺少 `DOUBAO_APP_ID` | 那是语音页。浏览器里玩不用管；或设置 `DOUBAO_MOCK=1` |
| 麦克风没声音 | 只影响 `/voice`。先允许麦克风，并用 `localhost` 打开 |
| 豆包返回 401 / 403 | Access Token 填错，或试用还没开通、已经过期 |
| 额度用完 | 不要把 Token 发给别人。网页演示可以继续用本地陪练 |

## 不要提交的东西

- `.env`
- `ANTHROPIC_API_KEY`、豆包 App ID、Access Token、控制台截图里的密钥

`DOUBAO_APP_KEY` 的默认值 `PlgvMymc7f3tQnJ6` 来自火山引擎公开接入文档，是固定值，可以留在 `.env.example`。
