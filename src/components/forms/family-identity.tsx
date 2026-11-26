"use client";
import { useEffect, useState } from "react";
import type { SiteTextKey } from "@/lib/site-texts";
import { useTx } from "@/components/site-texts";
import { BrandCard } from "./brand-card";
import { ContactVisibilityCard } from "./contact-visibility";
import { FamilyTableCard } from "./family-table-card";
import { FolderTabs } from "./folder-tabs";
import { FulfillmentCard } from "./fulfillment";
import { ProfileForm } from "./profile";
import { AccountShell, Guard, s, useSession } from "./shared";

/** أقسام «هوية الأسرة»؛ الرابط المباشر لكل قسم: /dashboard/identity#table */
const PARTS = ["data", "brand", "table", "location", "contact"] as const;
type Part = (typeof PARTS)[number];

/**
 * «هوية الأسرة» (طلب المالك 2026-11-26): تبويب مستقل في لوحة الأسرة، وتحته بيانات الأسرة،
 * والألوان والزخرفة، والمائدة، والموقع (طرق التسليم وموقع الاستلام)، وظهور التواصل.
 */
export function FamilyIdentity() {
  const session = useSession();
  const { tx, txb } = useTx();
  const [part, setPart] = useState<Part>("data");
  useEffect(() => {
    const fromHash = () => {
      const id = location.hash.slice(1) as Part;
      if (PARTS.includes(id)) setPart(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const choose = (id: string) => {
    setPart(id as Part);
    history.replaceState(
      null,
      "",
      id === "data" ? location.pathname : `#${id}`,
    );
  };
  const user = session.user;
  return (
    <AccountShell>
      <h1>{txb("fidentity.title")}</h1>
      <Guard {...session} />
      {user && (
        <>
          <p className={s.muted}>{tx("fidentity.intro")}</p>
          <FolderTabs
            label={tx("fidentity.title")}
            tabs={PARTS.map((id) => ({
              id,
              label: txb(`fidentity.tab.${id}` as SiteTextKey),
            }))}
            active={part}
            onSelect={choose}
          >
            {part === "data" && <ProfileForm part="data" />}
            {part === "brand" && (
              <BrandCard name={user.familyName || user.name} />
            )}
            {part === "table" && <FamilyTableCard />}
            {part === "location" && <FulfillmentCard />}
            {part === "contact" && <ContactVisibilityCard />}
          </FolderTabs>
        </>
      )}
    </AccountShell>
  );
}
