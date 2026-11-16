import QRCode from "qrcode";
import { resolveShare, shortUrl } from "@/server/share";
export const dynamic = "force-dynamic";
/** رمز QR للرابط المختصر (صورة SVG)، لمن يطبعه أو يعرضه في محله. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const code = (await context.params).code;
  if (!(await resolveShare(code).catch(() => null)))
    return new Response("Not found", { status: 404 });
  const svg = await QRCode.toString(shortUrl(code), {
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
