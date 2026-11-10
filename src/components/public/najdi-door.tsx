/** واجهة القالب النجدي: جدار طين، باب خشب مزخرف يطل منه الطبق، ونافذتا خشب. */
function WoodWindow() {
  return (
    <svg className="najdi-window" viewBox="0 0 62 84" aria-hidden="true">
      <rect x="1" y="1" width="60" height="82" rx="2" fill="#5c3518" />
      <rect x="6" y="6" width="50" height="72" fill="#7a4a24" />
      <rect x="30" y="6" width="2" height="72" fill="#5c3518" />
      <path
        fill="#2e1d12"
        d="M10 14l5-6 5 6zM21 14l5-6 5 6zM34 14l5-6 5 6zM45 14l5-6 5 6z"
      />
      <path
        fill="#d6a35c"
        d="M10 34l5 6 5-6zM21 34l5 6 5-6zM34 34l5 6 5-6zM45 34l5 6 5-6z"
      />
      <path
        fill="#9c2f1e"
        d="M10 56l5-6 5 6zM21 56l5-6 5 6zM34 56l5-6 5 6zM45 56l5-6 5 6z"
      />
      <circle cx="27" cy="46" r="1.8" fill="#d6a35c" />
      <circle cx="35" cy="46" r="1.8" fill="#d6a35c" />
    </svg>
  );
}

export function NajdiDoor() {
  return (
    <figure className="najdi-wall">
      <div className="najdi-wall-inner">
        <WoodWindow />
        <svg
          className="najdi-door"
          viewBox="0 0 200 300"
          role="img"
          aria-label="باب نجدي خشبي يطل منه طبق أرز"
        >
          <defs>
            <pattern
              id="najdi-grain"
              width="8"
              height="300"
              patternUnits="userSpaceOnUse"
            >
              <rect width="8" height="300" fill="#7a4a24" />
              <rect x="5" width="1" height="300" fill="#8d5a2e" />
              <rect x="2" width="0.6" height="300" fill="#6b3f1d" />
            </pattern>
            <pattern
              id="najdi-tri-1"
              width="20"
              height="16"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0 16L10 0L20 16z" fill="#9c2f1e" />
              <path d="M10 0L20 16L30 0z" fill="#efe3cc" />
              <path d="M-10 0L0 16L10 0z" fill="#efe3cc" />
            </pattern>
            <pattern
              id="najdi-tri-2"
              width="20"
              height="16"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0 0L10 16L20 0z" fill="#2f4a6b" />
              <path d="M10 16L20 0L30 16z" fill="#d6a35c" />
              <path d="M-10 16L0 0L10 16z" fill="#d6a35c" />
            </pattern>
            <pattern
              id="najdi-tri-3"
              width="20"
              height="16"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0 16L10 0L20 16z" fill="#4f5d36" />
              <path d="M10 0L20 16L30 0z" fill="#efe3cc" />
              <path d="M-10 0L0 16L10 0z" fill="#efe3cc" />
            </pattern>
            <clipPath id="najdi-arch">
              <path d="M14 300V64Q14 14 100 14Q186 14 186 64V300z" />
            </clipPath>
          </defs>
          <path d="M0 300V60Q0 0 100 0Q200 0 200 60V300z" fill="#c9a877" />
          <path d="M6 300V62Q6 6 100 6Q194 6 194 62V300z" fill="#5c3518" />
          <g clipPath="url(#najdi-arch)">
            <rect width="200" height="300" fill="#f1e2c6" />
            <circle cx="100" cy="120" r="70" fill="#e5cfa6" />
          </g>
          <image
            href="/food/rice-plate-floating-v2.webp"
            x="40"
            y="60"
            width="120"
            height="120"
          />
          <rect
            x="14"
            y="160"
            width="172"
            height="140"
            fill="url(#najdi-grain)"
            stroke="#3e2310"
            strokeWidth="3"
          />
          <rect
            x="22"
            y="168"
            width="156"
            height="16"
            fill="url(#najdi-tri-1)"
          />
          <rect
            x="22"
            y="188"
            width="156"
            height="16"
            fill="url(#najdi-tri-2)"
          />
          <rect
            x="22"
            y="208"
            width="156"
            height="16"
            fill="url(#najdi-tri-3)"
          />
          <rect
            x="22"
            y="230"
            width="74"
            height="62"
            fill="none"
            stroke="#3e2310"
            strokeWidth="2"
          />
          <rect
            x="104"
            y="230"
            width="74"
            height="62"
            fill="none"
            stroke="#3e2310"
            strokeWidth="2"
          />
          <path d="M59 238l10 12-10 12-10-12z" fill="#d6a35c" />
          <path d="M141 238l10 12-10 12-10-12z" fill="#d6a35c" />
          <path d="M59 266l7 9-7 9-7-9z" fill="#9c2f1e" />
          <path d="M141 266l7 9-7 9-7-9z" fill="#9c2f1e" />
          <rect x="99" y="160" width="2" height="140" fill="#3e2310" />
          <circle cx="92" cy="262" r="4" fill="#d6a35c" stroke="#3e2310" />
          <circle cx="108" cy="262" r="4" fill="#d6a35c" stroke="#3e2310" />
          <path d="M100 18l8 10h-16z" fill="#9c2f1e" />
        </svg>
        <WoodWindow />
      </div>
      <div className="najdi-threshold" aria-hidden="true" />
    </figure>
  );
}
