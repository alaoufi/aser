import { randomUUID } from "node:crypto";
import { msg } from "./messages";
import { can } from "../lib/permissions";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";
import { rateLimit } from "./auth";

/**
 * الاقتراحات: يرسلها أي زائر أو عضو، ويقرؤها مسؤول الإدارة (المدير) فقط.
 * حد الإرسال يحمي من الإزعاج: 5 في الساعة لكل عضو، و60 في الساعة للموقع كله.
 */
const suggestionSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(5, "اكتب اقتراحك في خمسة أحرف على الأقل")
      .max(2000),
    name: z.string().trim().max(120).optional(),
    contact: z.string().trim().max(120).optional(),
  })
  .strict();

export async function submitSuggestion(
  user: SessionUser | null,
  input: unknown,
) {
  const value = suggestionSchema.parse(input);
  await rateLimit("suggestions-global", 600, 3600);
  if (user) await rateLimit("suggestions:" + user.id, 5, 3600);
  await db().query(
    "INSERT INTO jdatna.suggestions(id,user_id,name,contact,body) VALUES($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      user?.id ?? null,
      value.name || user?.name || null,
      value.contact || user?.phone || null,
      value.body,
    ],
  );
  // تنبيه المدير بالاقتراح الجديد (لا يُفشل الإرسال إن تعذر).
  try {
    const { notifyUser } = await import("./push");
    const admins = (
      await db().query("SELECT id FROM jdatna.users WHERE role='admin'")
    ).rows as { id: string }[];
    await Promise.all(
      admins.map(async (a) =>
        notifyUser(a.id, {
          title: await msg("alert.suggestion.title"),
          body:
            value.body.length > 120
              ? value.body.slice(0, 120) + "…"
              : value.body,
          url: "/admin?tab=suggestions",
          tag: "suggestion",
        }),
      ),
    );
  } catch {}
  return { sent: true };
}

function assertOwner(user: SessionUser) {
  if (!can(user, "suggestions"))
    throw new HttpError(403, "الاقتراحات لمن أُعطي قسمها في الإدارة");
}

export async function adminSuggestions(user: SessionUser) {
  assertOwner(user);
  return (
    await db().query(
      `SELECT id,name,contact,body,read_at AS "readAt",created_at AS "createdAt"
       FROM jdatna.suggestions ORDER BY created_at DESC LIMIT 300`,
    )
  ).rows;
}

/** تعليم الاقتراح مقروءًا أو حذفه. */
export async function manageSuggestion(user: SessionUser, input: unknown) {
  assertOwner(user);
  const { id, action } = z
    .object({ id: z.uuid(), action: z.enum(["read", "delete"]) })
    .strict()
    .parse(input);
  if (action === "delete")
    await db().query("DELETE FROM jdatna.suggestions WHERE id=$1", [id]);
  else
    await db().query(
      "UPDATE jdatna.suggestions SET read_at=COALESCE(read_at,now()) WHERE id=$1",
      [id],
    );
  return { ok: true };
}
