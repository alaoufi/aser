import { expect, test } from "@playwright/test";

/**
 * تنبيه صوتي بوصول الإشعار (قرار المالك 2026-11-27):
 * - عامل الخدمة يطلب صوت الجهاز صراحةً، ويبلّغ الصفحات المفتوحة بكل إشعار.
 * - الصفحة المفتوحة تُصدر نغمة عند البلاغ، مرة واحدة لا تتكرر خلال ثوانٍ.
 */
test("a notification arriving with the site open plays a chime once", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number; AudioContext: unknown };
    w.__tones = 0;
    class FakeAudio {
      currentTime = 0;
      destination = {};
      createOscillator() {
        return {
          frequency: { value: 0 },
          connect: (x: unknown) => x,
          start: () => {
            w.__tones++;
          },
          stop: () => {},
        };
      }
      createGain() {
        const g = {
          gain: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: (x: unknown) => x,
        };
        return g;
      }
      close() {
        return Promise.resolve();
      }
    }
    w.AudioContext = FakeAudio;
  });
  await page.goto("/");
  const tones = () =>
    page.evaluate(() => (window as unknown as { __tones: number }).__tones);
  const push = () =>
    page.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", { data: { type: "jdatna:push" } }),
      ),
    );
  await expect
    .poll(async () => {
      await push();
      return tones();
    })
    .toBeGreaterThan(0);
  const after = await tones();
  // إشعار ثانٍ فورًا (رسالة وإشعارها): لا تتكرر النغمة.
  await push();
  expect(await tones()).toBe(after);

  // عامل الخدمة يطلب الصوت صراحةً ويبلّغ الصفحات.
  const sw = await (await page.request.get("/sw.js")).text();
  expect(sw).toContain("silent: false");
  expect(sw).toContain('type: "jdatna:push"');
});
