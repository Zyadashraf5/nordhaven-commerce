import type { ReactElement, SVGProps } from 'react';

/**
 * The icon set used by the approved boards. Every path is copied from the
 * design artifact so the storefront matches the reference exactly.
 */
export type IconName =
  | 'search'
  | 'user'
  | 'heart'
  | 'bag'
  | 'menu'
  | 'chevron-down'
  | 'arrow-right'
  | 'close'
  | 'check'
  | 'half'
  | 'cross'
  | 'clock'
  | 'package'
  | 'grid'
  | 'coin'
  | 'spinner'
  | 'funnel'
  | 'sliders'
  | 'sort-arrows'
  | 'grid-3'
  | 'grid-4'
  | 'star'
  | 'minus'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right'
  | 'info'
  | 'alert'
  | 'done'
  | 'shop'
  | 'house'
  | 'orders'
  | 'returns'
  | 'reviews'
  | 'bell'
  | 'pin'
  | 'lock'
  | 'sign-out'
  | 'trash'
  | 'users'
  | 'shield'
  | 'truck'
  | 'chart'
  | 'document'
  | 'settings'
  | 'cpu';

const paths: Record<IconName, ReactElement> = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  bag: (
    <>
      <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M2.5 7.5l3 3 6-7" />,
  half: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" />
    </>
  ),
  cross: <path d="M3 3l8 8M11 3l-8 8" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </>
  ),
  package: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="8" y="13" width="8" height="8" rx="1" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 10h6M9 14h6M12 7v10" />
    </>
  ),
  spinner: <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />,
  funnel: <path d="M3.5 5h17l-6.5 8v6l-4 2v-8z" />,
  sliders: <path d="M4 6h16M7 12h10M10 18h4" />,
  'sort-arrows': <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />,
  'grid-3': (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="9.5" y="4" width="5" height="16" rx="1" />
      <rect x="16" y="4" width="5" height="16" rx="1" />
    </>
  ),
  'grid-4': (
    <>
      <rect x="2" y="4" width="4" height="16" rx="1" />
      <rect x="7.3" y="4" width="4" height="16" rx="1" />
      <rect x="12.6" y="4" width="4" height="16" rx="1" />
      <rect x="18" y="4" width="4" height="16" rx="1" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.2 5.9-.9z" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.8v.4" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V13M12 16.2v.4" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </>
  ),
  shop: <path d="M4 9l1.2-4h13.6L20 9M5 9v10.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V9M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M9.5 20v-5h5v5" />,
  /* Stage 3 account-section icons (board sidebar paths). */
  house: <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  orders: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </>
  ),
  returns: (
    <>
      <path d="M9 6L5 10l4 4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M5 10h10a4.5 4.5 0 0 1 0 9h-3" strokeLinecap="round" />
    </>
  ),
  reviews: (
    <>
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M8 9.5h8M8 12.5h5" strokeLinecap="round" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M10 20.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="6" y="10.5" width="13" height="9.5" rx="1" strokeLinejoin="round" strokeLinecap="round" transform="translate(-0.5 0)" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
    </>
  ),
  'sign-out': (
    <>
      <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h9" strokeLinejoin="round" strokeLinecap="round" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" strokeLinecap="round" />
      <path d="M10 7V5h4v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 7l1 12h8l1-12" strokeLinejoin="round" />
    </>
  ),
  /* Stage 5 admin icons. */
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </>
  ),
  truck: (
    <>
      <path d="M5 18.5l1.5-17H2.8l-1.5 1.5C2 4.1 4.9 3 9 3h11c4 0 7 1 7 4.5l1.5 11.5L20.4 19H5.6z" />
      <path d="M5 15v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3z" strokeLinecap="round" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V6M17 16v-8" />
    </>
  ),
  document: (
    <>
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  cpu: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01" />
    </>
  ),
};

const viewBoxes: Partial<Record<IconName, string>> = {
  check: '0 0 14 14',
  cross: '0 0 14 14',
  half: '0 0 16 16',
  clock: '0 0 16 16',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Stroke colour. Defaults to `currentColor`. */
  stroke?: string;
  /** Fill colour. Defaults to `none`; the heart uses it for the saved state. */
  fill?: string;
  strokeWidth?: number;
}

/** Icons that point along the reading direction and must mirror in RTL. */
const directional: ReadonlySet<IconName> = new Set<IconName>([
  'arrow-right',
  'chevron-left',
  'chevron-right',
]);

export function Icon({
  name,
  size = 20,
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 1.8,
  ...rest
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={viewBoxes[name] ?? '0 0 24 24'}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      focusable="false"
      data-directional={directional.has(name) ? '' : undefined}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
