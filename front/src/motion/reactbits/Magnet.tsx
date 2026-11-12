'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap, hasFinePointer, prefersReducedMotion } from '../gsap';

/**
 * Magnet — adapted from React Bits (https://reactbits.dev, "Magnet", MIT +
 * Commons Clause; see LICENSE-react-bits.md).
 *
 * Changes from the original: the spring simulation and its own
 * requestAnimationFrame loop are replaced by GSAP `quickTo` (one ticker for the
 * whole app); the pull is capped to a few pixels so a call-to-action never
 * escapes the cursor; touch, reduced motion and keyboard focus get no effect;
 * the wrapper is inline so it doesn't change layout.
 */
export function Magnet({
  children,
  padding = 60,
  strength = 4,
  maxOffset = 8,
  className,
}: {
  children: ReactNode;
  /** Extra reach around the element, in px. */
  padding?: number;
  /** Higher = weaker pull. */
  strength?: number;
  /** Largest movement in px. */
  maxOffset?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null || prefersReducedMotion() || !hasFinePointer()) return undefined;
    const toX = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const toY = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    const clamp = gsap.utils.clamp(-maxOffset, maxOffset);

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const near =
        Math.abs(dx) < rect.width / 2 + padding && Math.abs(dy) < rect.height / 2 + padding;
      toX(near ? clamp(dx / strength) : 0);
      toY(near ? clamp(dy / strength) : 0);
    };
    const reset = () => {
      toX(0);
      toY(0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('blur', reset);
      gsap.set(el, { clearProps: 'transform' });
    };
  }, [padding, strength, maxOffset]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-flex', willChange: 'transform' }}
    >
      {children}
    </span>
  );
}
