import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    // متصفح مثبّت مسبقًا بإصدار آخر (بيئات التطوير السحابية)؛ في CI يبقى متصفح Playwright نفسه.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120000,
    // دورة «تنبيهات الأسرة» الدورية متوقفة في الاختبار؛ الاختبارات تشغّل الإرسال بنفسها.
    env: { REGISTRATION_ENABLED: "false", FAMILY_ALERTS_TIMER: "off" },
  },
});
