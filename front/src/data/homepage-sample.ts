import { egp } from './money';
import { placeholderHref, routes } from '../lib/links';
import type {
  HomepageData,
  StoreImage,
  StorefrontBundle,
  StorefrontCategory,
  StorefrontProduct,
} from './types';

/**
 * SAMPLE STOREFRONT DATA — NOT LIVE API DATA.
 *
 * Every value below is transcribed from the approved Stage 1 boards of the
 * Claude design artifact (`ui/Nordhaven Commerce — Storefront Design.html`).
 * The prices are illustrative and quoted in EGP, exactly as the boards show.
 * The backend is not connected yet: see `src/lib/api/` for the client that
 * will replace this module, and `src/lib/storefront.ts` for the single seam
 * the homepage reads through.
 */

function image(src: string, alt: string, width: number, height: number): StoreImage {
  return { src: `/images/${src}`, alt, width, height };
}

const images = {
  casserole: image(
    'cookware-casserole.webp',
    'Enamelled cast-iron casserole in terracotta',
    720,
    900,
  ),
  plates: image(
    'tableware-plates.webp',
    'Stack of four oat stoneware plates with a bowl',
    720,
    900,
  ),
  board: image('kitchen-tools-board.webp', 'Olive wood serving board with handle', 720, 900),
  mugs: image('mugs-stoneware.webp', 'Two stoneware mugs in sage and cream', 720, 900),
  grinder: image('coffee-and-tea.webp', 'Brushed steel hand coffee grinder', 720, 900),
  server: image('coffee-server.webp', 'Glass coffee server with coffee', 720, 900),
  kettle: image('kettle-pourover.webp', 'Brushed steel gooseneck pour-over kettle', 720, 900),
  jars: image('storage-jars.webp', 'Three glass storage jars with bamboo lids', 720, 900),
  towels: image('textiles-towels.webp', 'Linen tea towels in oat, terracotta and sage', 720, 900),
  bakeware: image('bakeware.webp', 'Cream stoneware baking dish', 720, 900),
  hero: image(
    'hero-kitchen.webp',
    'Terracotta enamelled casserole on a stone counter beside stoneware plates, a linen towel, a sage mug and an olive wood board',
    1350,
    1080,
  ),
  collection: image(
    'collection-slow-sunday.webp',
    'A linen-covered table set with stoneware plates, mugs of coffee, a glass server, an olive wood board and a sage casserole',
    1350,
    900,
  ),
  firstKitchenSet: image(
    'bundle-first-kitchen-set.webp',
    'The First Kitchen Set: terracotta casserole, olive wood board and linen tea towels packed in a kraft box',
    1080,
    810,
  ),
  morningCoffeeSet: image(
    'bundle-morning-coffee-set.webp',
    'Morning Coffee Set: steel hand grinder, glass coffee server and two stoneware mugs',
    1080,
    810,
  ),
} as const;

const brand = { id: 'brand-nordhaven', name: 'Nordhaven', slug: 'nordhaven' };

const categories: StorefrontCategory[] = [
  {
    id: 'cat-cookware',
    name: 'Cookware',
    slug: 'cookware',
    image: images.casserole,
    tone: 'warm',
  },
  {
    id: 'cat-tableware',
    name: 'Tableware',
    slug: 'tableware',
    image: images.plates,
    tone: 'warm',
  },
  {
    id: 'cat-bakeware',
    name: 'Bakeware',
    slug: 'bakeware',
    image: images.bakeware,
    tone: 'warm',
  },
  {
    id: 'cat-kitchen-tools',
    name: 'Kitchen tools',
    slug: 'kitchen-tools',
    image: images.board,
    tone: 'warm',
  },
  {
    id: 'cat-storage',
    name: 'Storage',
    slug: 'storage',
    image: images.jars,
    tone: 'warm',
  },
  {
    id: 'cat-textiles',
    name: 'Textiles',
    slug: 'textiles',
    image: images.towels,
    tone: 'warm',
  },
  {
    id: 'cat-coffee-tea',
    name: 'Coffee & tea',
    slug: 'coffee-and-tea',
    image: images.grinder,
    tone: 'cool',
  },
];

