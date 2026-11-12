'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { gsap, prefersReducedMotion } from './gsap';
import { motion } from './tokens';

/** True once any page has mounted; the first page load is not "a navigation". */
let mountedBefore = false;

/**
 * `<main id="main">` with the route transition: after a client-side
 * navigation the new page settles in (a short fade + lift, before first paint
 * of the new page, so there's no flash). The very first load is left exactly as
 * the server rendered it. Header and footer never animate between pages.
 */
export function MotionMain({
  children,
  className,
  admin = false,
}: {
  children: ReactNode;
  className?: string | undefined;
  admin?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const first = !mountedBefore;
    mountedBefore = true;
    const el = ref.current;
    if (first || el === null || prefersReducedMotion()) return undefined;
    const tween = gsap.fromTo(
      el,
      { autoAlpha: 0, y: admin ? 4 : motion.distance.sm },
      {
        autoAlpha: 1,
        y: 0,
        duration: admin ? motion.admin.duration : motion.duration.sm + 0.1,
        ease: motion.ease.out,
        clearProps: 'transform,opacity,visibility',
      },
    );
    return () => {
      tween.kill();
    };
  }, [admin]);

  return (
    <main id="main" ref={ref} className={className}>
      {children}
    </main>
  );
}
