import type { Transition, Variants } from "motion/react";

/**
 * The motion vocabulary for the whole app.
 *
 * One file, so every surface moves the same way. The failure mode this prevents
 * is forty components each with a hand-picked duration, which reads as sloppy
 * even when each one looks fine alone.
 *
 * Principles:
 * - Spring for anything the user's action caused. It feels responsive because
 *   it settles rather than stopping dead.
 * - Ease for ambient motion the user did not trigger.
 * - Nothing is slower than 400ms. Beyond that it stops feeling like polish and
 *   starts feeling like waiting.
 * - Everything is disabled under prefers-reduced-motion. See useReducedMotion
 *   in components, and the CSS fallback in globals.css.
 */

/** Direct response to input: menus, toggles, hovers. */
export const snappy: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

/** Larger surfaces moving: sidebar collapse, sheets. */
export const smooth: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
};

/** Ambient, non-interactive: content arriving. */
export const gentle: Transition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
};

/** Content entering a page or a list. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: gentle },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: gentle },
};

/**
 * Parent for a list whose children arrive in sequence. Keep the stagger small:
 * beyond about 60ms per item a six-card row feels like it is loading slowly.
 */
export const stagger = (step = 0.04): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: step } },
});

/** Interactive card or row lift. Subtle on purpose. */
export const lift = {
  rest: { y: 0 },
  hover: { y: -2, transition: snappy },
  tap: { y: 0, scale: 0.995, transition: snappy },
};