const products: StorefrontProduct[] = [
  {
    id: 'prod-casserole',
    slug: 'enamelled-cast-iron-casserole',
    name: 'Enamelled Cast-Iron Casserole',
    summary: '2 sizes · 3 colours',
    category: { id: 'cat-cookware', name: 'Cookware', slug: 'cookware' },
    brand,
    image: images.casserole,
    options: [
      {
        attribute: 'colour',
        label: 'Colour',
        values: [
          {
            id: 'terracotta',
            label: 'Terracotta',
            inStock: true,
            swatchHex: '#9A4B33',
            image: images.casserole,
            sku: 'HC-CI-CAS-24-TER',
            availableSizes: ['24', '28'],
          },
          {
            id: 'sage',
            label: 'Sage',
            inStock: true,
            swatchHex: '#66745F',
            sku: 'HC-CI-CAS-24-SAG',
            availableSizes: ['24'],
          },
          {
            id: 'cream',
            label: 'Cream',
            inStock: false,
            swatchHex: '#E3DACA',
            sku: 'HC-CI-CAS-24-CRE',
            availableSizes: [],
          },
        ],
      },
      {
        attribute: 'size',
        label: 'Size',
        values: [
          {
            id: '24',
            label: '24 cm · 4.2 L',
            inStock: true,
            price: egp(4850),
            previousPrice: egp(5700),
          },
          {
            id: '28',
            label: '28 cm · 6.7 L',
            inStock: true,
            price: egp(5950),
            previousPrice: egp(7000),
          },
        ],
      },
    ],
    price: egp(4850),
    previousPrice: egp(5700),
    discountBadge: '−15%',
    availability: 'partial',
    availabilityText: 'Terracotta: 24 cm in stock, 28 cm out',
    availabilityShort: 'Terracotta · 24 cm only',
    listings: ['featured', 'on_offer'],
  },
  {
    id: 'prod-board',
    slug: 'olive-wood-serving-board',
    name: 'Olive Wood Serving Board',
    summary: 'Large · 45 × 22 cm',
    category: { id: 'cat-kitchen-tools', name: 'Kitchen tools', slug: 'kitchen-tools' },
    brand,
    image: images.board,
    options: [],
    price: egp(1250),
    availability: 'in_stock',
    availabilityText: 'In stock',
    availabilityShort: 'In stock',
    variantNote: 'One size',
    listings: ['featured'],
  },
  {
    id: 'prod-mug',
    slug: 'stoneware-mug-350ml',
    name: 'Stoneware Mug, 350 ml',
    summary: 'Speckled glaze · 2 colours',
    category: { id: 'cat-tableware', name: 'Tableware', slug: 'tableware' },
    brand,
    image: images.mugs,
    options: [
      {
        attribute: 'colour',
        label: 'Colour',
        values: [
          {
            id: 'sage',
            label: 'Sage',
            inStock: true,
            swatchHex: '#8E9A86',
            image: images.mugs,
          },
          {
            id: 'cream',
            label: 'Cream',
            inStock: false,
            swatchHex: '#E8E1D3',
          },
        ],
      },
    ],
    price: egp(380),
    availability: 'in_stock',
    availabilityText: 'In stock in Sage',
    availabilityShort: 'Sage · in stock',
    listings: ['featured'],
  },
  {
    id: 'prod-plates',
    slug: 'stoneware-dinner-plates-set-of-4',
    name: 'Stoneware Dinner Plates, Set of 4',
    nameShort: 'Stoneware Plates, Set of 4',
    summary: '27 cm · Oat glaze',
    category: { id: 'cat-tableware', name: 'Tableware', slug: 'tableware' },
    brand,
    image: images.plates,
    options: [],
    price: egp(1680),
    availability: 'in_stock',
    availabilityText: 'In stock',
    availabilityShort: 'In stock',
    variantNote: 'Oat glaze',
    listings: ['featured'],
  },
  {
    id: 'prod-grinder',
    slug: 'steel-hand-coffee-grinder',
    name: 'Steel Hand Coffee Grinder',
    summary: 'Ceramic burr · walnut knob',
    category: { id: 'cat-coffee-tea', name: 'Coffee & tea', slug: 'coffee-and-tea' },
    brand,
    image: images.grinder,
    options: [],
    price: egp(1450),
    availability: 'in_stock',
    availabilityText: 'In stock',
    availabilityShort: 'In stock',
    variantNote: 'Brushed steel',
    listings: ['new_in'],
  },
  {
    id: 'prod-server',
    slug: 'glass-coffee-server-600ml',
    name: 'Glass Coffee Server, 600 ml',
    summary: 'Borosilicate glass',
    category: { id: 'cat-coffee-tea', name: 'Coffee & tea', slug: 'coffee-and-tea' },
    brand,
    image: images.server,
    options: [],
    price: egp(720),
    availability: 'in_stock',
    availabilityText: 'In stock',
    availabilityShort: 'In stock',
    variantNote: 'One size',
    listings: ['new_in'],
  },
  {
    id: 'prod-kettle',
    slug: 'pour-over-kettle-1l',
    name: 'Pour-Over Kettle, 1 L',
    summary: 'Brushed steel · gooseneck spout',
    category: { id: 'cat-coffee-tea', name: 'Coffee & tea', slug: 'coffee-and-tea' },
    brand,
    image: images.kettle,
    options: [],
    price: egp(2390),
    availability: 'preorder',
    availabilityText: 'Pre-order · charged only when in stock',
    availabilityShort: 'Pre-order · charged when in stock',
    variantNote: 'Brushed steel',
    preOrder: true,
    listings: ['new_in'],
  },
  {
    id: 'prod-jars',
    slug: 'glass-storage-jars-set-of-3',
    name: 'Glass Storage Jars, Set of 3',
    summary: '0.5 · 0.8 · 1.2 L · bamboo lids',
    category: { id: 'cat-storage', name: 'Storage', slug: 'storage' },
    brand,
    image: images.jars,
    options: [],
    price: egp(980),
    availability: 'out_of_stock',
    availabilityText: 'Out of stock',
    availabilityShort: 'Out of stock',
    variantNote: 'Set of 3',
    listings: ['new_in'],
  },
];

