import { test, expect } from "@playwright/test";

const city = {
  id: "riyadh-city",
  name: "الرياض",
  regionId: "riyadh",
  regionName: "منطقة الرياض",
};

// المندوب يسجّل بياناته: الاسم الحقيقي، الجوال، رقم الهوية وصورتها، نوع السيارة، مدينة العمل.
test("a courier registers with ID number and image, car type and city", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "k",
          name: "مندوب",
          phone: "+966500000021",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  let courier: Record<string, unknown> | null = null;
  let posted: Record<string, unknown> | undefined;
  await page.route("**/api/courier/profile", async (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      courier = { ...posted, id: "c1", status: "pending", regionId: "riyadh" };
      return r.fulfill({ json: { id: "c1", status: "pending" } });
    }
    return r.fulfill({ json: { courier, cities: [city] } });
  });
  let uploads = 0;
  await page.route("**/api/documents", (r) => {
    uploads++;
    return r.fulfill({ json: { id: "00000000-0000-4000-8000-000000000031" } });
  });
  await page.goto("/courier");
  await expect(
    page.getByRole("heading", { name: "لوحة المندوب" }),
  ).toBeVisible();
  await page.getByLabel("الاسم الحقيقي").fill("سعد المندوب");
  await expect(page.getByLabel("الجوال", { exact: true })).toHaveValue(
    "+966500000021",
  );
  await page.getByLabel("رقم الهوية").fill("١٠٢٣٤٥٦٧٨٩");
  await page.getByLabel("نوع السيارة").fill("كامري 2020");
  await page.locator('input[name="idImage"]').setInputFiles({
    name: "id.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([255, 216, 255, 0]),
  });
  await page
    .getByRole("combobox", { name: "المنطقة", exact: true })
    .selectOption("riyadh");
  await page
    .getByRole("combobox", { name: "المدينة", exact: true })
    .selectOption(city.id);
  await page.getByRole("button", { name: "تسجيل وإرسال للمراجعة" }).click();
  await expect(page.getByText("تحت المراجعة").first()).toBeVisible();
  expect(uploads).toBe(1);
  expect(posted).toEqual({
    name: "سعد المندوب",
    nationalId: "١٠٢٣٤٥٦٧٨٩",
    documentId: "00000000-0000-4000-8000-000000000031",
    carType: "كامري 2020",
    cityId: city.id,
    showPhone: true,
    showWhatsapp: true,
  });
});

// الأسرة ترى المندوبين المعتمدين في مدينتها، وتتواصل معهم بمحادثة أو اتصال أو واتساب.
test("a family finds couriers in its city and contacts them quickly", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "f",
          name: "أسرة",
          phone: "+966500000022",
          role: "producer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: { profile: { cityId: city.id }, categories: [], cities: [city] },
    }),
  );
  const asked: string[] = [];
  await page.route("**/api/couriers**", (r) => {
    asked.push(new URL(r.request().url()).search);
    return r.fulfill({
      json: {
        couriers: [
          {
            id: "c1",
            userId: "00000000-0000-4000-8000-000000000041",
            name: "سعد المندوب",
            carType: "كامري 2020",
            cityName: "الرياض",
            regionName: "منطقة الرياض",
            phone: "+966500000021",
            whatsapp: "+966500000021",
          },
        ],
      },
    });
  });
  let started: unknown;
  await page.route("**/api/conversations", (r) => {
    started = r.request().postDataJSON();
    return r.fulfill({ status: 201, json: { id: "conv-1" } });
  });
  await page.route("**/api/conversations/conv-1**", (r) =>
    r.fulfill({ json: { conversation: { id: "conv-1" }, messages: [] } }),
  );
  await page.goto("/couriers");
  const list = page.getByRole("list", { name: "قائمة المندوبين" });
  await expect(
    list.getByRole("heading", { name: "سعد المندوب" }),
  ).toBeVisible();
  await expect(list).toContainText("كامري 2020");
  await expect.poll(() => asked.at(-1)).toContain("city=riyadh-city");
  await expect(list.getByRole("link", { name: "اتصال" })).toHaveAttribute(
    "href",
    "tel:+966500000021",
  );
  await expect(list.getByRole("link", { name: "واتساب" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/966500000021\?text=/,
  );
  await list.getByRole("button", { name: "محادثة" }).click();
  await expect(page).toHaveURL(/\/messages\?c=conv-1$/);
  expect(started).toEqual({ courier: "00000000-0000-4000-8000-000000000041" });
});
