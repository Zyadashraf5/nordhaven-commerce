import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from './MotionProvider';
import { Pulse } from './Pulse';
import { bindMotion, isHydrated } from './binder';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

/**
 * F07 motion runtime: reduced motion turns everything off; with motion on the
 * binder only marks/animates hydrated nodes and never changes their content;
 * feedback components never change the value they show.
 */

const original = window.matchMedia;

function setMedia({ reduce, fine }: { reduce: boolean; fine: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduced-motion')
      ? reduce
      : query.includes('pointer: fine')
        ? fine
        : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = original;
  document.documentElement.className = '';
  vi.useRealTimers();
});

const Page = () => (
  <main id="main">
    <h2 data-reveal>Reveal me</h2>
    <ul data-reveal-stagger>
      <li>One</li>
      <li>Two</li>
    </ul>
  </main>
);

describe('MotionProvider', () => {
  it('does nothing under reduced motion: no smooth scroll, nothing bound or hidden', async () => {
    setMedia({ reduce: true, fine: true });
    render(
      <MotionProvider>
        <Page />
      </MotionProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(document.documentElement.classList.contains('lenis')).toBe(false);
    expect(document.querySelectorAll('[data-motion-bound]')).toHaveLength(0);
    expect(screen.getByText('Reveal me')).toBeVisible();
  });
});

describe('bindMotion', () => {
  it('binds hydrated nodes without changing their text', () => {
    setMedia({ reduce: false, fine: true });
    render(<Page />);
    const root = document.getElementById('main') as HTMLElement;
    expect(isHydrated(root)).toBe(true);
    bindMotion(root, 'store', false, true);
    expect(screen.getByText('Reveal me')).toHaveAttribute('data-motion-bound');
    expect(screen.getByText('One')).toHaveAttribute('data-motion-bound');
    expect(screen.getByText('Reveal me').textContent).toBe('Reveal me');
  });

  it('skips server markup React has not hydrated yet', () => {
    const root = document.createElement('main');
    root.innerHTML = '<h2 data-reveal>Static</h2>';
    document.body.appendChild(root);
    bindMotion(root, 'store', false, true);
    expect(root.querySelector('h2')?.hasAttribute('data-motion-bound')).toBe(false);
    root.remove();
  });
});

describe('Pulse', () => {
  it('always shows the current value (the motion only points at it)', () => {
    setMedia({ reduce: false, fine: true });
    const { rerender } = render(<Pulse value={1}>1</Pulse>);
    rerender(<Pulse value={2}>2</Pulse>);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