/**
 * The two bundle kinds model different inventory, so they carry different rules:
 *
 * - The First Kitchen Set is a FIXED bundle: a finished-goods SKU packed in
 *   advance with its own stock. One availability status covers the whole set.
 * - The Morning Coffee Set is a DYNAMIC bundle: a fixed list of components
 *   whose availability is derived from the stock of each component SKU.
 */
const bundles: StorefrontBundle[] = [
  {
    id: 'bundle-first-kitchen',
    slug: 'the-first-kitchen-set',
    kind: 'fixed',
    name: 'The First Kitchen Set',
    price: egp(6200),
    image: images.firstKitchenSet,
    components: [
      { name: 'Enamelled Cast-Iron Casserole, 24 cm · Terracotta', quantity: 1, inStock: true },
      { name: 'Olive Wood Serving Board, Large', quantity: 1, inStock: true },
      { name: 'Linen Tea Towels · Oat, Terracotta, Sage', quantity: 3, inStock: true },
    ],
    inStock: true,
    inventoryNote: 'Has its own stock. Contents are fixed.',
    summary: 'Casserole 24 cm (Terracotta) · Olive wood board · Linen tea towels × 3',
    statusNote: ' · own stock',
    available: true,
  },
  {
    id: 'bundle-morning-coffee',
    slug: 'morning-coffee-set',
    kind: 'dynamic',
    name: 'Morning Coffee Set',
    price: egp(2850),
    image: images.morningCoffeeSet,
    components: [
      {
        name: 'Steel Hand Coffee Grinder',
        nameShort: 'Hand coffee grinder',
        quantity: 1,
        inStock: true,
        image: images.grinder,
      },
      {
        name: 'Glass Coffee Server, 600 ml',
        nameShort: 'Glass server, 600 ml',
        quantity: 1,
        inStock: true,
        image: images.server,
      },
      {
        name: 'Stoneware Mug, Sage × 2',
        nameShort: 'Stoneware mug, Sage × 2',
        quantity: 2,
        inStock: true,
        image: images.mugs,
      },
    ],
    inventoryNote: 'Available only while every item is in stock.',
    summary: 'Hand coffee grinder · Glass server, 600 ml · Stoneware mug, Sage × 2',
    statusNote: '',
    available: true,
  },
];

