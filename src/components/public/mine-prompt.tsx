"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/forms/shared";
import type { MineChoices } from "@/server/page-member";
import type { MemberScope } from "@/server/member-scope";

const year = 60 * 60 * 24 * 365;

/**
 * ما يحتاجه الخيار ليعمل، داخل لوحة «اعرض لي» نفسها:
 * - «منطقتي» بلا منطقة محددة: قائمة المناطق، والاختيار يُحفظ في الجهاز (مثل «نطاقك»).
 * - «خياراتي»: قائمة الأقسام ليختار منها، وتُحفظ في حسابه (وتُعدَّل من «عدّل خياراتي»).
 */
export function MinePrompt({
  needs,
  choices,
  words,
}: {
  needs: "region" | "interests";
  choices: MineChoices;
  words: MemberScope["words"];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(choices.chosen ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (needs === "region")
    return (
      <label className="mine-prompt">
        <span className="sr-only">منطقتك</span>
        <select
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return;
            document.cookie = `jdatna_region=${encodeURIComponent(e.target.value)}; path=/; max-age=${year}; samesite=lax`;
            router.refresh();
          }}
        >
          <option value="">{words.regionPlaceholder}</option>
          {(choices.regions ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
    );

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/me/interests", {
        method: "PUT",
        body: JSON.stringify({ categories: picked }),
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="mine-prompt">
      <legend className="sr-only">خياراتك من الأقسام</legend>
      <div className="mine-interests">
        {(choices.categories ?? []).map((c) => (
          <label key={c.id} className="mine-interest">
            <input
              type="checkbox"
              checked={picked.includes(c.id)}
              onChange={(e) =>
                setPicked((p) =>
                  e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id),
                )
              }
            />
            {c.name}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="button"
        onClick={save}
        disabled={busy || !picked.length}
      >
        {busy ? "جارٍ الحفظ…" : words.save}
      </button>
      {error && (
        <p role="alert" className="mine-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
