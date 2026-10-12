/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  أيقونات لوحة الإدارة — SVG مرسومة يدوياً بنمط واحد (خط 1.8، زوايا دائرية)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  القاعدة: لا إيموجي في الواجهة. كل زخرفة كانت إيموجي صارت مكوّن هنا.
 *  الاستثناء الوحيد: `emoji` القادم من قاعدة البيانات (شارة الرتبة نفسها)
 *  لأنه هوية الرتبة مو زخرفة، ويُعرض في `!رتب` والشات كما هو.
 */

import React from 'react';

export interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

function Svg({ size = 20, className, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IcHome: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.8V20h5v-6h4v6h5V9.8" />
  </Svg>
);

export const IcUsers: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.8 20c.7-3.6 3.2-5.6 6.2-5.6s5.5 2 6.2 5.6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M15.9 14.5c2.3.4 4.1 2 4.8 4.3" />
  </Svg>
);

export const IcFlame: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Svg>
);

export const IcGift: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    <path d="M12 8S12 4.2 9.6 3.7C8.1 3.4 7 4.4 7.3 5.6 7.7 7.3 12 8 12 8Z" />
    <path d="M12 8s0-3.8 2.4-4.3c1.5-.3 2.6.7 2.3 1.9C16.3 7.3 12 8 12 8Z" />
  </Svg>
);

export const IcSwords: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M5 3l10.5 13.5" />
    <path d="M13 15l4 4" />
    <path d="M19 3 8.5 16.5" />
    <path d="M11 15l-4 4" />
  </Svg>
);

export const IcMedal: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M9.4 10.4 6.8 3h3.7L12 6.6 13.5 3h3.7l-2.6 7.4" />
    <circle cx="12" cy="14.5" r="4.6" />
    <path d="M12 12.6l.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" />
  </Svg>
);

export const IcLog: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M6 2.5h8L19 8v13.5H6z" />
    <path d="M13.5 2.5V8H19" />
    <path d="M9 12.5h6M9 16h6" />
  </Svg>
);

export const IcLock: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    <path d="M12 15.2v2" />
  </Svg>
);

export const IcShield: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 3l7 2.8v5.4c0 4.8-3.2 7.7-7 9.3-3.8-1.6-7-4.5-7-9.3V5.8z" />
    <path d="m9 11.6 2.1 2.1 4-4.2" />
  </Svg>
);

export const IcEye: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.6 12 5.6 21.5 12 21.5 12 18 18.4 12 18.4 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  </Svg>
);

export const IcEyeOff: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 4l16 16" />
    <path d="M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.9 3.2" />
    <path d="M6.6 6.7C4.2 8.3 2.5 12 2.5 12s3.5 6.1 9.5 6.1c1 0 1.9-.2 2.8-.4" />
  </Svg>
);

export const IcSearch: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 5 5" />
  </Svg>
);

export const IcClock: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IcZap: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />
  </Svg>
);

export const IcPlus: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IcX: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IcCheck: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const IcRefresh: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-2.4 6.1" />
    <path d="M20 5v6h-6" />
  </Svg>
);

export const IcMega: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 10.5v3L7 14.5v-5L3 10.5Z" />
    <path d="M7 9.5 19 5v14l-12-4.5" />
    <path d="M9.5 15.5 11 20.5" />
  </Svg>
);

export const IcTrophy: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M8 4h8v5.5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 5H4.5A3.5 3.5 0 0 0 8 12M16 5h3.5A3.5 3.5 0 0 1 16 12" />
    <path d="M12 13.5V17" />
    <path d="M8.5 20.5h7" />
    <path d="M9.5 17h5" />
  </Svg>
);

export const IcCrown: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 8.5 6.8 11l5.2-6 5.2 6L21 8.5 19.5 17h-15L3 8.5Z" />
    <path d="M5 20.5h14" />
  </Svg>
);

export const IcBack: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Svg>
);

export const IcGlobe: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c3.2 3.6 3.2 13.4 0 17" />
    <path d="M12 3.5c-3.2 3.6-3.2 13.4 0 17" />
  </Svg>
);

export const IcLogout: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M14 4H6v16h8" />
    <path d="M10 12h11" />
    <path d="m18 8 4 4-4 4" />
  </Svg>
);

