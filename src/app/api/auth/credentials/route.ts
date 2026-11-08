import { api, jsonBody } from "@/server/http";
import { setCredentials } from "@/server/credentials";
import { sessionCookie } from "@/server/auth";
export const POST = api(async (request) => {
  const { user, token, next } = await setCredentials(
    request,
    await jsonBody(request),
  );
  return Response.json(
    { user, next },
    {
      headers: {
        "Set-Cookie": sessionCookie(token),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
