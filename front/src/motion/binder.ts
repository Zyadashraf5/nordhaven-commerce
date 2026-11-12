'use client';

import { gsap, ScrollTrigger, SplitText } from './gsap';
import { MAX_ANIMATED_ROWS, motion } from './tokens';

/**
 * The declarative motion binder (F07).
 *
 * Pages opt into motion with data attributes instead of carrying their own
 * animation code, so one engine owns timing, cleanup and accessibility:
 *
 *   data-reveal="up|fade|image"   the element settles in when it scrolls into view
 *   data-reveal-stagger           its direct children (or [data-reveal-item]) settle in, staggered
 *   data-split="words|lines"      a static headline rises word by word (React Bits SplitText, adapted)
 *   data-parallax="6"             an image drifts a few percent while it crosses the viewport
 *   data-shine                    one soft highlight sweep when it appears (React Bits ShinyText, adapted)
 *   data-intro                    part of the first-paint intro (hidden pre-paint by CSS, see motion.css)
 *   data-rows                     a table body whose first rows fade in (admin)
 *
 * Content is never hidden unless it will be revealed: on a page's first bind,
 * anything already on screen is left exactly as the server rendered it;
 * only content below the fold is set up to reveal. Content that arrives later
 * (an API answer, a filter) gets a short entrance. Everything is created inside
 * a gsap.context so a route change reverts it completely.
 */

type Mode = 'store' | 'admin';

const BOUND = 'data-motion-bound';

function inView(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.95 && rect.bottom > 0;
}

/**
 * True once React owns the node (it attaches its fiber when it hydrates or
 * renders it). Touching server markup React hasn't hydrated yet — a Suspense
 * boundary still streaming in — would make hydration mismatch, so such nodes
 * are skipped and picked up by the next bind.
 */
export function isHydrated(node: Element): boolean {
  for (const key in node) if (key.startsWith('__reactFiber')) return true;
  return false;
}

/** Set by claim() when it had to skip unhydrated nodes, so the caller can retry. */
export const pendingHydration = { skipped: false };

function claim<T extends Element>(nodes: Iterable<T>): T[] {
  const fresh: T[] = [];
  for (const node of nodes) {
    if (node.hasAttribute(BOUND)) continue;
    if (!isHydrated(node)) {
      pendingHydration.skipped = true;
      continue;
    }
    node.setAttribute(BOUND, '');
    fresh.push(node);
  }
  return fresh;
}

function travel(mode: Mode, kind: string | null): number {
  if (mode === 'admin') return motion.admin.distance;
  return kind === 'image' ? motion.distance.lg : motion.distance.md;
}

function duration(mode: Mode, kind: string | null): number {
  if (mode === 'admin') return motion.admin.duration;
  return kind === 'image' ? motion.duration.lg : motion.duration.md;
}

/**
 * Animates `targets` in. `later` = the element arrived after the page bound
 * (or the page is client-navigated): on-screen targets play now, quickly.
 */
function reveal(
  targets: HTMLElement[],
  mode: Mode,
  kind: string | null,
  later: boolean,
  stagger = 0,
) {
  if (targets.length === 0) return;
  const y = kind === 'fade' ? 0 : travel(mode, kind);
  const visible = targets.filter(inView);
  const below = targets.filter((t) => !inView(t));

  if (later && visible.length > 0) {
    gsap.fromTo(
      visible,
      { autoAlpha: 0, y: Math.min(y, motion.distance.sm) },
      {
        autoAlpha: 1,
        y: 0,
        duration: mode === 'admin' ? motion.admin.duration : motion.duration.sm,
        ease: motion.ease.out,
        stagger: stagger > 0 ? Math.min(stagger, motion.stagger.items) : 0,
        clearProps: 'transform,visibility',
      },
    );
  }

  if (below.length === 0) return;
  gsap.set(below, { autoAlpha: 0, y });
  ScrollTrigger.batch(below, {
    start: motion.revealStart,
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        autoAlpha: 1,
        y: 0,
        duration: duration(mode, kind),
        ease: kind === 'image' ? motion.ease.soft : motion.ease.out,
        stagger: stagger > 0 ? stagger : motion.stagger.items,
        overwrite: true,
        clearProps: 'transform,visibility',
      }),
  });
}

/** Headline rise (adapted from React Bits SplitText): split, rise inside line masks, then revert to plain text. */
function split(el: HTMLElement, later: boolean, intro: boolean) {
  const type = el.dataset.split === 'lines' ? 'lines' : 'words';
  if (!intro && !later && inView(el)) return; // already on screen from the server: leave it.
  const instance = new SplitText(el, {
    type: type === 'words' ? 'lines,words' : 'lines',
    mask: 'lines',
    linesClass: 'hw-split-line',
  });
  const pieces = type === 'words' ? instance.words : instance.lines;
  gsap.set(el, { autoAlpha: 1 });
  const tween = {
    yPercent: 0,
    autoAlpha: 1,
    duration: motion.duration.lg,
    ease: motion.ease.out,
    stagger: type === 'words' ? motion.stagger.words : motion.stagger.items,
    // Back to the original text node so React's DOM stays the DOM it rendered.
    onComplete: () => instance.revert(),
  };
  if (intro || inView(el)) {
    gsap.fromTo(pieces, { yPercent: 110, autoAlpha: 0 }, { ...tween, delay: intro ? 0.05 : 0 });
  } else {
    gsap.set(pieces, { yPercent: 110, autoAlpha: 0 });
    ScrollTrigger.create({
      trigger: el,
      start: motion.revealStart,
      once: true,
      onEnter: () => gsap.to(pieces, tween),
    });
  }
}

