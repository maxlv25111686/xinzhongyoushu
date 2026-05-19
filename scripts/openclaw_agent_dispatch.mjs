import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT_DIR = process.cwd();
const OPENCLAW_PACKAGE_ROOT = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "openclaw"
);
const OPENCLAW_LOCAL_PACKAGE_ROOT = path.join(ROOT_DIR, "node_modules", "openclaw");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function loadGatewayCallApi() {
  const distDirs = [
    path.join(OPENCLAW_LOCAL_PACKAGE_ROOT, "dist"),
    path.join(OPENCLAW_PACKAGE_ROOT, "dist"),
  ];

  for (const distDir of distDirs) {
    if (!distDir) {
      continue;
    }

    try {
      const entries = await fs.readdir(distDir);
      const candidateFiles = entries.filter((entry) => /\.(?:mjs|js|cjs)$/i.test(entry));

      for (const fileName of candidateFiles) {
        const filePath = path.join(distDir, fileName);
        const module = await import(pathToFileURL(filePath).href);
        const callGatewayScoped = module.callGatewayScoped || module.o;
        if (typeof callGatewayScoped === "function") {
          return callGatewayScoped;
        }
      }
    } catch {
      // Try next candidate root.
    }
  }

  throw new Error("OpenClaw Gateway call API was not found.");
}

async function main() {
  const raw = await readStdin();
  const payload = raw ? JSON.parse(raw) : {};
  const callGatewayScoped = await loadGatewayCallApi();
  const result = await callGatewayScoped({
    method: payload?.method || "agent",
    params: payload?.params || {},
    scopes: ["operator.admin"],
    timeoutMs: Number(payload?.timeoutMs) || 15000,
    clientName: "gateway-client",
    clientDisplayName: "芯中有数",
    clientVersion: "1.0.0",
    mode: "backend",
  });

  process.stdout.write(JSON.stringify({ ok: true, result }));
}

main().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
