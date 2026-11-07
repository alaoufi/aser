import { ZodError } from "zod";
import { HttpError, assertOrigin } from "./security";
export function api(
  handler: (request: Request, context: any) => Promise<Response>,
  mutating = false,
) {
  return async (request: Request, context: any) => {
    try {
      if (mutating) {
        assertOrigin(request);
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > 11 * 1024 * 1024)
          throw new HttpError(413, "حجم الطلب كبير");
      }
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      if (error instanceof ZodError)
        return Response.json(
          { error: error.issues[0]?.message ?? "بيانات غير صحيحة" },
          { status: 400 },
        );
      if (error instanceof SyntaxError)
        return Response.json(
          { error: "بيانات الطلب غير صحيحة" },
          { status: 400 },
        );
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "23505")
          return json({ error: "السجل موجود بالفعل أو الرابط مستخدم" }, 409);
        if (
          error.code === "23503" ||
          error.code === "23514" ||
          error.code === "22007" ||
          error.code === "22008"
        )
          return json(
            { error: "تحقق من البيانات والارتباط بالسجلات المعتمدة" },
            400,
          );
      }
      console.error("API request failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return Response.json(
        { error: "تعذر إكمال الطلب، يرجى المحاولة لاحقًا" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
export async function readBoundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, "حجم الطلب كبير");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function jsonBody(request: Request) {
  const bytes = await readBoundedBody(request, 64000);
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
