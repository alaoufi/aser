"use client";
import { useEffect, useState } from "react";
import type { Category } from "@/lib/types";
import { categoryLabel } from "@/lib/category-label";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";

export type LibraryPhoto = {
  id: string;
  name: string;
  description: string;
  categoryId: string | null;
  url: string;
  usedBy: number;
};

/** أقسام الأسرة فقط، لاختيار قسم الصورة. */
function useFamilyCategories() {
  const [all, setAll] = useState<Category[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    api<{
      categories: Category[];
      profile: { categoryIds?: string[] } | null;
    }>("/api/producer/profile")
      .then((d) => {
        setAll(d.categories);
        setMine(d.profile?.categoryIds ?? []);
      })
      .catch(() => {});
  }, []);
  return { all, mine: all.filter((c) => mine.includes(c.id)) };
}

/** مكتبة صور الأسرة: ترفع صورة الطبق باسمه ووصفه وقسمه، وتختارها لاحقًا للمنتج. */
export function PhotoLibrary() {
  const session = useSession();
  const { all, mine } = useFamilyCategories();
  const [photos, setPhotos] = useState<LibraryPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState("");
  async function load() {
    setPhotos(
      (await api<{ photos: LibraryPhoto[] }>("/api/producer/library")).photos,
    );
  }
  useEffect(() => {
    if (session.user) load().catch((e) => setError((e as Error).message));
  }, [session.user?.id]);
  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await task();
      await load();
      setSuccess(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = new FormData(form);
    if (
      await run(
        () => api("/api/producer/library", { method: "POST", body }),
        "تمت إضافة الصورة إلى مكتبتك.",
      )
    )
      form.reset();
  }
  const categoryOptions = (id: string, selected?: string | null) => (
    <select id={id} name="categoryId" defaultValue={selected ?? ""}>
      <option value="">بدون قسم</option>
      {mine.map((c) => (
        <option key={c.id} value={c.id}>
          {categoryLabel(c, all)}
        </option>
      ))}
    </select>
  );
  return (
    <AccountShell>
      <Guard {...session} />
      {session.user && (
        <>
          <h1>مكتبة الصور</h1>
          <p className={s.muted}>
            صور أطباقك الخاصة بك وحدك. ارفع صورة الطبق باسمه ووصفه وقسمه، ثم
            اخترها عند إضافة منتج.
          </p>
          <form className={`${s.card} ${s.form}`} onSubmit={upload}>
            <h2>إضافة صورة طبق</h2>
            <div className={s.grid}>
              <label className={s.field}>
                صورة الطبق
                <input
                  name="file"
                  type="file"
                  accept="image/jpeg,image/png"
                  required
                />
                <small>JPEG أو PNG حتى 5 ميجابايت.</small>
              </label>
              <label className={s.field}>
                اسم الطبق
                <input name="name" required minLength={2} maxLength={120} />
              </label>
              <div className={s.field}>
                <label htmlFor="library-new-category">القسم</label>
                {categoryOptions("library-new-category")}
              </div>
            </div>
            <label className={s.field}>
              الوصف
              <textarea name="description" maxLength={2000} rows={2} />
            </label>
            <button className={s.button} disabled={busy}>
              {busy ? "جارٍ الرفع…" : "رفع إلى المكتبة"}
            </button>
          </form>
          <Message error={error} success={success} />
          {photos === null ? (
            <p role="status">جارٍ تحميل المكتبة…</p>
          ) : photos.length === 0 ? (
            <p className={s.notice}>مكتبتك فارغة. ارفع أول صورة لطبقك.</p>
          ) : (
            <ul className={s.library} aria-label="صور مكتبتي">
              {photos.map((p) => (
                <li key={p.id} className={s.card}>
                  <img src={p.url} alt={p.name} loading="lazy" />
                  {editing === p.id ? (
                    <form
                      className={s.form}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        if (
                          await run(
                            () =>
                              api("/api/producer/library", {
                                method: "PATCH",
                                body: JSON.stringify({
                                  id: p.id,
                                  name: f.get("name"),
                                  description: f.get("description"),
                                  categoryId: f.get("categoryId") || null,
                                }),
                              }),
                            "تم حفظ تعديل الصورة.",
                          )
                        )
                          setEditing("");
                      }}
                    >
                      <label className={s.field}>
                        اسم الطبق
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={120}
                          defaultValue={p.name}
                        />
                      </label>
                      <div className={s.field}>
                        <label htmlFor={`library-category-${p.id}`}>
                          القسم
                        </label>
                        {categoryOptions(
                          `library-category-${p.id}`,
                          p.categoryId,
                        )}
                      </div>
                      <label className={s.field}>
                        الوصف
                        <textarea
                          name="description"
                          maxLength={2000}
                          rows={2}
                          defaultValue={p.description}
                        />
                      </label>
                      <div className={s.actions}>
                        <button className={s.button} disabled={busy}>
                          حفظ
                        </button>
                        <button
                          type="button"
                          className={s.buttonSecondary}
                          onClick={() => setEditing("")}
                        >
                          إلغاء
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <h3>{p.name}</h3>
                      {p.categoryId && (
                        <span className={s.tag}>
                          {all.find((c) => c.id === p.categoryId)?.name}
                        </span>
                      )}
                      {p.description && <p>{p.description}</p>}
                      {p.usedBy > 0 && (
                        <small>مستخدمة في {p.usedBy} منتج</small>
                      )}
                      <div className={s.actions}>
                        <button
                          type="button"
                          className={s.button}
                          onClick={() => setEditing(p.id)}
                        >
                          تعديل {p.name}
                        </button>
                        <button
                          type="button"
                          className={s.danger}
                          disabled={busy || p.usedBy > 0}
                          onClick={() =>
                            run(
                              () =>
                                api("/api/producer/library", {
                                  method: "DELETE",
                                  body: JSON.stringify({ id: p.id }),
                                }),
                              "تم حذف الصورة.",
                            )
                          }
                        >
                          حذف {p.name}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AccountShell>
  );
}

/** اختيار صورة المنتج من مكتبة الأسرة داخل نموذج المنتج. */
export function LibraryPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (photo: LibraryPhoto | null) => void;
}) {
  const [photos, setPhotos] = useState<LibraryPhoto[] | null>(null);
  useEffect(() => {
    api<{ photos: LibraryPhoto[] }>("/api/producer/library")
      .then((d) => setPhotos(d.photos))
      .catch(() => setPhotos([]));
  }, []);
  return (
    <fieldset>
      <legend>صورة المنتج من مكتبة الصور</legend>
      {photos === null ? (
        <p role="status">جارٍ تحميل المكتبة…</p>
      ) : photos.length === 0 ? (
        <p className={s.muted}>
          مكتبتك فارغة. <a href="/dashboard/library">أضف صورًا إلى المكتبة</a>.
        </p>
      ) : (
        <div className={s.picker}>
          <label>
            <input
              type="radio"
              name="libraryPhoto"
              checked={!value}
              onChange={() => onPick(null)}
            />
            <span>بدون تغيير</span>
          </label>
          {photos.map((p) => (
            <label key={p.id}>
              <input
                type="radio"
                name="libraryPhoto"
                value={p.id}
                checked={value === p.id}
                onChange={() => onPick(p)}
              />
              <img src={p.url} alt="" loading="lazy" />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
