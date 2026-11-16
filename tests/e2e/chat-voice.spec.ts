import { test, expect, type Page } from "@playwright/test";

const id = "33333333-3333-4333-8333-333333333333";

async function openThread(page: Page, patches: unknown[], uploads: string[]) {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "c1",
          name: "عميل",
          phone: "+966500000001",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { conversations: [] } }),
  );
  await page.route(`**/api/conversations/${id}/voice`, async (r) => {
    const req = r.request();
    uploads.push(
      `${req.headers()["content-type"]?.split(";")[0]}|${req.postDataBuffer()?.includes(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))}|${/name="duration"\r\n\r\n(\d+)/.exec(req.postData() ?? "")?.[1]}`,
    );
    return r.fulfill({
      status: 201,
      json: {
        id: "v2",
        body: "🎤 رسالة صوتية (0:02)",
        mine: true,
        createdAt: "2026-11-09T09:07:00.000Z",
        voiceMs: 2000,
      },
    });
  });
  await page.route(`**/api/conversations/${id}?**`, (r) =>
    r.fulfill({ json: thread() }),
  );
  await page.route(`**/api/conversations/${id}`, async (r) => {
    if (r.request().method() === "PATCH") {
      patches.push(r.request().postDataJSON());
      return r.fulfill({
        json: { reported: false, blocked: true, blockedByMe: true },
      });
    }
    return r.fulfill({ json: thread() });
  });
  await page.goto(`/messages?c=${id}`);
  return page.getByRole("region", { name: "المحادثة" });
}

const thread = () => ({
  conversation: {
    id,
    title: "أسرة الجريش",
    side: "customer",
    producerSlug: "family-test",
    blocked: false,
    blockedByMe: false,
  },
  messages: [
    {
      id: "v1",
      body: "🎤 رسالة صوتية (0:12)",
      mine: false,
      createdAt: "2026-11-09T09:05:00.000Z",
      voiceMs: 12000,
    },
    {
      id: "t1",
      body: "أرسلت لك الطلب صوتيًا",
      mine: false,
      createdAt: "2026-11-09T09:06:00.000Z",
      voiceMs: null,
    },
  ],
});

test("blocking asks for confirmation first, and can be cancelled", async ({
  page,
}) => {
  const patches: unknown[] = [];
  const view = await openThread(page, patches, []);
  await view.getByLabel("خيارات المحادثة").click();
  await view.getByRole("button", { name: "حظر المحادثة" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "هل تريد حظر المحادثة مع أسرة الجريش؟",
  });
  await expect(confirm).toContainText("لن يستطيع أي منكما إرسال رسائل");
  await expect(
    confirm.getByRole("button", { name: "نعم، احظر المحادثة" }),
  ).toBeFocused();
  // التراجع لا يحظر شيئًا.
  await confirm.getByRole("button", { name: "تراجع" }).click();
  await expect(confirm).toHaveCount(0);
  expect(patches).toEqual([]);
  await expect(view.getByLabel("اكتب رسالة")).toBeVisible();

  await view.getByLabel("خيارات المحادثة").click();
  await view.getByRole("button", { name: "حظر المحادثة" }).click();
  await page.getByRole("button", { name: "نعم، احظر المحادثة" }).click();
  await expect.poll(() => patches).toEqual([{ action: "block" }]);
  await expect(
    page.getByRole("status").filter({ hasText: "تم الحظر ✓" }),
  ).toBeVisible();
  await expect(page.getByText(/حظرت هذه المحادثة/)).toBeVisible();
  await expect(view.getByLabel("اكتب رسالة")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("voice messages play inside the bubble, and the mic records and sends one", async ({
  page,
}) => {
  // ميكروفون ومسجّل وهميان: يُنتجان بايتات صوت webm حقيقية البداية.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__tracksStopped = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop: () => {
                w.__tracksStopped = (w.__tracksStopped as number) + 1;
              },
            },
          ],
        }),
      },
    });
    class FakeRecorder {
      state = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported = (t: string) => t.startsWith("audio/webm");
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([
            new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(300).fill(1)]),
          ]),
        });
        this.onstop?.();
      }
    }
    w.MediaRecorder = FakeRecorder;
  });
  const uploads: string[] = [];
  const view = await openThread(page, [], uploads);
  const heard = view.getByLabel("رسالة صوتية مدتها 0:12");
  await expect(heard).toHaveAttribute(
    "src",
    `/api/conversations/${id}/voice/v1`,
  );
  await expect(view.getByText("أرسلت لك الطلب صوتيًا")).toBeVisible();
  // زر الميكروفون حين يكون الحقل فارغًا، وزر الإرسال حين تُكتب رسالة.
  const mic = view.getByRole("button", { name: "تسجيل رسالة صوتية" });
  await expect(mic).toBeVisible();
  await view.getByLabel("اكتب رسالة").fill("نص");
  await expect(mic).toHaveCount(0);
  await expect(view.getByRole("button", { name: "إرسال" })).toBeVisible();
  await view.getByLabel("اكتب رسالة").fill("");

  // تسجيل ثم إلغاء: لا يُرسل شيء.
  await mic.click();
  await expect(
    view.getByRole("status").filter({ hasText: "جارٍ التسجيل" }),
  ).toContainText("من 2:00");
  await expect(view.getByLabel("اكتب رسالة")).toBeHidden();
  await view.getByRole("button", { name: "إلغاء" }).click();
  await expect(view.getByLabel("اكتب رسالة")).toBeVisible();
  expect(uploads).toEqual([]);

  // تسجيل ثانيتين ثم إرسال.
  await view.getByRole("button", { name: "تسجيل رسالة صوتية" }).click();
  await page.waitForTimeout(1300);
  await view.getByRole("button", { name: "إرسال التسجيل" }).click();
  await expect(view.getByLabel("رسالة صوتية مدتها 0:02")).toBeVisible();
  expect(uploads).toHaveLength(1);
  const [type, magic, duration] = uploads[0].split("|");
  expect(type).toBe("multipart/form-data");
  expect(magic).toBe("true");
  expect(Number(duration)).toBeGreaterThanOrEqual(1000);
  expect(Number(duration)).toBeLessThan(10000);
  expect(
    await page.evaluate(
      () => (window as unknown as { __tracksStopped: number }).__tracksStopped,
    ),
  ).toBe(2);
});

test("a refused microphone explains how to allow it", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      },
    });
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = class {
      static isTypeSupported = () => true;
    };
  });
  const view = await openThread(page, [], []);
  await view.getByRole("button", { name: "تسجيل رسالة صوتية" }).click();
  await expect(
    view.getByText(/اسمح للموقع به من إعدادات المتصفح/),
  ).toBeVisible();
});
