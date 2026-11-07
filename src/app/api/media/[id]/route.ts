import { z } from "zod";
import { api } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { productImage } from "@/server/media";
export const runtime = "nodejs";
export const GET = api(async (request, context) => {
  const { id } = await context.params;
  const user = await sessionUser(request);
  const image = await productImage(z.uuid().parse(id), user);
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
