'use client';

import { useRef, type ReactNode } from 'react';
import { useFlashOnChange, usePulseOnChange } from './feedback';

/**
 * A span that acknowledges a change of `value` once it has happened: a small
 * pulse (counts, toggles) or a settle-in (prices, totals). The new value is
 * already on screen; the motion only points at it. Nothing plays on first render.
 */
export function Pulse({
  value,
  kind = 'pulse',
  className,
  children,
}: {
  value: unknown;
  kind?: 'pulse' | 'flash';
  className?: string | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  usePulseOnChange(ref, kind === 'pulse' ? value : undefined);
  useFlashOnChange(ref, kind === 'flash' ? value : undefined);
  return (
    <span ref={ref} className={className} style={{ display: 'inline-block' }}>
      {children}
    </span>
  );
}
