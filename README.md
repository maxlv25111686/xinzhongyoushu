# 芯中有数

面向芯片 PDF 参数解析、器件推荐和现场演示的 Web 应用。

## 云平台部署

仓库包含 Dockerfile，可直接使用支持 GitHub 仓库部署的云平台构建。

默认运行方式：

- `PORT=80`
- `OLLAMA_ONLY_MODE=1`
- `MODEL_BACKEND=cloudbase`
- `CB_AI_PROVIDER=hunyuan-exp`
- `CB_AI_MODEL=hunyuan-turbos-latest`

如果云平台控制台设置了环境变量，请确保不要覆盖成 `OLLAMA_ONLY_MODE=0`，否则会进入 OpenClaw Gateway 模式并要求容器内存在 `node_modules/openclaw/dist`。

## 本地检查

```bash
npm install
npm run check
```
