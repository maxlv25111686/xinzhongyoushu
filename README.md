# 芯中有数

面向芯片 PDF 参数解析、器件推荐和现场演示的 Web 应用。

## 云平台部署

仓库包含 Dockerfile，可直接使用支持 GitHub 仓库部署的云平台构建。

默认运行方式是 CloudBase 云端模型模式，不依赖本机 OpenClaw 或本机 Ollama：

- `PORT=80`
- `OLLAMA_ONLY_MODE=1`
- `ENABLE_OPENCLAW_GATEWAY=0`
- `MODEL_BACKEND=cloudbase`
- `CB_AI_PROVIDER=hunyuan-exp`
- `CB_AI_MODEL=hunyuan-turbos-latest`

如果使用云端 OpenClaw Gateway，可以在云平台控制台改成：

- `ENABLE_OPENCLAW_GATEWAY=1`
- `OLLAMA_ONLY_MODE=0`
- `OPENCLAW_GATEWAY_URL=wss://你的云端-openclaw-gateway`
- `OPENCLAW_GATEWAY_TOKEN=你的 token`，如无 token 可不填
- `OPENCLAW_GATEWAY_PASSWORD=你的 password`，如无 password 可不填

如果没有云端 OpenClaw Gateway，请不要启用 `ENABLE_OPENCLAW_GATEWAY=1`。

本机 OpenClaw Gateway 只适合本地开发机已启动 OpenClaw 服务的场景；云平台容器无法访问教师电脑上的 `127.0.0.1` 网关。生产部署如果要走 OpenClaw，必须提供云端可访问的 `ws://` 或 `wss://` Gateway 地址。

## 本地检查

```bash
npm install
npm run check
```
