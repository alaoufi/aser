"use client";
import { useState } from "react";
import { s as forms } from "@/components/forms/shared";
import { AD_FRAME, MAX_AD_VIDEO_SECONDS, fitsFrame } from "@/lib/ads";
import css from "./ads-admin.module.css";

/**
 * صورة الإعلان أو مقطعه (من «أي خدمة»، AdImageFit، AYK-408 وAYK-421): تُفحص قبل الرفع أمام إطار
 * المكان 1200×400. ما لا يناسبه يُقص ويُعدَّل دون تمطيط، ويُعرض قبل وبعد، فيختار صاحبه «موافق» أو
 * «سأعدّل الصورة بنفسي». المقطع يُعرض في الإطار كما سيظهر، وحده 30 ثانية.
 */
type Position = "start" | "center" | "end";
type Pending = {
  url: string;
  img: HTMLImageElement;
  width: number;
  height: number;
  name: string;
};

function readImage(file: File) {
  return new Promise<Pending>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        url,
        img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر قراءة الصورة"));
    };
    img.src = url;
  });
}
function readVideo(file: File) {
  return new Promise<{ duration: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: video.duration });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر قراءة المقطع"));
    };
    video.src = url;
  });
}
/** قص (cover) وتعديل للإطار؛ الموضع على المحور الزائد: البداية أو الوسط أو النهاية. */
function fitImage(img: HTMLImageElement, position: Position, name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = AD_FRAME.width;
  canvas.height = AD_FRAME.height;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.max(
    AD_FRAME.width / img.naturalWidth,
    AD_FRAME.height / img.naturalHeight,
  );
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const at = (free: number) =>
    position === "start" ? 0 : position === "end" ? free : free / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, at(AD_FRAME.width - w), at(AD_FRAME.height - h), w, h);
  return new Promise<File>((resolve) =>
    canvas.toBlob(
      (blob) =>
        resolve(
          new File([blob!], name.replace(/\.[a-z0-9]+$/i, "") + "-fit.jpg", {
            type: "image/jpeg",
          }),
        ),
      "image/jpeg",
      0.9,
    ),
  );
}

export function AdMediaPicker({
  current,
  onUpload,
}: {
  current: { url: string; type: "image" | "video" } | null;
  onUpload: (file: File) => Promise<void>;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [position, setPosition] = useState<Position>("center");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      await onUpload(file);
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function choose(file: File) {
    setError("");
    if (file.type.startsWith("video/")) {
      try {
        const { duration } = await readVideo(file);
        if (duration > MAX_AD_VIDEO_SECONDS + 0.5) {
          setError(
            `المقطع ${Math.round(duration)} ثانية، والحد ${MAX_AD_VIDEO_SECONDS} ثانية. قصّره ثم أعد رفعه.`,
          );
          return;
        }
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      return upload(file);
    }
    try {
      const p = await readImage(file);
      if (fitsFrame(p)) return upload(file);
      setPending(p);
      setPosition("center");
      const fitted = await fitImage(p.img, "center", p.name);
      setPreview(URL.createObjectURL(fitted));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function move(next: Position) {
    if (!pending) return;
    setPosition(next);
    setPreview(
      URL.createObjectURL(await fitImage(pending.img, next, pending.name)),
    );
  }
  const wide = pending
    ? pending.width / pending.height > AD_FRAME.width / AD_FRAME.height
    : true;

  return (
    <div className={css.media}>
      {current && !pending && (
        <div className={css.frame}>
          {current.type === "video" ? (
            <video src={current.url} muted loop autoPlay playsInline />
          ) : (
            // biome-ignore lint/performance/noImgElement: معاينة صورة الإعلان في إطارها
            <img src={current.url} alt="صورة الإعلان الحالية" />
          )}
        </div>
      )}
      <label className={forms.field}>
        {current ? "تغيير الصورة أو المقطع" : "صورة أو مقطع الإعلان"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void choose(file);
          }}
        />
      </label>
      <small className={css.hint}>
        إطار المكان {AD_FRAME.width}×{AD_FRAME.height}. الصورة التي لا تناسبه
        تُقص دون تمطيط وتُعرض عليك قبل الرفع. المقطع حتى {MAX_AD_VIDEO_SECONDS}{" "}
        ثانية.
      </small>
      {pending && (
        <section className={css.fit} aria-label="تعديل الصورة للإطار">
          <p>
            الصورة {pending.width}×{pending.height} لا تناسب الإطار{" "}
            {AD_FRAME.width}×{AD_FRAME.height}
            {pending.width < AD_FRAME.width * 0.75
              ? "، وهي أصغر منه فقد تظهر غير واضحة"
              : ""}
            . هذه هي بعد القص:
          </p>
          <div className={css.compare}>
            <figure>
              {/* biome-ignore lint/performance/noImgElement: معاينة قبل القص */}
              <img src={pending.url} alt="قبل" />
              <figcaption>قبل</figcaption>
            </figure>
            <figure>
              <div className={css.frame}>
                {/* biome-ignore lint/performance/noImgElement: معاينة بعد القص */}
                {preview && <img src={preview} alt="بعد" />}
              </div>
              <figcaption>بعد (كما يظهر في الموقع)</figcaption>
            </figure>
          </div>
          <div className={forms.actions} role="group" aria-label="الجزء الظاهر">
            {(
              [
                // البداية = بداية الصورة على المحور الزائد (يسارها أو أعلاها).
                ["end", wide ? "اليمين" : "الأسفل"],
                ["center", "الوسط"],
                ["start", wide ? "اليسار" : "الأعلى"],
              ] as [Position, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={forms.buttonSecondary}
                aria-pressed={position === id}
                onClick={() => void move(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={forms.actions}>
            <button
              type="button"
              className={forms.button}
              disabled={busy}
              onClick={async () =>
                upload(await fitImage(pending.img, position, pending.name))
              }
            >
              {busy ? "جارٍ الرفع…" : "موافق"}
            </button>
            <button
              type="button"
              className={forms.buttonSecondary}
              onClick={() => setPending(null)}
            >
              سأعدّل الصورة بنفسي
            </button>
          </div>
        </section>
      )}
      {busy && !pending && <p role="status">جارٍ الرفع…</p>}
      {error && (
        <p role="alert" className={forms.error}>
          {error}
        </p>
      )}
    </div>
  );
}