export const IcLang: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 5.5h9" />
    <path d="M8.5 3.5v1.8c0 3.8-2.4 6.8-5 8.4" />
    <path d="M5.5 9.5c1.4 2.3 3.8 4.1 6.5 4.7" />
    <path d="m11.5 20.5 4.5-10 4.5 10.5" />
    <path d="M13.6 17h6.8" />
  </Svg>
);

export const IcSpark: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 3l1.7 5.4 5.4 1.7-5.4 1.7L12 17.2l-1.7-5.4L4.9 10l5.4-1.9L12 3Z" />
    <path d="M18.5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
  </Svg>
);

export const IcTag: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.8 0L3.5 14.3V3.5h10.8l6.3 6.3a2 2 0 0 1 0 2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.3" />
  </Svg>
);

export const IcAlert: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
    <path d="M12 9.5V14" />
    <path d="M12 16.8v.2" />
  </Svg>
);

export const IcSend: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M21.5 2.5 11 13" />
    <path d="M21.5 2.5 15 21.5l-4-8.5-8.5-4L21.5 2.5Z" />
  </Svg>
);

export const IcTrendUp: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="m3 17 6-6 4 4 7-7" />
    <path d="M15 8h5v5" />
  </Svg>
);

export const IcTrendDown: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="m3 7 6 6 4-4 7 7" />
    <path d="M15 16h5v-5" />
  </Svg>
);

export const IcGem: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M6.5 3h11L21.5 9 12 21 2.5 9 6.5 3Z" />
    <path d="M2.5 9h19" />
    <path d="M9 9l3 12 3-12" />
  </Svg>
);

export const IcBan: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m6 6 12 12" />
  </Svg>
);

export const IcPlay: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12-7.5-12-7.5Z" />
  </Svg>
);

export const IcStop: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Svg>
);

export const IcKey: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="M11.2 11.8 20 3" />
    <path d="M16 7l2.5 2.5" />
    <path d="M13.5 10.3l2 2" />
  </Svg>
);

export const IcSliders: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9" />
    <circle cx="15" cy="7.5" r="2.2" />
    <circle cx="9" cy="16.5" r="2.2" />
  </Svg>
);

export const IcInfo: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <path d="M12 7.8v.2" />
  </Svg>
);

export const IcPulse: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 12h4l2.5-6 4 12L16 12h5" />
  </Svg>
);

export const IcCoins: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  </Svg>
);

export const IcMinusCircle: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 12h8" />
  </Svg>
);

export const IcPin: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M9 4h6l-1 7 3 3v2H7v-2l3-3z" />
    <path d="M12 16v5" />
  </Svg>
);

/** موزّع: اسم نصي ← مكوّن. يخلي التبويبات والعناوين سطراً واحداً. */
const MAP = {
  home: IcHome,
  users: IcUsers,
  flame: IcFlame,
  gift: IcGift,
  swords: IcSwords,
  medal: IcMedal,
  log: IcLog,
  lock: IcLock,
  shield: IcShield,
  eye: IcEye,
  eyeOff: IcEyeOff,
  search: IcSearch,
  clock: IcClock,
  zap: IcZap,
  plus: IcPlus,
  x: IcX,
  check: IcCheck,
  refresh: IcRefresh,
  mega: IcMega,
  trophy: IcTrophy,
  crown: IcCrown,
  back: IcBack,
  globe: IcGlobe,
  logout: IcLogout,
  lang: IcLang,
  spark: IcSpark,
  tag: IcTag,
  alert: IcAlert,
  send: IcSend,
  trendUp: IcTrendUp,
  trendDown: IcTrendDown,
  gem: IcGem,
  ban: IcBan,
  play: IcPlay,
  stop: IcStop,
  key: IcKey,
  sliders: IcSliders,
  info: IcInfo,
  pulse: IcPulse,
  coins: IcCoins,
  none: IcMinusCircle,
  pin: IcPin,
} as const;

export type IconName = keyof typeof MAP;

export const Ic: React.FC<{ n: IconName; size?: number; className?: string; style?: React.CSSProperties }> = ({
  n,
  size,
  className,
  style,
}) => {
  const C = MAP[n];
  return <C size={size} className={className} style={style} />;
};
