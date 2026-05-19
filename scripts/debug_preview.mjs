import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "output", "playwright");
const pdfPath = process.argv[2] || "C:/Users/18403/Desktop/文档数据/tmp112.pdf";
const url = process.argv[3] || "http://127.0.0.1:4173";
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
});

try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("#pdfInput").setInputFiles(pdfPath);
  await page.waitForTimeout(12000);

  const metrics = await page.evaluate(() => {
    const previewStage = document.querySelector("#previewStage");
    const shell = document.querySelector("#previewCanvasShell");
    const canvas = document.querySelector("#pdfCanvas");
    const empty = document.querySelector("#previewEmpty");
    const focus = document.querySelector("#previewFocus");
    const pageInput = document.querySelector("#pageNumberInput");
    const pageCount = document.querySelector("#pageCountLabel");

    const rectOf = (node) =>
      node instanceof HTMLElement
        ? {
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
            display: getComputedStyle(node).display,
            visibility: getComputedStyle(node).visibility,
            opacity: getComputedStyle(node).opacity,
          }
        : null;

    return {
      focus: focus?.textContent || "",
      page: pageInput?.value || "",
      pageCount: pageCount?.textContent || "",
      previewStage: rectOf(previewStage),
      previewCanvasShell: rectOf(shell),
      previewEmpty: {
        text: empty?.textContent || "",
        className: empty?.className || "",
        ...rectOf(empty),
      },
      pdfCanvas:
        canvas instanceof HTMLCanvasElement
          ? {
              width: canvas.width,
              height: canvas.height,
              styleWidth: canvas.style.width,
              styleHeight: canvas.style.height,
              clientWidth: canvas.clientWidth,
              clientHeight: canvas.clientHeight,
            }
          : null,
    };
  });

  console.log(JSON.stringify({ metrics, errors }, null, 2));
  await page.screenshot({ path: path.join(outputDir, "debug-preview.png"), fullPage: true });
} finally {
  await browser.close();
}
