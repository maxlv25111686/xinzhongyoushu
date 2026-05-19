# 芯中有数

面向芯片 PDF 参数解析、器件推荐和现场演示的 Web 应用。

## 云平台部署

仓库包含 Dockerfile，可直接使用支持 GitHub 仓库部署的云平台构建。

默认运行方式是云端模型模式，不依赖本机 OpenClaw 或本机 Ollama：

- `PORT=80`
- `OLLAMA_ONLY_MODE=1`
- `MODEL_BACKEND=cloudbase`
- `CB_AI_PROVIDER=hunyuan-exp`
- `CB_AI_MODEL=hunyuan-turbos-latest`

如果云平台控制台设置了环境变量，请确保不要覆盖成 `OLLAMA_ONLY_MODE=0`，否则会进入 OpenClaw Gateway 模式并要求容器内存在 `node_modules/openclaw/dist`。

OpenClaw Gateway 只适合本地开发机已启动 OpenClaw 服务的场景；云平台容器无法访问教师电脑上的 `127.0.0.1` 网关，因此生产部署必须保持 `OLLAMA_ONLY_MODE=1` 和 `MODEL_BACKEND=cloudbase`。

## 本地检查

```bash
npm install
npm run check
```
