"use client";
import { useSession } from "@/components/forms/session";
import { useTx } from "@/components/site-texts";
import { SITE_URL } from "@/lib/seo";
import { ShareButton } from "./share-button";

/**
 * مشاركة التطبيق من رأس الموقع (قرار المالك 2026-11-27): قائمة المشاركة نفسها (واتساب، تيليجرام، …،
 * نسخ الرابط، رمز QR) برابط التطبيق الذي يفتح متجر جوال من يستلمه.
 * العضو المسجّل يشارك رابطه jdtna.sa/app/رقمه، فيُحسب له من يسجّل به كدعوة الصديق.
 */
export function HeaderShare() {
  const { user } = useSession();
  const { txb } = useTx();
  const no = user?.memberNo;
  const url = no ? `${SITE_URL}/app/${no}` : `${SITE_URL}/app`;
  const text = no
    ? `${txb("appShare.message")}\n${txb("invite.codeLine", { n: no })}`
    : txb("appShare.message");
  return (
    <ShareButton
      className="header-share"
      iconOnly={txb("appShare.label")}
      title={txb("appShare.title")}
      text={text}
      url={url}
      image="/brand/app-icon-512.png"
      qr={`/app/qr${no ? `?r=${no}` : ""}`}
    />
  );
}
