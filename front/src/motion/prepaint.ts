/**
 * Runs before first paint (inline in <head>, app/layout.tsx): marks the page
 * motion-capable so intro content can start hidden (motion.css). Without JS or
 * with reduced motion the class is never added and nothing is hidden.
 */
export const MOTION_PREPAINT_SCRIPT =
  "try{if(window.matchMedia&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('hw-motion')}}catch(e){}";
