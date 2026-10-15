# Maple · Minecraft 英语伴学

Maple 是一个给同学用的 Minecraft 英语陪练。你用英语说出方块、怪物和工具，Maple 用短句回答，并在括号里给一个中文提示。语音走豆包端到端实时语音；**App ID 和 Access Token 只放在本机 `.env`，不会进网页，也不要提交到 Git。**

## 同学怎么开通豆包免费试用

1. 打开 [火山引擎语音控制台](https://console.volcengine.com/speech/app)，用手机号注册或登录。
2. 创建一个语音应用，记下 **App ID** 和 **Access Token**。
3. 在这个应用里开通「端到端实时语音大模型」。新账号通常有免费试用额度，以控制台页面显示为准。
4. 在项目目录执行：

```bash
cp .env.example .env
```

5. 只用编辑器打开 `.env`，填这两行，其它可以保持默认：

```bash
DOUBAO_APP_ID=你的AppID
DOUBAO_ACCESS_TOKEN=你的AccessToken
```

`DOUBAO_APP_KEY=PlgvMymc7f3tQnJ6` 是火山引擎文档里的固定值，不是你的个人密钥。不要把填好的 `.env` 发到微信群或提交到 GitHub。

## 启动

需要 Node.js 22 或更新版本。

```bash
npm install
npm start
```

浏览器打开 <http://127.0.0.1:8787> 。点「开始通话」，允许麦克风，然后说：

- `Hello Maple`
- `What is a creeper?`
- `My pickaxe broke.`

也可以先不申请额度，做本地排练（不连接豆包）：

```bash
DOUBAO_MOCK=1 npm start
```

同一台电脑上的同学可以用 `http://你的局域网IP:8787` 打开。这个端口不要暴露到公网，否则别人会消耗你的试用额度。

## 和 Minecraft 一起用

Maple 不修改游戏客户端。建议这样玩：

1. 开一个原版或教室服务器世界。
2. 旁边开着 Maple 网页。
3. 遇到不会说的话，点网页上的「怎么说」，跟读英语，再把同一句打进游戏聊天。
4. 挖矿、打怪之前先用单词卡过一遍：creeper、pickaxe、diamond、furnace、village。

课堂 5 分钟演示步骤写在 [DEMO.md](DEMO.md)。

## 目录

| 路径 | 作用 |
| --- | --- |
| `src/voice/config.ts` | 读取 `DOUBAO_*`，不把密钥写进日志 |
| `src/voice/protocol.ts` | 豆包二进制帧：建连、会话、音频 |
| `src/voice/connect.ts` | 连接 `wss://openspeech.bytedance.com/api/v3/realtime/dialogue` |
| `src/voice/gateway.ts` | 浏览器只连本机网关，密钥留在服务端 |
| `src/voice/relay.ts` | 把语音、文本和单词工具接在一起 |
| `src/voice/tools.ts` | 查词、测验、中译英短句、情景提示 |
| `web/client/voice.ts` | 麦克风采集、播放和网页事件 |
| `test/voice.test.ts` | 协议样例、工具和本地排练 |

## 检查

```bash
npm test
```

测试不需要真实的豆包密钥。
