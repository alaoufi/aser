import s from "./certificate.module.css";

const starPath =
  "M12 1.8l3.1 6.4 7 1-5.1 5 1.2 7L12 17.9l-6.2 3.3 1.2-7-5.1-5 7-1z";

function formatDates(iso: string) {
  const d = new Date(iso);
  const opts = { day: "numeric", month: "long", year: "numeric" } as const;
  return {
    gregorian: `${new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", opts).format(d)}م`,
    hijri: new Intl.DateTimeFormat(
      "ar-SA-u-ca-islamic-umalqura-nu-latn",
      opts,
    ).format(d),
  };
}

function Corner({ className }: { className: string }) {
  return (
    <svg
      className={`${s.corner} ${className}`}
      viewBox="0 0 150 150"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="url(#cert-gold)"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M146 40 C110 40 92 30 84 4" />
        <path d="M110 4 C112 30 124 40 146 42" />
        <path d="M146 70 C96 70 70 54 60 4" />
        <circle cx="128" cy="22" r="9" />
        <path d="M128 4v8M146 22h-8" />
      </g>
      <path d="M128 14l4 8-4 8-4-8z" fill="url(#cert-gold)" />
      <path d="M95 52l6 6-6 6-6-6z" fill="#9c2f1e" opacity=".85" />
    </svg>
  );
}

function Rule({ className }: { className: string }) {
  return (
    <svg
      className={`${s.rule} ${className}`}
      viewBox="0 0 1000 22"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x="0" y="10" width="1000" height="2" fill="url(#cert-rule)" />
      <path d="M500 2l9 9-9 9-9-9z" fill="#b8862e" />
      <circle cx="470" cy="11" r="3" fill="#9c2f1e" />
      <circle cx="530" cy="11" r="3" fill="#9c2f1e" />
    </svg>
  );
}

