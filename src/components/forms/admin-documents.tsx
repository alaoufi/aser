"use client";
import { useEffect, useState } from "react";
import { useTx } from "@/components/site-texts";
import { Message, api, s } from "./shared";

type Doc = {
  id: string;
  type: string;
  mime: string;
  size: number;
  createdAt: string;
  familyName: string;
  slug: string | null;
  familyStatus: string | null;
  memberNo: number | null;
  documentType: string | null;
  documentNumber: string | null;
  expiresAt: string | null;
  decision: string | null;
};

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} م.ب`
    : `${Math.max(1, Math.round(n / 1024))} ك.ب`;
const day = (v: string) =>
  new Date(v).toLocaleDateString("ar-SA-u-ca-gregory", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * «مستندات الأسر» (قرار المالك 2026-11-27): كل مستندات كل أسرة، الأحدث أولًا، مع البحث بالاسم أو رقم
 * العضو. «عرض» يفتح الصورة أو PDF في المتصفح، وغيرها يُنزَّل. كل فتح يُسجَّل في سجل الإدارة.
 */
export function AdminDocuments({ labels }: { labels: Record<string, string> }) {
  const { txb } = useTx();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ documents: Doc[] }>(
        `/api/admin/documents?q=${encodeURIComponent(q)}`,
      )
        .then((d) => setDocs(d.documents))
        .catch((e) => setError((e as Error).message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <section aria-labelledby="docs-title" className="admin-documents">
      <h2 id="docs-title">{txb("adocs.title")}</h2>
      <p className={s.muted}>{txb("adocs.note")}</p>
      <label className={s.field}>
        {txb("adocs.search")}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={txb("adocs.searchHint")}
        />
      </label>
      <Message error={error} />
      {!docs ? (
        !error && <p role="status">{txb("adocs.loading")}</p>
      ) : !docs.length ? (
        <p className={s.muted}>{txb("adocs.empty")}</p>
      ) : (
        <ul className="admin-documents-list">
          {docs.map((d) => (
            <li key={d.id} className={s.card}>
              <div>
                <strong>{d.familyName}</strong>
                {d.memberNo != null && (
                  <small className={s.muted}>
                    {" "}
                    · {txb("adocs.member")} {d.memberNo}
                  </small>
                )}
              </div>
              <p>
                {labels[d.documentType ?? d.type] ?? d.documentType ?? d.type}
                {d.documentNumber ? ` · ${d.documentNumber}` : ""}
                {d.expiresAt
                  ? ` · ${txb("adocs.expires")} ${day(d.expiresAt)}`
                  : ""}
              </p>
              <small className={s.muted}>
                {day(d.createdAt)} · {kb(d.size)} ·{" "}
                {d.mime === "application/pdf" ? "PDF" : d.mime.split("/")[1]}
              </small>
              <div className={s.actions}>
                {/* فتح بلا noreferrer: الرابط من نفس الموقع ويحتاج الجلسة. */}
                <a
                  className={s.button}
                  href={`/api/documents/${d.id}?view=1`}
                  target="_blank"
                  rel="noopener"
                >
                  {txb("adocs.view")}
                </a>
                <a
                  className={s.buttonSecondary}
                  href={`/api/documents/${d.id}`}
                >
                  {txb("adocs.download")}
                </a>
                {d.slug && (
                  <a className="text-link" href={`/producers/${d.slug}`}>
                    {txb("adocs.page")}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
