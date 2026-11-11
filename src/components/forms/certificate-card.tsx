"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, s } from "./shared";

type Data = {
  certificate: { id: string; issuedAt: string } | null;
  progress: { total: number; allFive: boolean; needed: number } | null;
  how: string;
};

/** بطاقة شهادة «أسرة مميزة» في «لوحتي»: الشهادة إن صدرت، وإلا التقدّم نحوها. */
export function CertificateCard() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    api<Data>("/api/producer/certificate")
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data?.progress) return null;
  const { certificate, progress } = data;
  return (
    <section
      className={`${s.card} ${s.certificateCard}`}
      aria-labelledby="certificate-card-title"
    >
      <h2 id="certificate-card-title">
        <span aria-hidden="true">★</span> شهادة «أسرة مميزة»
      </h2>
      {certificate ? (
        <>
          <p>مبروك! حصلت أسرتك على شهادة الشكر والتقدير.</p>
          <Link className={s.button} href={`/certificates/${certificate.id}`}>
            عرض الشهادة وتحميلها
          </Link>
        </>
      ) : (
        <>
          <p className={s.muted}>{data.how}</p>
          <p>
            تقييمات أسرتك:{" "}
            <strong>
              {Math.min(progress.total, progress.needed)} من {progress.needed}
            </strong>
            {progress.total > 0 &&
              (progress.allFive ? " · كلها 5 نجوم" : " · ليست كلها 5 نجوم بعد")}
          </p>
          <progress
            max={progress.needed}
            value={Math.min(progress.total, progress.needed)}
            aria-label="التقدّم نحو الشهادة"
          />
        </>
      )}
    </section>
  );
}
