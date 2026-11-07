import { api } from "@/server/http";
import { logout, sessionCookie } from "@/server/auth";
export const POST = api(async (request) => {
  await logout(request);
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": sessionCookie("", 0),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