export const homepageSample: HomepageData = {
  announcement: {
    message: 'All prices are shown in Egyptian pounds (EGP)',
    messageShort: 'All prices in Egyptian pounds (EGP)',
    links: [{ label: 'Help', href: placeholderHref('Help') }],
    currency: 'EGP',
    language: 'English',
  },
  navigation: {
    primary: [
      { label: 'Cookware', href: routes.category('cookware') },
      { label: 'Bakeware', href: routes.category('bakeware') },
      { label: 'Tableware', href: routes.category('tableware') },
      { label: 'Kitchen tools', href: routes.category('kitchen-tools') },
      { label: 'Storage', href: routes.category('storage') },
      { label: 'Textiles', href: routes.category('textiles') },
      {
        label: 'Sets & bundles',
        href: routes.category('sets-and-bundles'),
        emphasis: true,
        tone: 'offer',
        dividerBefore: true,
      },
      { label: 'New in', href: routes.newIn, emphasis: true },
      { label: 'Offers', href: routes.offers, emphasis: true },
    ],
    mobileChips: [
      { label: 'All', href: routes.products },
      { label: 'Cookware', href: routes.category('cookware') },
      { label: 'Tableware', href: routes.category('tableware') },
      { label: 'Sets & bundles', href: routes.category('sets-and-bundles'), tone: 'offer' },
      { label: 'Bakeware', href: routes.category('bakeware') },
      { label: 'New in', href: routes.newIn },
    ],
    megaMenu: [
      {
        groups: [
          {
            heading: 'Cookware',
            links: [
              {
                label: 'Casseroles & Dutch ovens',
                href: routes.category('cookware'),
              },
              { label: 'Frying pans', href: routes.category('cookware') },
              { label: 'Saucepans', href: routes.category('cookware') },
              { label: 'Stockpots', href: routes.category('cookware') },
            ],
          },
          {
            heading: 'Bakeware',
            links: [
              { label: 'Baking dishes', href: routes.category('bakeware') },
              { label: 'Tins & trays', href: routes.category('bakeware') },
            ],
          },
        ],
      },
      {
        groups: [
          {
            heading: 'Tableware',
            links: [
              { label: 'Plates', href: routes.category('tableware') },
              { label: 'Bowls', href: routes.category('tableware') },
              { label: 'Mugs & cups', href: routes.category('tableware') },
              { label: 'Serveware', href: routes.category('tableware') },
            ],
          },
        ],
      },
      {
        groups: [
          {
            heading: 'Kitchen tools',
            links: [
              { label: 'Boards', href: routes.category('kitchen-tools') },
              { label: 'Utensils', href: routes.category('kitchen-tools') },
              { label: 'Coffee & tea', href: routes.category('coffee-and-tea') },
            ],
          },
          {
            heading: 'Storage',
            links: [{ label: 'Jars & canisters', href: routes.category('storage') }],
          },
        ],
      },
      {
        groups: [
          {
            heading: 'Textiles',
            links: [
              { label: 'Tea towels', href: routes.category('textiles') },
              { label: 'Table linen', href: routes.category('textiles') },
            ],
          },
          { heading: 'Cleaning & care', links: [] },
          {
            heading: 'Shop all products',
            links: [
              {
                label: 'Shop all products',
                href: routes.products,
                tone: 'offer',
              },
            ],
          },
        ],
      },
    ],
    megaMenuFeature: {
      href: routes.category('sets-and-bundles'),
      image: images.firstKitchenSet,
      title: 'Sets, ready to start with →',
    },
  },
  categories,
  hero: {
    eyebrow: 'Cookware · Tableware · Home essentials',
    title: 'Make room for',
    titleEmphasis: 'everyday rituals',
    body: 'Enamelled cast iron, stoneware, olive wood and linen — chosen for daily use, with every price shown clearly in Egyptian pounds.',
    bodyShort: 'Cookware, tableware and home essentials, priced clearly in EGP.',
    image: images.hero,
    hotspots: [
      {
        id: 'casserole',
        x: 47,
        y: 66,
        name: 'Enamelled Casserole · Terracotta',
        price: egp(4850),
        previousPrice: egp(5700),
        image: images.casserole,
        productSlug: 'enamelled-cast-iron-casserole',
      },
      {
        id: 'mug',
        x: 80,
        y: 70,
        name: 'Stoneware Mug · Sage',
        price: egp(380),
        image: images.mugs,
        productSlug: 'stoneware-mug-350ml',
      },
      {
        id: 'board',
        x: 78,
        y: 38,
        name: 'Olive Wood Serving Board',
        price: egp(1250),
        image: images.board,
        productSlug: 'olive-wood-serving-board',
      },
      {
        id: 'plates',
        x: 15,
        y: 50,
        name: 'Stoneware Plates, Set of 4',
        price: egp(1680),
        image: images.plates,
        productSlug: 'stoneware-dinner-plates-set-of-4',
      },
    ],
    mobileChip: {
      name: 'Enamelled Casserole',
      price: egp(4850),
      previousPrice: egp(5700),
      image: images.casserole,
    },
  },
  products,
  bundleSection: {
    title: 'Sets & bundles',
    subtitle: 'Two kinds of set, labelled so you always know how it ships and why it’s available.',
    subtitleShort: 'Labelled so you know how each set ships and why it’s available.',
  },
  bundles,
  collection: {
    id: 'collection-slow-sunday',
    eyebrow: 'Collection',
    title: 'The',
    titleEmphasis: 'slow Sunday',
    titleSuffix: ' table',
    body: 'Stoneware, olive wood and glass for long breakfasts. Every piece is sold on its own.',
    bodyShort: 'Stoneware, olive wood and glass for long breakfasts. Sold individually.',
    image: images.collection,
    items: [
      {
        id: 'prod-plates',
        name: 'Stoneware Dinner Plates, Set of 4',
        href: routes.product('stoneware-dinner-plates-set-of-4'),
        image: images.plates,
        price: egp(1680),
      },
      {
        id: 'prod-server',
        name: 'Glass Coffee Server, 600 ml',
        href: routes.product('glass-coffee-server-600ml'),
        image: images.server,
        price: egp(720),
      },
      {
        id: 'prod-board',
        name: 'Olive Wood Serving Board, Large',
        href: routes.product('olive-wood-serving-board'),
        image: images.board,
        price: egp(1250),
      },
    ],
  },
  trustPoints: [
    {
      icon: 'price',
      title: 'Clear prices in EGP',
      body: 'Rechecked at checkout. Any change is shown before you pay.',
      bodyShort: 'Rechecked at checkout; changes shown before you pay.',
    },
    {
      icon: 'wishlist',
      title: 'Saved to your account',
      body: 'Your cart and wishlist follow you to any device once you sign in.',
      bodyShort: 'Cart and wishlist follow you to any device once you sign in.',
    },
    {
      icon: 'sets',
      title: 'Sets you can see inside',
      body: 'Every set lists exactly what it contains and why it is available.',
      bodyShort: 'Every set lists exactly what it contains.',
    },
  ],
  footer: {
    tagline: 'Thoughtful kitchenware and home essentials. A fictional portfolio collection.',
    columns: [
      {
        title: 'Shop',
        links: [
          { label: 'All products', href: routes.products },
          { label: 'Sets & bundles', href: routes.category('sets-and-bundles') },
          { label: 'New in', href: routes.newIn },
          { label: 'Offers', href: routes.offers },
        ],
      },
      {
        title: 'Account & help',
        links: [
          { label: 'My account', href: routes.account },
          { label: 'Orders', href: routes.orders },
          { label: 'Help centre', href: placeholderHref('Help centre') },
          { label: 'Contact us', href: placeholderHref('Contact us') },
        ],
      },
      {
        title: 'Legal',
        links: [
          { label: 'Terms of sale', href: placeholderHref('Terms of sale') },
          { label: 'Privacy', href: placeholderHref('Privacy') },
          { label: 'Cookies', href: placeholderHref('Cookies') },
        ],
      },
    ],
    copyright: '© 2026 Nordhaven Commerce · Egypt',
    locale: 'English · EGP',
  },
};
