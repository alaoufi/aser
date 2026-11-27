import QRCode from "qrcode";
import { SITE_URL } from "@/lib/seo";
import { invitePattern } from "@/server/referrals";

/** رمز QR لرابط التطبيق (ومع رقم العضو إن وُجد)، لقائمة «مشاركة التطبيق» في رأس الموقع. */
export async function GET(request: Request) {
  const r = new URL(request.url).searchParams.get("r") ?? "";
  const url = invitePattern.test(r)
    ? `${SITE_URL}/app/${r}`
    : `${SITE_URL}/app`;
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    color: { dark: "#2e1d12", light: "#ffffff" },
  });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
