'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import Lenis from 'lenis';
import { gsap, hasFinePointer, prefersReducedMotion, ScrollTrigger } from './gsap';
import { bindMotion, pendingHydration } from './binder';

/**
 * The F07 motion runtime, mounted once at the root (StorefrontShell).
 *
 * - Lenis smooth scrolling on storefront, account and checkout pages with a
 *   fine pointer (touch keeps native momentum; admin keeps native scrolling).
 *   Lenis is driven by GSAP's ticker — one RAF loop for the whole app — and
 *   feeds ScrollTrigger on every scroll.
 * - Scroll locks stay locks: when a sheet or menu sets `body { overflow:
 *   hidden }`, Lenis stops; nested scroll areas scroll natively
 *   (`allowNestedScroll`, `data-lenis-prevent`).
 * - Per route, the binder wires the page's `data-*` motion attributes inside a
 *   gsap.context; later DOM (API answers, filters) is bound as it arrives; the
 *   context is reverted on navigation so nothing leaks.
 * - Reduced motion (or no matchMedia, e.g. tests): no Lenis, no binder.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const admin = pathname.startsWith('/admin');
  const lenisRef = useRef<Lenis | null>(null);
  const navigations = useRef(0);

  /* Lenis: one instance, recreated only when the admin/storefront side changes. */
  useEffect(() => {
    if (admin || prefersReducedMotion() || !hasFinePointer()) return undefined;
    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.11,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
      allowNestedScroll: true,
      anchors: false,
    });
    lenisRef.current = lenis;
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);

    // A scroll lock (sheet, mobile menu) must stop smooth scrolling too.
    const sync = () => {
      if (document.body.style.overflow === 'hidden') lenis.stop();
      else lenis.start();
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

    return () => {
      observer.disconnect();
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [admin]);

  /* Binder: per route. */
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const root = document.getElementById('main');
    if (root === null) return undefined;
    const later = navigations.current > 0;
    navigations.current += 1;
    const mode = admin ? 'admin' : 'store';
    const fine = hasFinePointer();

    // Navigation lands at the top; keep Lenis' idea of the position in step.
    lenisRef.current?.scrollTo(window.scrollY, { immediate: true });

    const ctx = gsap.context(() => undefined, root);
    let refresh = 0;
    const scheduleRefresh = () => {
      window.clearTimeout(refresh);
      refresh = window.setTimeout(() => ScrollTrigger.refresh(), 180);
    };

    // Bind, and while parts of the page are still hydrating (streamed Suspense
    // boundaries), try again shortly; the binder never touches unhydrated nodes.
    let retry = 0;
    let attempts = 0;
    const bind = (isLater: boolean) => {
      pendingHydration.skipped = false;
      ctx.add(() => bindMotion(root, mode, isLater, fine));
      scheduleRefresh();
      if (pendingHydration.skipped && attempts < 20) {
        attempts += 1;
        window.clearTimeout(retry);
        retry = window.setTimeout(() => bind(isLater), 150);
      }
    };

    // First page load: wait until the document has loaded and the main thread is
    // idle, so hydration has run. After a client navigation the page was
    // rendered on the client, so it can bind straight away.
    let started = false;
    let idle = 0;
    const start = () => {
      if (started) return;
      started = true;
      bind(later);
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === 'function')
        idle = window.requestIdleCallback(start, { timeout: 600 });
      else idle = globalThis.setTimeout(start, 120) as unknown as number;
    };
    if (later) start();
    else if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });

    let pending = 0;
    const observer = new MutationObserver(() => {
      if (!started) return;
      window.clearTimeout(pending);
      pending = window.setTimeout(() => bind(true), 60);
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.clearTimeout(pending);
      window.clearTimeout(refresh);
      window.clearTimeout(retry);
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      window.removeEventListener('load', whenIdle);
      ctx.revert();
      root
        .querySelectorAll('[data-motion-bound]')
        .forEach((el) => el.removeAttribute('data-motion-bound'));
    };
  }, [pathname, admin]);

  return <>{children}</>;
}
