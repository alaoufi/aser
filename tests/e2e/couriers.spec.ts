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
    cityPrice: null,
    centers: [],
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
            cityPrice: 15,
            centers: [{ name: "مركز الحائر", price: null }],
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
  // القائمة محصورة في تغطية الأسرة؛ لا تصفية مسبقة بالمدينة.
  await expect.poll(() => asked.at(-1)).toBe("");
  const prices = list.getByRole("list", { name: "تسعيرة سعد المندوب" });
  await expect(prices).toContainText("داخل المدينة: 15 ر.س");
  await expect(prices).toContainText("مركز الحائر: حسب الاتفاق");
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

// المندوب: «نشط الآن»، والتسعير لكل مركز، و«طلبات التوصيل» بموقعي الاستلام والتوصيل.
test("a courier sets prices, goes active, and sees pickup and delivery locations", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { id: "k", name: "سعد", phone: "+966500000021", role: "courier" },
        registrationOpen: true,
      },
    }),
  );
  const courier = {
    id: "c1",
    name: "سعد المندوب",
    cityId: city.id,
    regionId: "riyadh",
    carType: "كامري",
    documentId: "00000000-0000-4000-8000-000000000031",
    nationalId: "1023456789",
    showPhone: true,
    showWhatsapp: true,
    status: "approved",
    reviewReason: null,
    active: false,
    cityPrice: null,
    centers: [],
  };
  let posted: Record<string, unknown> | undefined;
  await page.route("**/api/courier/profile", (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      return r.fulfill({ json: { id: "c1", status: "approved" } });
    }
    return r.fulfill({
      json: {
        courier,
        cities: [city],
        centers: [{ cityId: city.id, id: "center:hair", name: "الحائر" }],
      },
    });
  });
  let active: unknown;
  await page.route("**/api/courier/active", (r) => {
    active = r.request().postDataJSON();
    return r.fulfill({ json: { active: true } });
  });
  let delivered: unknown;
  await page.route("**/api/courier/deliveries", (r) => {
    if (r.request().method() === "PUT") {
      delivered = r.request().postDataJSON();
      return r.fulfill({ json: { status: "delivered" } });
    }
    return r.fulfill({
      json: {
        deliveries: [
          {
            orderId: "00000000-0000-4000-8000-000000000061",
            status: delivered ? "delivered" : "assigned",
            product: "مرقوق",
            quantity: 2,
            startDate: "2026-11-16",
            family: "مطبخ أم سعد",
            familyPhone: "+966500000022",
            pickupLocation: "حي النخيل، شارع الأسرة",
            customerName: "أبو فهد",
            customerPhone: "+966500000023",
            deliveryLocation: "https://maps.google.com/?q=24.7,46.6",
          },
        ],
      },
    });
  });
  await page.goto("/courier");
  await expect(page.getByText("غير نشط — اسمك مخفي عن الأسر")).toBeVisible();
  await page.getByRole("button", { name: "أنا متاح الآن (نشط)" }).click();
  await expect(page.getByText("نشط — يظهر اسمك للأسر")).toBeVisible();
  expect(active).toEqual({ active: true });

  const deliveries = page.getByRole("region", { name: "طلبات التوصيل" });
  await expect(deliveries).toContainText("موقع الاستلام (الأسرة)");
  await expect(deliveries).toContainText("حي النخيل، شارع الأسرة");
  await expect(deliveries).toContainText("موقع التوصيل (العميل)");
  await expect(
    deliveries.getByRole("link", { name: "فتح الموقع في الخرائط" }).last(),
  ).toHaveAttribute("href", "https://maps.google.com/?q=24.7,46.6");
  page.once("dialog", (d) => d.accept());
  await deliveries.getByRole("button", { name: "تم التوصيل" }).click();
  await expect(deliveries).toContainText("تم التوصيل ✓");
  expect(delivered).toEqual({
    orderId: "00000000-0000-4000-8000-000000000061",
  });

  await page.getByLabel("داخل المدينة (سعر واحد للمدينة كلها)").fill("15");
  await page.getByRole("checkbox", { name: "الحائر" }).check();
  await page.getByLabel("سعر الحائر").fill("٢٥");
  await page.getByRole("button", { name: "حفظ البيانات" }).click();
  await expect(page.getByText("تم حفظ بياناتك ✓")).toBeVisible();
  expect(posted?.cityPrice).toBe(15);
  expect(posted?.centers).toEqual([{ nodeId: "center:hair", price: 25 }]);
});

