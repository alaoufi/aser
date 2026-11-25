#!/usr/bin/env node
// يشغّل Playwright MCP (تحكم Claude بالمتصفح وفحص الصفحات) بإصدار مثبّت، بلا رأس وبملف تعريف مؤقت.
// في بيئة Claude السحابية يستعمل Chromium المثبّت فيها؛ وفي غيرها متصفح Chrome في الجهاز.
// يُستدعى من .mcp.json (قرار المالك 2026-11-25: Playwright أداة الاختبار الأساسية الدائمة).
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");

const args = ["-y", "@playwright/mcp@0.0.86", "--headless", "--isolated"];
const cloudChromium = "/opt/pw-browsers/chromium";
if (existsSync(cloudChromium))
  args.push("--executable-path", cloudChromium, "--no-sandbox");
const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
