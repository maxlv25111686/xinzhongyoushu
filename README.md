# 芯中有数

面向芯片 PDF 参数解析、器件推荐和现场演示的 Web 应用。

## 云平台部署

仓库包含 Dockerfile，可直接使用支持 GitHub 仓库部署的云平台构建。

默认运行方式是 CloudBase AI 云端模型模式，直接使用 `hunyuan-turbos-latest`，不需要 OpenClaw Gateway，也不依赖本机 Ollama：

- `PORT=80`
- `OLLAMA_ONLY_MODE=1`
- `ENABLE_OPENCLAW_GATEWAY=0`
- `MODEL_BACKEND=cloudbase`
- `CB_AI_PROVIDER=hunyuan-exp`
- `CB_AI_MODEL=hunyuan-turbos-latest`

云平台控制台不要配置 `ENABLE_OPENCLAW_GATEWAY=1`，也不要把 `OLLAMA_ONLY_MODE` 改成 `0`。当前项目的 PDF 解析和 AI 对话功能由 CloudBase AI 完成，Gateway 相关能力仅保留为本地开发兼容逻辑。

## 本地检查

```bash
npm install
npm run check
```
