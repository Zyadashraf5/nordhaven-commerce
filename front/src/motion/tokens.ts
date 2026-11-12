/**
 * F07 motion tokens — one vocabulary for every animated surface.
 *
 * Warm Editorial motion is calm: content settles into place rather than
 * bouncing; nothing loops; nothing moves more than it needs to. The CSS
 * tokens (`--hw-motion-*`, 160–240 ms) keep driving hover/press states; these
 * GSAP tokens drive entrances, reveals and feedback. Seconds, not ms.
 */
export const motion = {
  duration: {
    /** Feedback: a price pulse, a badge bump, a heart pop. */
    xs: 0.22,
    /** Small UI: toasts, menus, admin rows. */
    sm: 0.36,
    /** Standard reveal of a block of content. */
    md: 0.7,
    /** Editorial headlines and imagery. */
    lg: 1.05,
  },
  ease: {
    /** Decelerating settle — the house ease. */
    out: 'power3.out',
    /** Gentler settle for large imagery. */
    soft: 'power2.out',
    /** Quick exit. */
    in: 'power2.in',
    /** Continuous, for scrubbed parallax. */
    none: 'none',
  },
  stagger: {
    /** Words in a headline. */
    words: 0.055,
    /** Cards in a grid / tiles in a row. */
    items: 0.07,
    /** Admin table rows: fast, never a show. */
    rows: 0.018,
  },
  distance: {
    /** Small lift for UI. */
    sm: 10,
    /** Standard reveal travel. */
    md: 24,
    /** Editorial imagery. */
    lg: 40,
  },
  /** Scroll position (from the top of the viewport) at which a reveal starts. */
  revealStart: 'top 88%',
  /** Parallax range in percent of an image's own height — kept restrained. */
  parallax: 6,
  /** Admin runs at reduced intensity: shorter, closer, no parallax. */
  admin: { duration: 0.28, distance: 8 },
} as const;

/** Never animate more than this many rows of a table; the rest just appear. */
export const MAX_ANIMATED_ROWS = 20;
