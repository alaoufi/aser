import assert from "node:assert/strict";
import test from "node:test";
import { sendSms, smsTransportConfigured } from "../src/server/sms";
const env = {
  SMS_PROVIDER: "taqnyat",
  SMS_WEBHOOK_URL: "https://api.taqnyat.sa/v1/messages",
  SMS_WEBHOOK_TOKEN: "test-token",
  SMS_SENDER: "approved-sender",
};
test("Taqnyat sends Saudi recipient and approved sender, accepts documented receipt", async () => {
  let called = false;
  await sendSms("+966500000000", "test", env, async (url, init) => {
    called = true;
    assert.equal(String(url), env.SMS_WEBHOOK_URL);
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-token",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      recipients: ["966500000000"],
      body: "test",
      sender: "approved-sender",
    });
    return new Response(
      JSON.stringify({
        statusCode: 201,
        messageId: 123,
        accepted: "[966500000000,]",
        rejected: "[]",
      }),
      { status: 201 },
    );
  });
  assert.equal(called, true);
});
test("Taqnyat fails closed on HTTP200 application rejection, invalid receipt and redirect", async () => {
  for (const [status, body] of [
    [200, { statusCode: 400, message: "test-token" }],
    [201, { statusCode: 201 }],
    [302, {}],
    [401, {}],
  ] as const) {
    await assert.rejects(
      sendSms(
        "+966500000000",
        "test",
        env,
        async () => new Response(JSON.stringify(body), { status }),
      ),
      /^Error: SMS rejected$/,
    );
  }
});
test("Provider secrets cannot be sent to a different URL or unrecognized provider", async () => {
  for (const overrides of [
    { SMS_WEBHOOK_URL: "https://evil.invalid/send" },
    { SMS_WEBHOOK_URL: "https://api.taqnyat.sa/v1/messages?token=x" },
    { SMS_PROVIDER: "unknown" },
    { SMS_SENDER: "" },
  ]) {
    const config = { ...env, ...overrides };
    assert.equal(smsTransportConfigured(config), false);
    await assert.rejects(
      sendSms("+966500000000", "test", config, async () => {
        throw new Error("must not fetch");
      }),
    );
  }
});