/** One soft highlight sweep (adapted from React Bits ShinyText; driven by GSAP instead of its own rAF loop). */
function shine(el: HTMLElement) {
  el.classList.add('hw-shine');
  ScrollTrigger.create({
    trigger: el,
    start: 'top 92%',
    once: true,
    onEnter: () =>
      gsap.fromTo(
        el,
        { '--hw-shine-x': '-60%' },
        { '--hw-shine-x': '160%', duration: 1.3, ease: 'power1.inOut', delay: 0.2 },
      ),
  });
}

/** `el` is the frame (clips); its image drifts a few percent, scaled up just enough that no edge shows. */
function parallax(el: HTMLElement) {
  const amount = Number(el.dataset.parallax) || motion.parallax;
  const image = el.querySelector('img') ?? el;
  el.setAttribute('data-parallax-frame', '');
  gsap.set(image, { scale: 1 + (amount * 2.2) / 100 });
  gsap.fromTo(
    image,
    { yPercent: -amount },
    {
      yPercent: amount,
      ease: motion.ease.none,
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
    },
  );
}

/**
 * Binds every unbound motion attribute under `root`. `later` = called after
 * the first bind of this page (DOM arrived from an API answer or interaction),
 * or after a client-side navigation.
 */
export function bindMotion(root: HTMLElement, mode: Mode, later: boolean, fineMotion: boolean) {
  // First-paint intro: everything marked data-intro plays as one short sequence.
  const intro = claim(root.querySelectorAll<HTMLElement>('[data-intro]'));
  const introDone = document.documentElement.classList.contains('hw-intro-done');
  if (intro.length > 0 && (later || introDone)) {
    // After a client-side navigation the page fades in as a whole (MotionMain);
    // intro headlines still rise, other intro content simply comes with the page.
    for (const el of intro) if (el.dataset.split !== undefined) split(el, true, false);
    document.documentElement.classList.add('hw-intro-done');
  } else if (intro.length > 0) {
    const tl = gsap.timeline({
      onComplete: () => document.documentElement.classList.add('hw-intro-done'),
    });
    intro.forEach((el, index) => {
      if (el.dataset.split !== undefined) {
        el.setAttribute(BOUND, '');
        tl.add(() => split(el, true, true), index * 0.08);
      } else {
        tl.fromTo(
          el,
          {
            autoAlpha: 0,
            y: el.dataset.intro === 'image' ? 0 : motion.distance.md,
            scale: el.dataset.intro === 'image' ? 1.04 : 1,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: el.dataset.intro === 'image' ? 1.4 : motion.duration.md,
            ease: motion.ease.out,
            clearProps: 'transform',
          },
          0.12 + index * 0.08,
        );
      }
    });
  }

  for (const el of claim(root.querySelectorAll<HTMLElement>('[data-split]')))
    split(el, later, false);

  for (const el of claim(root.querySelectorAll<HTMLElement>('[data-reveal]'))) {
    reveal([el], mode, el.dataset.reveal ?? null, later);
  }

  // Groups keep binding: cards a filter or "load more" adds later animate in too.
  for (const group of root.querySelectorAll<HTMLElement>('[data-reveal-stagger]')) {
    if (!isHydrated(group)) {
      pendingHydration.skipped = true;
      continue;
    }
    const firstTime = !group.hasAttribute(BOUND);
    group.setAttribute(BOUND, '');
    const marked = group.querySelectorAll<HTMLElement>('[data-reveal-item]');
    const items = claim(
      marked.length > 0 ? Array.from(marked) : (Array.from(group.children) as HTMLElement[]),
    );
    reveal(
      items,
      mode,
      group.dataset.revealStagger || null,
      later || !firstTime,
      mode === 'admin' ? motion.stagger.rows * 2 : motion.stagger.items,
    );
  }

  for (const body of claim(root.querySelectorAll<HTMLElement>('[data-rows]'))) {
    const rows = Array.from(body.children).slice(0, MAX_ANIMATED_ROWS) as HTMLElement[];
    const visible = rows.filter(inView);
    if (visible.length > 0) {
      gsap.fromTo(
        visible,
        { autoAlpha: 0, y: 6 },
        {
          autoAlpha: 1,
          y: 0,
          duration: motion.admin.duration,
          stagger: motion.stagger.rows,
          ease: motion.ease.out,
          clearProps: 'transform,visibility',
        },
      );
    }
  }

  if (mode === 'store') {
    for (const el of claim(root.querySelectorAll<HTMLElement>('[data-shine]'))) shine(el);
    if (fineMotion) {
      for (const el of claim(root.querySelectorAll<HTMLElement>('[data-parallax]'))) parallax(el);
    }
  }
}
