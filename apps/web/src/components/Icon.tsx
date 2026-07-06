import React from 'react';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

// Icon set — single source of truth, stroked (ported verbatim from the design)
export function Icon({
  name,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.7,
  style,
}: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style,
  };
  switch (name) {
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...props}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'home':
      return (
        <svg {...props}>
          <path d="m3 11 9-8 9 8v9a2 2 0 0 1-2 2h-3v-7H10v7H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case 'cal':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case 'star':
      return (
        <svg {...props}>
          <path d="m12 3 2.6 5.6 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 2.8 1.4-6.3L3 9.2l6.4-.6z" />
        </svg>
      );
    case 'star-fill':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
          <path d="m12 3 2.6 5.6 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 2.8 1.4-6.3L3 9.2l6.4-.6z" />
        </svg>
      );
    case 'cog':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case 'back':
      return (
        <svg {...props}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case 'close':
      return (
        <svg {...props}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
    case 'more':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      );
    case 'sim':
      return (
        <svg {...props}>
          <path d="M3 17 9 11l4 4 8-8" />
          <path d="M21 7v6M21 7h-6" />
        </svg>
      );
    case 'arrow-up':
      return (
        <svg {...props}>
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      );
    case 'arrow-dn':
      return (
        <svg {...props}>
          <path d="M7 7l10 10M9 17h8V9" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'check':
      return (
        <svg {...props}>
          <path d="m5 12 5 5L20 7" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case 'doc':
      return (
        <svg {...props}>
          <path d="M14 3v5a1 1 0 0 0 1 1h5" />
          <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    case 'flag':
      return (
        <svg {...props}>
          <path d="M4 21V4M4 4h13l-2 4 2 4H4" />
        </svg>
      );
    case 'news':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h10M7 17h6" />
        </svg>
      );
    case 'info':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.01M11 12h1v5h1" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...props}>
          <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...props}>
          <path d="M3 7c0-2 1-3 3-3h14v4" />
          <path d="M3 7v11c0 2 1 3 3 3h15V7H6c-2 0-3 1-3 3z" />
          <circle cx="17" cy="14" r="1.5" fill={color} />
        </svg>
      );
    case 'globe':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'landmark':
      return (
        <svg {...props}>
          <path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M3 10h18L12 3z" />
        </svg>
      );
    case 'crown':
      return (
        <svg {...props}>
          <path d="M3 18h18M4 18l-1.5-9 5 4L12 5l4.5 8 5-4L20 18" />
        </svg>
      );
    case 'users':
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.5a3 3 0 0 1 0 5.6M21 20a5 5 0 0 0-3.5-4.8" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...props}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case 'leverage':
      return (
        <svg {...props}>
          <path d="M3 12h7M14 12h7M10 8l4 4-4 4M14 16l-4-4 4-4" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case 'arrow-ne':
      return (
        <svg {...props}>
          <path d="M7 17 17 7M8 7h9v9" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...props}>
          <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-.8 12.2A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.8L6 7" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...props}>
          <path d="M4 8h3l2-2h6l2 2h3v12H4z" />
          <circle cx="12" cy="14" r="3.4" />
        </svg>
      );
    case 'wand':
      return (
        <svg {...props}>
          <path d="m5 19 12-12M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM5 13l.7 1.3L7 15l-1.3.7L5 17l-.7-1.3L3 15l1.3-.7z" />
        </svg>
      );
    case 'faceid':
      return (
        <svg {...props}>
          <path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
          <circle cx="9" cy="11" r="1" fill={color} stroke="none" />
          <circle cx="15" cy="11" r="1" fill={color} stroke="none" />
          <path d="M9 15c1 .8 5 .8 6 0" />
        </svg>
      );
    case 'c-area':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={style}
        >
          <path d="M3 16l4-5 4 2.5 4-6 6 5.5v3H3z" fill={color} fillOpacity="0.16" stroke="none" />
          <path d="M3 16l4-5 4 2.5 4-6 6 5.5" />
        </svg>
      );
    case 'c-candle':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={style}
        >
          <path d="M7.5 3v3.5M7.5 15v5M16.5 5v3M16.5 16v3" />
          <rect x="5" y="6.5" width="5" height="8.5" rx="1" fill={color} fillOpacity="0.16" />
          <rect x="14" y="8" width="5" height="8" rx="1" fill={color} fillOpacity="0.16" />
        </svg>
      );
    case 'c-line':
      return (
        <svg {...props}>
          <path d="M3 17l5-6 4 3 8-9" />
        </svg>
      );
    case 'bolt':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={color}
          stroke="none"
          style={style}
        >
          <path d="M13 2 4 14h6l-1 8 10-13h-6z" />
        </svg>
      );
    case 'target':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.6" fill={color} />
        </svg>
      );
    default:
      return <svg {...props}></svg>;
  }
}
