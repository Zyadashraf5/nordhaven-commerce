'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { gsap, prefersReducedMotion } from './gsap';
import { motion } from './tokens';

/**
 * Micro-feedback (F07): small, immediate acknowledgements that never delay or
 * alter the value shown. The new value is already rendered when the pulse
 * plays; the pulse only draws the eye to it.
 */

/** Pulses `ref` whenever `value` changes after the first render (cart count, a price, a total). */
export function usePulseOnChange<T extends HTMLElement>(
  ref: RefObject<T | null>,
  value: unknown,
  scale = 1.14,
) {
  const previous = useRef(value);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    const el = ref.current;
    if (el === null || prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { scale },
      {
        scale: 1,
        duration: motion.duration.xs + 0.12,
        ease: 'back.out(2)',
        clearProps: 'transform',
        overwrite: true,
      },
    );
  }, [ref, value, scale]);
}

/** Highlights a changed value with a short colour wash (prices on a variant change). */
export function useFlashOnChange<T extends HTMLElement>(ref: RefObject<T | null>, value: unknown) {
  const previous = useRef(value);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    const el = ref.current;
    if (el === null || prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { y: -4, opacity: 0.35 },
      {
        y: 0,
        opacity: 1,
        duration: motion.duration.sm,
        ease: motion.ease.out,
        clearProps: 'transform,opacity',
        overwrite: true,
      },
    );
  }, [ref, value]);
}

/** Entrance for an overlay that just mounted (sheet, drawer, menu, toast). `from` = where it slides from. */
export function useEntrance<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  from: 'bottom' | 'top' | 'left' | 'right' | 'fade' = 'bottom',
) {
  useEffect(() => {
    const el = ref.current;
    if (!active || el === null || prefersReducedMotion()) return undefined;
    const rtl = document.documentElement.dir === 'rtl' || el.closest('[dir="rtl"]') !== null;
    const offset = {
      bottom: { y: 24 },
      top: { y: -12 },
      left: { x: rtl ? 24 : -24 },
      right: { x: rtl ? -24 : 24 },
      fade: {},
    }[from];
    const tween = gsap.fromTo(
      el,
      { autoAlpha: 0, ...offset },
      {
        autoAlpha: 1,
        x: 0,
        y: 0,
        duration: motion.duration.sm,
        ease: motion.ease.out,
        clearProps: 'transform,opacity,visibility',
      },
    );
    return () => {
      tween.kill();
    };
  }, [ref, active, from]);
}

/** One-shot "pop" for a toggle (wishlist heart). */
export function pop(el: Element | null) {
  if (el === null || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 0.7 },
    { scale: 1, duration: 0.42, ease: 'back.out(3)', clearProps: 'transform', overwrite: true },
  );
}

/** Gallery swap: when `key` changes, the image inside `ref` settles in (a short fade + scale). */
export function useImageSwap<T extends HTMLElement>(ref: RefObject<T | null>, key: unknown) {
  const previous = useRef(key);
  useEffect(() => {
    if (Object.is(previous.current, key)) return;
    previous.current = key;
    const image = ref.current?.querySelector('img');
    if (!image || prefersReducedMotion()) return;
    gsap.fromTo(
      image,
      { opacity: 0.35, scale: 1.025 },
      {
        opacity: 1,
        scale: 1,
        duration: motion.duration.md,
        ease: motion.ease.soft,
        clearProps: 'opacity,transform',
        overwrite: true,
      },
    );
  }, [ref, key]);
}