/** شهادة «أسرة مميزة»: الاسم والتاريخ من بيانات الشهادة، والنصوص من «نصوص الموقع». */
export function CertificateArt({
  familyName,
  issuedAt,
  title,
  body,
  badge,
}: {
  familyName: string;
  issuedAt: string;
  title: string;
  body: string;
  badge: string;
}) {
  const { gregorian, hijri } = formatDates(issuedAt);
  const rays = Array.from({ length: 32 }, (_, i) => {
    const a = (i * Math.PI) / 16;
    const p = (t: number) =>
      `${(100 + 96 * Math.cos(t)).toFixed(2)} ${(100 + 96 * Math.sin(t)).toFixed(2)}`;
    return `M100 100 L${p(a - 0.07)} L${p(a + 0.07)}Z`;
  });
  return (
    <div className={s.stage}>
      <article className={s.c} aria-label={`${title}: ${familyName}`}>
        <svg className={s.paper} aria-hidden="true">
          <defs>
            <filter id="cert-noise">
              <feTurbulence
                type="fractalNoise"
                baseFrequency=".8"
                numOctaves={3}
                seed={7}
              />
              <feColorMatrix values="0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .55 0" />
            </filter>
            <linearGradient id="cert-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f3d58b" />
              <stop offset=".5" stopColor="#b8862e" />
              <stop offset="1" stopColor="#8a5a14" />
            </linearGradient>
            <linearGradient id="cert-rule" x1="0" x2="1">
              <stop offset="0" stopColor="#b8862e" stopOpacity="0" />
              <stop offset=".15" stopColor="#b8862e" />
              <stop offset=".85" stopColor="#b8862e" />
              <stop offset="1" stopColor="#b8862e" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="cert-star" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbe7a8" />
              <stop offset=".5" stopColor="#d9a94e" />
              <stop offset="1" stopColor="#8a5a14" />
            </linearGradient>
            <radialGradient id="cert-seal" cx=".38" cy=".32" r=".8">
              <stop offset="0" stopColor="#fbe7a8" />
              <stop offset=".45" stopColor="#d9a94e" />
              <stop offset="1" stopColor="#7d5010" />
            </radialGradient>
            <pattern
              id="cert-sadu"
              width="44"
              height="26"
              patternUnits="userSpaceOnUse"
            >
              <rect width="44" height="26" fill="#2e1d12" />
              <path d="M0 26L22 4L44 26Z" fill="#9c2f1e" />
              <path d="M11 26L22 15L33 26Z" fill="#f3e6cc" />
              <circle cx="0" cy="8" r="2.6" fill="#f3e6cc" />
              <circle cx="44" cy="8" r="2.6" fill="#f3e6cc" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" filter="url(#cert-noise)" />
        </svg>
        <div className={s.frame} />
        <div className={s.frame2} />
        <svg
          className={`${s.sadu} ${s.saduTop}`}
          viewBox="0 0 1468 26"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect width="1468" height="26" fill="url(#cert-sadu)" />
        </svg>
        <svg
          className={`${s.sadu} ${s.saduBottom}`}
          viewBox="0 0 1468 26"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect width="1468" height="26" fill="url(#cert-sadu)" />
        </svg>
        <Corner className={s.tr} />
        <Corner className={s.tl} />
        <Corner className={s.br} />
        <Corner className={s.bl} />
        {/* biome-ignore lint/performance/noImgElement: تُطبع الشهادة كما هي دون تحسين الصور */}
        <img
          className={s.logo}
          src="/brand/jdatna-main.webp"
          alt="أكلات جدتنا"
          width={150}
          height={188}
        />
        <h1 className={`${s.title} ${s.gold}`}>{title}</h1>
        <p className={s.lead}>{body}</p>
        <div className={s.stars} role="img" aria-label="5 نجوم">
          {[1, 2, 3, 4, 5].map((n) => (
            <svg key={n} viewBox="0 0 24 24" aria-hidden="true">
              <path
                d={starPath}
                fill="url(#cert-star)"
                stroke="#7d5010"
                strokeWidth=".6"
              />
            </svg>
          ))}
        </div>
        <div className={s.nameBox}>
          <Rule className={s.ruleTop} />
          <p className={s.name}>{familyName}</p>
          <Rule className={s.ruleBottom} />
        </div>
        <div className={s.foot}>
          <div className={s.date}>
            <div className={s.lab}>تاريخ الإصدار</div>
            <div className={s.val}>{gregorian}</div>
            <div className={s.sub}>{hijri}</div>
            <div className={s.line} />
          </div>
          <svg className={s.seal} viewBox="0 0 200 200" aria-hidden="true">
            {rays.map((d) => (
              <path key={d} d={d} fill="#c2913a" />
            ))}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="url(#cert-seal)"
              stroke="#7d5010"
              strokeWidth="2"
            />
            <circle
              cx="100"
              cy="100"
              r="54"
              fill="none"
              stroke="#fff3cf"
              strokeOpacity=".8"
              strokeWidth="1.5"
            />
            <text
              x="100"
              y="72"
              textAnchor="middle"
              fontSize="17"
              fontWeight="800"
              fill="#4a2f08"
            >
              أكلات جدتنا
            </text>
            <path
              d="M100 80l6.5 13.2 14.5 2.1-10.5 10.2 2.5 14.5L100 113.2l-13 6.8 2.5-14.5-10.5-10.2 14.5-2.1z"
              fill="#fff3cf"
              stroke="#7d5010"
              strokeWidth="1.5"
            />
            <text
              x="100"
              y="142"
              textAnchor="middle"
              fontSize="16"
              fontWeight="800"
              fill="#4a2f08"
            >
              {badge}
            </text>
          </svg>
          <div className={s.sign}>
            <div className={s.lab}>الإدارة</div>
            {/* biome-ignore lint/performance/noImgElement: توقيع ثابت يُطبع كما هو */}
            <img
              className={s.signature}
              src="/certificates/signature.png"
              alt="توقيع الإدارة"
              width={220}
              height={92}
            />
            <div className={s.line} />
          </div>
        </div>
      </article>
    </div>
  );
}

export { s as certificateStyles };
