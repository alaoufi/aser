type SmsEnv = Record<string, string | undefined>;
export function smsTransportConfigured(env: SmsEnv = process.env) {
  try {
    const url = new URL(env.SMS_WEBHOOK_URL ?? "");
    if (
      !env.SMS_WEBHOOK_TOKEN ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return false;
    if (env.SMS_PROVIDER === "taqnyat")
      return (
        url.href === "https://api.taqnyat.sa/v1/messages" &&
        Boolean(env.SMS_SENDER?.trim())
      );
    if (env.SMS_PROVIDER && env.SMS_PROVIDER !== "webhook") return false;
    return (env.SMS_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((x) => x.trim())
      .includes(url.hostname);
  } catch {
    return false;
  }
}
export async function sendSms(
  to: string,
  message: string,
  env: SmsEnv = process.env,
  transport: typeof fetch = fetch,
) {
  if (!smsTransportConfigured(env)) throw new Error("SMS rejected");
  const taqnyat = env.SMS_PROVIDER === "taqnyat";
  if (!/^\+9665\d{8}$/.test(to)) throw new Error("SMS rejected");
  try {
    const response = await transport(env.SMS_WEBHOOK_URL!, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${env.SMS_WEBHOOK_TOKEN}`,
      },
      body: JSON.stringify(
        taqnyat
          ? { recipients: [to.slice(1)], body: message, sender: env.SMS_SENDER }
          : { to, message },
      ),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error();
    if (taqnyat) {
      const data = await response.json();
      const accepted: string[] =
        String(data.accepted ?? "").match(/\d+/g) ?? [];
      const rejected: string[] =
        String(data.rejected ?? "").match(/\d+/g) ?? [];
      if (
        Number(data.statusCode) !== 201 ||
        !/^[0-9]+$/.test(String(data.messageId ?? "")) ||
        !accepted.includes(to.slice(1)) ||
        rejected.length
      )
        throw new Error();
    }
  } catch {
    throw new Error("SMS rejected");
  }
}
