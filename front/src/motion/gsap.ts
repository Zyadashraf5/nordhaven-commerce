'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

/**
 * The single place GSAP plugins are registered (client only). Everything that
 * animates imports gsap from here so registration happens exactly once.
 */
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
  gsap.defaults({ ease: 'power3.out' });
  // Lenis drives the frame timing; GSAP must not "catch up" after a stall.
  gsap.ticker.lagSmoothing(0);
}

/** True when the visitor asked for less motion, or the environment can't animate (tests, old browsers). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True for a fine pointer (mouse/trackpad). Touch keeps native scrolling and no magnetic effects. */
export function hasFinePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export { gsap, ScrollTrigger, SplitText, useGSAP };
