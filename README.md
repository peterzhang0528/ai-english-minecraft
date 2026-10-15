# Maple · 打开链接就能玩

Maple 是给同学用的英语伴学。**先把链接打开，在浏览器里和 Maple 一起走、聊天。不用安装 Minecraft。**

发给同学的一句话：

> 打开这个链接就能和 Maple 玩英语，不用装 Minecraft。

完整的 Minecraft Java 以后可以再装，现在不是必须的。iPad 上的基岩版也不用为了这次试用去连 Java 服务器。

## 同学怎么玩

1. 打开首页，点「开始玩」。
2. 用手指在画面上滑动来转身，点「前、左、后、右」走路。没有键盘也可以。
3. 在下面的输入框打英语，或点现成的句子。Maple 会接话；句子不自然时，会给出一句更顺的说法。
4. 点「跟我来」，穿红衣服的 Maple 会跟着你。

没有 `ANTHROPIC_API_KEY` 时用本地陪练，密钥不会进网页。要换成云端陪练，只把密钥放在服务器环境变量里。

## 在自己电脑上打开

需要 Node.js 22 或更新版本。

```bash
npm install
npm run web
```

浏览器打开 <http://127.0.0.1:8787> 。`npm start` 和 `npm run web` 是同一条命令。

同一台电脑上的同学可以用 `http://你的局域网IP:8787` 。不要把带密钥的服务暴露到公网。

## Docker

```bash
docker build -t maple .
docker run --rm -p 8080:8080 -e MAPLE_PORT=8080 maple
```

然后打开 <http://127.0.0.1:8080> 。镜像里不要放 `.env`。

可选的云端陪练：

```bash
docker run --rm -p 8080:8080 -e MAPLE_PORT=8080 -e ANTHROPIC_API_KEY=你的密钥 maple
```

不传这行也会正常玩，只是走本地陪练。

## Fly

`fly.toml` 把服务放在香港（`hkg`），容器端口是 `8080`，健康检查是 `/health`。

```bash
fly deploy
```

名字如果已经被占用，改 `fly.toml` 里的 `app`，或按 Fly 的提示换一个。云端密钥这样设置，不要写进文件：

```bash
fly secrets set ANTHROPIC_API_KEY=你的密钥
```

不设置也能部署。同学打开的页面里看不到这串密钥。

## 可选：语音陪练和 Minecraft Java

首页的「开始玩」是给同学的入口。已经配好豆包的电脑可以再开 [语音陪练](/voice)（本机路径 `/voice`）。

豆包的 App ID 和 Access Token 只放在本机 `.env`，不要提交，也不要发到群里。

```bash
cp .env.example .env
```

填写 `DOUBAO_APP_ID` 和 `DOUBAO_ACCESS_TOKEN`。没有额度时：

```bash
DOUBAO_MOCK=1 npm run web
```

语音页可以和原版 Minecraft 并排用：先在网页里跟读，再把同一句打进游戏聊天。这一步是进阶，不是同学第一次试用要做的事。

开通步骤和单词卡说明仍在下面，课堂顺序见 [DEMO.md](DEMO.md)。

## 同学怎么开通豆包免费试用

1. 打开 [火山引擎语音控制台](https://console.volcengine.com/speech/app)，用手机号注册或登录。
2. 创建一个语音应用，记下 **App ID** 和 **Access Token**。
3. 在这个应用里开通「端到端实时语音大模型」。新账号通常有免费试用额度，以控制台页面显示为准。
4. 只用编辑器打开 `.env`，填这两行，其它可以保持默认：

```bash
DOUBAO_APP_ID=你的AppID
DOUBAO_ACCESS_TOKEN=你的AccessToken
```

`DOUBAO_APP_KEY=PlgvMymc7f3tQnJ6` 是火山引擎文档里的固定值，不是你的个人密钥。

## 目录

| 路径 | 作用 |
| --- | --- |
| `web/index.html` | 分享首页：不用安装，一句话发给同学 |
| `web/play.html` | 浏览器里的方块世界、方向键、英语对话 |
| `web/voice.html` | 可选的豆包语音陪练 |
| `src/tutor/` | 本地英语陪练；有密钥时才在服务端调用 Anthropic |
| `src/voice/` | 豆包语音网关，密钥留在服务端 |
| `Dockerfile` / `fly.toml` | 容器和 Fly 部署 |

## 检查

```bash
npm test
```

测试不需要真实的豆包或 Anthropic 密钥。
