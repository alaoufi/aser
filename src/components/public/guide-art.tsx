/**
 * رسوم دليل المستخدم: مشاهد بسيطة ملوّنة بألوان الهوية (ورق، زيتوني، صدئي، ذهبي)،
 * زخرفية فقط (aria-hidden)؛ الشرح كله في النص بجانبها.
 */
export type ArtName =
  | "welcome"
  | "account"
  | "browse"
  | "order"
  | "chat"
  | "voice"
  | "safety"
  | "subscribe"
  | "dishes"
  | "rating"
  | "family"
  | "family-tools"
  | "courier"
  | "privacy"
  | "help";

const C = {
  paper: "#fcf8f0",
  cream: "#f3e7d3",
  ink: "#38291f",
  olive: "#526247",
  sage: "#a8b597",
  rust: "#a75035",
  gold: "#d6a35c",
  sky: "#cfe3e8",
  green: "#00a884",
  bubble: "#d9fdd3",
  red: "#b42318",
};

function Phone({
  x = 70,
  children,
}: {
  x?: number;
  children?: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} 18)`}>
      <rect width="100" height="170" rx="16" fill={C.ink} />
      <rect x="7" y="14" width="86" height="142" rx="6" fill={C.paper} />
      <rect x="38" y="6" width="24" height="4" rx="2" fill="#6b5545" />
      {children}
    </g>
  );
}

function Bowl({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-6 -16c4-6 0-10 4-16M6 -16c4-6 0-10 4-16"
        stroke={C.sage}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="0" cy="0" rx="40" ry="10" fill={C.gold} />
      <path d="M-40 0a40 30 0 0 0 80 0z" fill={C.rust} />
      <path d="M-30 10h60" stroke={C.gold} strokeWidth="3" />
      <rect x="-14" y="26" width="28" height="6" rx="3" fill={C.ink} />
    </g>
  );
}

const scenes: Record<ArtName, React.ReactNode> = {
  welcome: (
    <>
      <circle cx="120" cy="105" r="78" fill={C.cream} />
      <Bowl x={120} y={110} s={1.3} />
      <circle cx="52" cy="48" r="8" fill={C.gold} />
      <circle cx="190" cy="60" r="6" fill={C.sage} />
      <circle cx="198" cy="160" r="9" fill={C.rust} opacity=".6" />
    </>
  ),
  account: (
    <Phone>
      <circle cx="50" cy="52" r="18" fill={C.sage} />
      <path d="M22 96a28 22 0 0 1 56 0z" fill={C.olive} />
      <rect x="18" y="108" width="64" height="12" rx="6" fill={C.cream} />
      <g fill={C.ink}>
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={29 + i * 14} cy="114" r="3" />
        ))}
      </g>
      <rect x="18" y="128" width="64" height="16" rx="8" fill={C.green} />
    </Phone>
  ),
  browse: (
    <>
      <rect x="22" y="30" width="196" height="150" rx="14" fill={C.cream} />
      <path
        d="M40 60l30-14 30 14 30-14 30 14 30-14v100l-30 14-30-14-30 14-30-14-30 14z"
        fill={C.sky}
      />
      <path
        d="M100 46v100M160 46v100M70 60v100M130 60v100"
        stroke="#fff"
        strokeWidth="2"
        opacity=".7"
      />
      <path
        d="M120 70c-14 0-24 10-24 23 0 18 24 40 24 40s24-22 24-40c0-13-10-23-24-23z"
        fill={C.rust}
      />
      <circle cx="120" cy="93" r="8" fill={C.paper} />
    </>
  ),
  order: (
    <>
      <Phone x={24}>
        <rect x="14" y="22" width="72" height="54" rx="6" fill={C.gold} />
        <Bowl x={50} y={52} s={0.55} />
        <rect x="14" y="84" width="50" height="8" rx="4" fill={C.ink} />
        <rect x="14" y="98" width="34" height="8" rx="4" fill={C.sage} />
        <rect x="14" y="124" width="72" height="18" rx="9" fill={C.rust} />
      </Phone>
      <path
        d="M140 100h40"
        stroke={C.olive}
        strokeWidth="4"
        strokeDasharray="6 6"
      />
      <path
        d="M176 90l14 10-14 10"
        fill="none"
        stroke={C.olive}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M194 74l26 18v34h-52V92z" fill={C.olive} />
      <rect x="200" y="106" width="14" height="20" fill={C.cream} />
    </>
  ),
  chat: (
    <Phone>
      <rect
        x="12"
        y="24"
        width="56"
        height="20"
        rx="8"
        fill="#fff"
        stroke={C.cream}
      />
      <rect x="32" y="52" width="56" height="20" rx="8" fill={C.bubble} />
      <rect
        x="12"
        y="80"
        width="46"
        height="20"
        rx="8"
        fill="#fff"
        stroke={C.cream}
      />
      <path
        d="M64 66l4 4 7-8M70 66l4 4 7-8"
        stroke="#53bdeb"
        strokeWidth="2"
        fill="none"
      />
      <rect
        x="10"
        y="128"
        width="62"
        height="18"
        rx="9"
        fill="#fff"
        stroke={C.cream}
      />
      <circle cx="82" cy="137" r="10" fill={C.green} />
    </Phone>
  ),
  voice: (
    <>
      <Phone>
        <rect x="12" y="36" width="76" height="30" rx="10" fill={C.bubble} />
        <circle cx="26" cy="51" r="8" fill={C.green} />
        <path d="M24 47l6 4-6 4z" fill="#fff" />
        <g stroke={C.olive} strokeWidth="3" strokeLinecap="round">
          {[6, 12, 8, 16, 10, 14, 6, 11].map((h, i) => (
            <path key={i} d={`M${40 + i * 6} ${51 - h / 2}v${h}`} />
          ))}
        </g>
        <rect
          x="10"
          y="126"
          width="56"
          height="20"
          rx="10"
          fill="#fff"
          stroke={C.cream}
        />
        <circle cx="20" cy="136" r="4" fill={C.red} />
        <circle cx="80" cy="136" r="11" fill={C.green} />
        <rect x="77" y="128" width="6" height="10" rx="3" fill="#fff" />
        <path
          d="M74 137a6 6 0 0 0 12 0"
          stroke="#fff"
          strokeWidth="2"
          fill="none"
        />
      </Phone>
      <g stroke={C.gold} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M190 80a26 26 0 0 1 0 50" />
        <path d="M204 66a46 46 0 0 1 0 78" opacity=".6" />
      </g>
    </>
  ),
  safety: (
    <>
      <path
        d="M120 24l70 26v52c0 44-30 70-70 84-40-14-70-40-70-84V50z"
        fill={C.olive}
      />
      <path d="M120 40l54 20v42c0 34-22 56-54 68z" fill={C.sage} opacity=".5" />
      <circle cx="120" cy="104" r="34" fill={C.paper} />
      <circle
        cx="120"
        cy="104"
        r="22"
        fill="none"
        stroke={C.red}
        strokeWidth="7"
      />
      <path d="M105 119l30-30" stroke={C.red} strokeWidth="7" />
    </>
  ),
  subscribe: (
    <>
      <rect
        x="40"
        y="40"
        width="160"
        height="140"
        rx="12"
        fill="#fff"
        stroke={C.cream}
        strokeWidth="3"
      />
      <rect x="40" y="40" width="160" height="34" rx="12" fill={C.rust} />
      <rect x="66" y="28" width="8" height="24" rx="4" fill={C.ink} />
      <rect x="166" y="28" width="8" height="24" rx="4" fill={C.ink} />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
        <rect
          key={i}
          x={56 + (i % 4) * 34}
          y={86 + Math.floor(i / 4) * 30}
          width="24"
          height="20"
          rx="4"
          fill={i % 3 === 1 ? C.gold : i % 5 === 0 ? C.sage : C.cream}
        />
      ))}
      <path
        d="M150 156l8 8 16-18"
        stroke={C.olive}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  dishes: (
    <>
      <rect x="28" y="36" width="184" height="140" rx="14" fill={C.cream} />
      <Bowl x={80} y={96} s={0.7} />
      <Bowl x={160} y={96} s={0.7} />
      <rect x="44" y="140" width="72" height="10" rx="5" fill={C.olive} />
      <rect x="124" y="140" width="72" height="10" rx="5" fill={C.gold} />
      <path
        d="M48 160h64M128 160h64"
        stroke={C.sage}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>
  ),
  rating: (
    <>
      <circle cx="120" cy="104" r="80" fill={C.cream} />
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          transform={`translate(${48 + i * 36} 104) scale(.75)`}
          d="M0-22l6.5 13.5 15 2-11 10.5 2.6 14.8L0 11.8-13.1 18.8l2.6-14.8-11-10.5 15-2z"
          fill={i < 4 ? C.gold : "#fff"}
          stroke={C.rust}
          strokeWidth="2"
        />
      ))}
      <rect x="70" y="140" width="100" height="12" rx="6" fill={C.olive} />
    </>
  ),
  family: (
    <>
      <path d="M40 96l80-60 80 60v86H40z" fill={C.rust} />
      <path
        d="M28 100l92-70 92 70"
        fill="none"
        stroke={C.ink}
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <rect x="100" y="126" width="40" height="56" rx="4" fill={C.gold} />
      <rect x="56" y="112" width="30" height="26" rx="3" fill={C.sky} />
      <rect x="154" y="112" width="30" height="26" rx="3" fill={C.sky} />
      <path d="M150 30v-10h16v24" fill={C.ink} />
      <path
        d="M154 16c4-6 0-8 4-14"
        stroke={C.sage}
        strokeWidth="3"
        fill="none"
      />
    </>
  ),
  "family-tools": (
    <>
      <rect
        x="26"
        y="34"
        width="188"
        height="140"
        rx="12"
        fill="#fff"
        stroke={C.cream}
        strokeWidth="3"
      />
      <rect x="26" y="34" width="188" height="26" rx="12" fill={C.olive} />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={40 + i * 60}
          y="72"
          width="50"
          height="40"
          rx="8"
          fill={[C.gold, C.cream, C.sage][i]}
        />
      ))}
      <path
        d="M44 150l30-20 26 12 34-26 30 16 30-22"
        fill="none"
        stroke={C.rust}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  courier: (
    <>
      <path
        d="M20 170h200"
        stroke={C.cream}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="70" cy="150" r="20" fill={C.ink} />
      <circle cx="70" cy="150" r="8" fill={C.cream} />
      <circle cx="176" cy="150" r="20" fill={C.ink} />
      <circle cx="176" cy="150" r="8" fill={C.cream} />
      <path
        d="M70 150l30-40h50l26 40"
        fill="none"
        stroke={C.olive}
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <rect x="40" y="76" width="56" height="46" rx="6" fill={C.rust} />
      <path d="M52 96h32" stroke={C.gold} strokeWidth="5" />
      <circle cx="140" cy="62" r="14" fill={C.gold} />
      <path d="M140 76l-6 34h20z" fill={C.olive} />
    </>
  ),
  privacy: (
    <>
      <rect x="70" y="90" width="100" height="86" rx="14" fill={C.olive} />
      <path
        d="M90 90V66a30 30 0 0 1 60 0v24"
        fill="none"
        stroke={C.ink}
        strokeWidth="12"
      />
      <circle cx="120" cy="128" r="12" fill={C.gold} />
      <rect x="116" y="132" width="8" height="22" rx="3" fill={C.gold} />
    </>
  ),
  help: (
    <>
      <circle cx="120" cy="104" r="78" fill={C.sage} opacity=".45" />
      <circle
        cx="120"
        cy="104"
        r="56"
        fill={C.paper}
        stroke={C.olive}
        strokeWidth="6"
      />
      <path
        d="M102 88a18 18 0 1 1 26 16c-6 3-8 7-8 14"
        fill="none"
        stroke={C.rust}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cx="120" cy="138" r="7" fill={C.rust} />
    </>
  ),
};

export function GuideArt({ name }: { name: ArtName }) {
  return (
    <svg
      viewBox="0 0 240 200"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {scenes[name]}
    </svg>
  );
}