// الأسرة تسند طلب التوصيل لمندوب متاح في تغطيتها، مع موقع الاستلام.
test("a family assigns a delivery order to an active courier", async ({
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
  let assigned: Record<string, unknown> | undefined;
  await page.route("**/api/producer/orders**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/courier")) {
      assigned = r.request().postDataJSON();
      return r.fulfill({ json: { orderId: "o1", courierName: "سعد المندوب" } });
    }
    if (path.endsWith("/alerts"))
      return r.fulfill({ json: { alerts: [], pending: 0 } });
    return r.fulfill({
      json: {
        orders: [
          {
            id: "00000000-0000-4000-8000-000000000071",
            productId: "p1",
            snapshot: {
              productName: "مرقوق",
              producerName: "أسرة",
              unit: "صحن",
              price: 20,
              offer: null,
            },
            name: "أبو فهد",
            phone: "+966500000023",
            quantity: 2,
            meal: "lunch",
            days: 1,
            startDate: "2026-11-16",
            endDate: "2026-11-16",
            notes: "",
            status: "accepted",
            fulfillment: "delivery",
            deliveryLocation: "https://maps.google.com/?q=24.7,46.6",
            customerId: "u1",
            familyPickup: "حي النخيل، شارع الأسرة",
          },
        ],
      },
    });
  });
  await page.route("**/api/couriers**", (r) =>
    r.fulfill({
      json: {
        couriers: [
          {
            id: "c1",
            userId: "00000000-0000-4000-8000-000000000041",
            name: "سعد المندوب",
            carType: "كامري",
            cityName: "الرياض",
            regionName: "منطقة الرياض",
            phone: null,
            whatsapp: null,
            cityPrice: 15,
            centers: [],
          },
        ],
      },
    }),
  );
  await page.route("**/api/ratings**", (r) =>
    r.fulfill({ json: { average: null, count: 0, mine: null } }),
  );
  await page.goto("/dashboard/orders");
  await page.getByRole("button", { name: "إسناد التوصيل لمندوب" }).click();
  await page
    .getByRole("radio", { name: /سعد المندوب — الرياض، داخل المدينة: 15 ر\.س/ })
    .check();
  await expect(page.getByLabel("موقع الاستلام (موقع الأسرة)")).toHaveValue(
    "حي النخيل، شارع الأسرة",
  );
  await page.getByRole("button", { name: "أسند الطلب" }).click();
  await expect(page.getByText("المندوب: سعد المندوب")).toBeVisible();
  expect(assigned).toEqual({
    orderId: "00000000-0000-4000-8000-000000000071",
    courierUserId: "00000000-0000-4000-8000-000000000041",
    pickupLocation: "حي النخيل، شارع الأسرة",
  });
});

// العميل لم يتفق مع الأسرة على التوصيل: من طلبه إلى «تجمع المندوبين» ويختار مندوبًا عامًا.
test("a customer picks a courier for an accepted delivery order from the couriers gathering", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "u",
          name: "عميل",
          phone: "+966500000051",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  const orderId = "00000000-0000-4000-8000-000000000061";
  await page.route("**/api/orders", (r) =>
    r.fulfill({
      json: {
        orders: [
          {
            id: orderId,
            productId: "p",
            snapshot: {
              productName: "كبسة",
              producerName: "أكلات نجدية",
              unit: "طبق",
              price: 30,
              offer: null,
            },
            name: "عميل",
            phone: "+966500000051",
            quantity: 1,
            meal: "lunch",
            days: 1,
            startDate: "2026-11-20",
            endDate: "2026-11-20",
            notes: "",
            status: "accepted",
            fulfillment: "delivery",
            deliveryLocation: "حي الملقا",
            courierName: null,
          },
        ],
      },
    }),
  );
  await page.goto("/orders");
  await expect(page.getByText("لم يُحدَّد مندوب لتوصيل طلبك")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "اختر مندوبًا للتوصيل" }),
  ).toHaveAttribute("href", `/couriers?order=${orderId}`);

  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { profile: null, categories: [], cities: [city] } }),
  );
  await page.route("**/api/couriers**", (r) =>
    r.fulfill({
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
            whatsapp: null,
            cityPrice: 15,
            centers: [],
            familyName: null,
          },
        ],
      },
    }),
  );
  let chosen: unknown;
  await page.route("**/api/orders/courier", (r) => {
    chosen = r.request().postDataJSON();
    return r.fulfill({ json: { orderId, courierName: "سعد المندوب" } });
  });
  await page.goto(`/couriers?order=${orderId}`);
  // العميل لا يرى قسم «مندوبي الخاص» ولا زر المحادثة الخاص بالأسر.
  await expect(page.getByRole("region", { name: "مندوبي الخاص" })).toHaveCount(
    0,
  );
  const list = page.getByRole("list", { name: "قائمة المندوبين" });
  await expect(list.getByRole("button", { name: "محادثة" })).toHaveCount(0);
  await list.getByRole("button", { name: "اختره لتوصيل طلبي" }).click();
  await expect(page.getByRole("status")).toContainText(
    "اخترت سعد المندوب لتوصيل طلبك",
  );
  expect(chosen).toEqual({
    orderId,
    courierUserId: "00000000-0000-4000-8000-000000000041",
  });
});
