# React Bits — license notice

Parts of `src/motion/` are adapted from React Bits (https://reactbits.dev,
https://github.com/DavidHDev/react-bits), fetched from the React Bits registry
(`https://reactbits.dev/r/<Name>-TS-CSS.json`) on 2026-10-24:

| React Bits component | Used as                                                         | Adaptation                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SplitText            | `binder.ts` → `split()` (`data-split`)                          | Words/lines rise in line masks via GSAP SplitText; reverts to the original text node after the animation; no hover springs, loops or `visibility: hidden` before hydration |
| AnimatedContent      | `binder.ts` → `reveal()` (`data-reveal`, `data-reveal-stagger`) | Fade + lift on scroll with ScrollTrigger.batch; on-screen server content is never hidden                                                                                   |
| Magnet               | `reactbits/Magnet.tsx`                                          | GSAP `quickTo` instead of a spring rAF loop; capped pull; mouse only                                                                                                       |
| ShinyText            | `binder.ts` → `shine()` + `motion.css` (`data-shine`)           | One CSS-gradient sweep tweened by GSAP instead of a continuous rAF loop                                                                                                    |

---

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, and distribute the Software **as part of an
application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

Commons Clause Restriction: You may use this Software, including for any
commercial purpose, so long as you do not sell, sublicense, or redistribute the
components themselves — whether alone, in a bundle, or as a ported version.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
