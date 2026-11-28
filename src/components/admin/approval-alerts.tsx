"use client";
import { useEffect, useState } from "react";
import { Message, api, s } from "@/components/forms/shared";
import { useTx } from "@/components/site-texts";

type Recipient = {
  id: string;
  name: string;
  phone: string;
  role: string;
  memberNo: number | null;
  on: boolean;
};

/**
 * «من يستقبل إشعارات الموافقات» (قرار المالك 2026-11-28): المديرون وأصحاب صلاحية الاعتماد،
 * يحدد المدير العام من منهم يصله إشعار تسجيل أسرة أو مندوب جديد.
 */
export function ApprovalAlertsAdmin() {
  const { tx } = useTx();
  const [list, setList] = useState<Recipient[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const load = () =>
    api<{ recipients: Recipient[] }>("/api/admin/approval-alerts")
      .then((d) => setList(d.recipients))
      .catch((e) => {
        setList([]);
        setError((e as Error).message);
      });
  useEffect(() => {
    load();
  }, []);
  async function toggle(r: Recipient) {
    setError("");
    setSuccess("");
    setBusy(r.id);
    // يتغير فورًا، ويعود كما كان إن فشل الحفظ.
    setList((all) =>
      (all ?? []).map((x) => (x.id === r.id ? { ...x, on: !r.on } : x)),
    );
    try {
      await api("/api/admin/approval-alerts", {
        method: "POST",
        body: JSON.stringify({ id: r.id, on: !r.on }),
      });
      setSuccess(tx("approvalAlerts.saved"));
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy("");
    }
  }
  return (
    <section className={s.card} aria-label={tx("approvalAlerts.title")}>
      <h2>{tx("approvalAlerts.title")}</h2>
      <p className={s.muted}>{tx("approvalAlerts.hint")}</p>
      <Message error={error} success={success} />
      {list === null ? (
        <p role="status">{tx("approvalAlerts.loading")}</p>
      ) : (
        <ul aria-label={tx("approvalAlerts.title")}>
          {list.map((r) => (
            <li key={r.id}>
              <label>
                <input
                  type="checkbox"
                  checked={r.on}
                  aria-busy={busy === r.id || undefined}
                  onChange={() => toggle(r)}
                />{" "}
                {r.name}
                {r.memberNo ? ` · ${r.memberNo}` : ""} ·{" "}
                <small className={s.muted}>
                  {r.role === "admin"
                    ? tx("approvalAlerts.admin")
                    : tx("approvalAlerts.approver")}
                </small>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
