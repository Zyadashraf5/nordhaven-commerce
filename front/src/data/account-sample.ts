/**
 * Sample-data previews for the account section (Stage 3 boards).
 *
 * The My account / Auth boards ship with a demo identity (Mariam Adel) and two
 * saved addresses. Everything here reproduces those numbers exactly. Nothing
 * is connected to a real account — the backend auth/customer contracts arrive
 * with a later stage, so these records are clearly labelled sample data.
 */

import type { StoreImage } from './types';

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export interface DemoProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export const demoProfile: DemoProfile = {
  firstName: 'Mariam',
  lastName: 'Adel',
  email: 'mariam.adel@example.com',
  phone: '100 000 0000',
};

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

/** Arabic variants for `?lang=ar`, mirroring the same two addresses. */
export interface DemoAddressArabic {
  label: string;
  street: string;
  building: string;
  city: string;
  governorate: string;
  notes: string;
}

export interface DemoAddress {
  id: string;
  label: string;
  name: string;
  /** Ten digits after the +20 country code, as the boards show it. */
  phone: string;
  city: string;
  governorate: string;
  street: string;
  building: string;
  postal: string;
  notes: string;
  isDefault: boolean;
  ar?: DemoAddressArabic;
}

export const demoAddresses: DemoAddress[] = [
  {
    id: 'home',
    label: 'Home',
    name: 'Mariam Adel',
    phone: '100 000 0000',
    city: 'Zamalek',
    governorate: 'Cairo',
    street: '14 Example Street',
    building: 'Apartment 6',
    postal: '11211',
    notes: '',
    isDefault: true,
    ar: {
      label: 'المنزل',
      street: '14 شارع المثال',
      building: 'شقة 6',
      city: 'الزمالك',
      governorate: 'القاهرة',
      notes: '',
    },
  },
  {
    id: 'office',
    label: 'Office',
    name: 'Mariam Adel',
    phone: '100 000 0000',
    city: 'Smouha',
    governorate: 'Alexandria',
    street: '22 Sample Road',
    building: 'Floor 3',
    postal: '21615',
    notes: 'Reception is on the ground floor',
    isDefault: false,
    ar: {
      label: 'المكتب',
      street: '22 طريق العينة',
      building: 'الطابق 3',
      city: 'سموحة',
      governorate: 'الإسكندرية',
      notes: 'الاستقبال في الطابق الأرضي',
    },
  },
];

/** The governorate list the address form offers (English + Arabic names). */
export const governorates: ReadonlyArray<{ en: string; ar: string }> = [
  { en: 'Cairo', ar: 'القاهرة' },
  { en: 'Giza', ar: 'الجيزة' },
  { en: 'Alexandria', ar: 'الإسكندرية' },
  { en: 'Qalyubia', ar: 'القليوبية' },
  { en: 'Sharqia', ar: 'الشرقية' },
  { en: 'Dakahlia', ar: 'الدقهلية' },
  { en: 'Gharbia', ar: 'الغربية' },
  { en: 'Monufia', ar: 'المنوفية' },
  { en: 'Beheira', ar: 'البحيرة' },
  { en: 'Kafr El Sheikh', ar: 'كفر الشيخ' },
  { en: 'Damietta', ar: 'دمياط' },
  { en: 'Port Said', ar: 'بورسعيد' },
  { en: 'Ismailia', ar: 'الإسماعيلية' },
  { en: 'Suez', ar: 'السويس' },
  { en: 'Faiyum', ar: 'الفيوم' },
  { en: 'Beni Suef', ar: 'بني سويف' },
  { en: 'Minya', ar: 'المنيا' },
  { en: 'Asyut', ar: 'أسيوط' },
  { en: 'Sohag', ar: 'سوهاج' },
  { en: 'Qena', ar: 'قنا' },
  { en: 'Luxor', ar: 'الأقصر' },
  { en: 'Aswan', ar: 'أسوان' },
  { en: 'Red Sea', ar: 'البحر الأحمر' },
  { en: 'New Valley', ar: 'الوادي الجديد' },
  { en: 'Matrouh', ar: 'مطروح' },
  { en: 'North Sinai', ar: 'شمال سيناء' },
  { en: 'South Sinai', ar: 'جنوب سيناء' },
];

/* ------------------------------------------------------------------ *
 * Overview snapshots (boards 1440 + 390)
 * ------------------------------------------------------------------ */

function image(src: string, alt: string, width: number, height: number): StoreImage {
  return { src: `/images/${src}`, alt, width, height };
}

export const accountImages = {
  casserole: image(
    'cookware-casserole.webp',
    'Enamelled Cast-Iron Casserole, Terracotta',
    720,
    900,
  ),
  board: image('kitchen-tools-board.webp', 'Olive Wood Serving Board, Large', 720, 900),
  kettle: image('kettle-pourover.webp', 'Pour-Over Kettle, 1 L, brushed steel', 720, 900),
} as const;

export const latestOrderSample = {
  number: 'HC-260418-0012',
  placed: 'Placed 18 Apr 2026',
  items: 2,
  itemsLabel: 'Enamelled Cast-Iron Casserole and Olive Wood Serving Board',
  status: 'Shipped',
  images: [accountImages.casserole, accountImages.board],
} as const;

export const preOrderSample = {
  name: 'Pour-Over Kettle, 1 L',
  variant: 'Brushed steel',
  priceEgp: 2390,
  status: 'Awaiting restock',
  note: 'No payment is taken until your item is in stock and ready to ship. We’ll let you know when it’s ready.',
  images: [accountImages.kettle],
} as const;

export const notificationsSample = {
  unread: 3,
  latest: 'Your order HC-260418-0012 has shipped',
  latestDate: '19 Apr 2026',
} as const;

/* ------------------------------------------------------------------ *
 * Signed-in devices (Password & security)
 * ------------------------------------------------------------------ */

export type DemoDeviceKind = 'phone' | 'laptop';

export interface DemoDevice {
  id: string;
  name: string;
  meta: string;
  isCurrent: boolean;
  kind: DemoDeviceKind;
}

export const demoDevices: DemoDevice[] = [
  { id: 'this', name: 'Chrome on macOS', meta: 'Active now', isCurrent: true, kind: 'laptop' },
  {
    id: 'phone',
    name: 'Safari on iPhone',
    meta: 'Last active 16 Apr 2026',
    isCurrent: false,
    kind: 'phone',
  },
];
