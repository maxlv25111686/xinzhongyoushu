# 芯中有数

面向芯片 PDF 参数解析、器件推荐和现场演示的 Web 应用。

## 云平台部署

仓库包含 Dockerfile，可直接使用支持 GitHub 仓库部署的云平台构建。

默认运行方式是云端模型模式，不依赖本机 OpenClaw 或本机 Ollama：

- `PORT=80`
- `OLLAMA_ONLY_MODE=1`
- `ENABLE_OPENCLAW_GATEWAY=0`
- `MODEL_BACKEND=cloudbase`
- `CB_AI_PROVIDER=hunyuan-exp`
- `CB_AI_MODEL=hunyuan-turbos-latest`

如果云平台控制台设置了环境变量，请确保不要启用 `ENABLE_OPENCLAW_GATEWAY=1`。

OpenClaw Gateway 只适合本地开发机已启动 OpenClaw 服务的场景；云平台容器无法访问教师电脑上的 `127.0.0.1` 网关，因此生产部署必须保持 `ENABLE_OPENCLAW_GATEWAY=0`、`OLLAMA_ONLY_MODE=1` 和 `MODEL_BACKEND=cloudbase`。即使误把 `OLLAMA_ONLY_MODE` 改成 `0`，只要没有显式设置 `ENABLE_OPENCLAW_GATEWAY=1`，服务仍会保持云端模型模式。

## 本地检查

```bash
npm install
npm run check
```
