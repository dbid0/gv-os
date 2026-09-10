"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useMemo,
} from "react";

/**
 * Client-state helpers built on useSyncExternalStore.
 *
 * Why not `useState` + `useEffect`: reading localStorage during render breaks
 * SSR hydration (server says one thing, client another), and reading it in an
 * effect means calling setState from an effect, which causes an extra render
 * pass and is flagged by react-hooks/set-state-in-effect.
 *
 * useSyncExternalStore is the primitive designed for exactly this: give React a
 * server snapshot and a client snapshot and let it reconcile them safely.
 */

/**
 * False during SSR and the first client render, true afterwards.
 *
 * Use it to defer rendering anything that only the browser can know, such as
 * the resolved colour theme.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * localStorage is not guaranteed to exist: Safari private mode throws on access,
 * some embedded webviews omit it, and it is absent in some test environments.
 *
 * When it is missing we fall back to an in-memory map rather than doing nothing.
 * The difference matters: without a fallback, a toggle reads back its default
 * immediately after being set, so the control appears dead. Degrading to
 * "works, but forgets on reload" is the correct failure.
 */
const memoryStore = new Map<string, string>();

/**
 * Clears the in-memory fallback. Tests need this: clearing localStorage does not
 * touch the memory copy, so without it state leaks between test cases on any
 * environment where localStorage is unavailable.
 */
export function clearPersistedState(): void {
  memoryStore.clear();
}

function readValue(key: string): string | null {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    if (stored !== undefined && stored !== null) return stored;
    if (globalThis.localStorage) return null;
  } catch {
    // fall through to memory
  }
  return memoryStore.get(key) ?? null;
}

function writeValue(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Memory copy above is enough to keep the UI responsive.
  }
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep multiple tabs in agreement.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** A boolean persisted to localStorage, safe to read during render. */
export function usePersistedBoolean(
  key: string,
  fallback = false,
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const stored = readValue(key);
      return stored === null ? fallback : stored === "true";
    },
    () => fallback,
  );

  const set = useCallback(
    (next: boolean) => {
      writeValue(key, String(next));
      emit();
    },
    [key],
  );

  return [value, set];
}

/**
 * Count a number up to its target — the premium "the money is landing" feel on
 * the dashboard hero. SSR and the first render show the real target (no
 * hydration mismatch, correct with JS off); after mount it eases from the last
 * shown value to the target, so a scope toggle animates to the new figure
 * instead of snapping. Honors prefers-reduced-motion by jumping straight there.
 */
/**
 * A persisted JSON record keyed by string — same store discipline as
 * usePersistedBoolean (external-store read, hydration-safe fallback, one
 * emit per write). For small UI state like which nav groups are folded.
 */
export function usePersistedRecord(
  key: string,
): [Record<string, boolean>, (next: Record<string, boolean>) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readValue(key) ?? "{}",
    () => "{}",
  );
  const value = useMemo(() => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, boolean>)
        : {};
    } catch {
      return {};
    }
  }, [raw]);
  const set = useCallback(
    (next: Record<string, boolean>) => {
      writeValue(key, JSON.stringify(next));
      emit();
    },
    [key],
  );
  return [value, set];
}

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  // FIRST PAINT SHOWS THE REAL VALUE. The count-up only plays when the target
  // CHANGES (a scope toggle, a live update) — easing from wherever it was.
  // Counting up from zero on every load performed a second of fake loading on
  // top of the real one; a dashboard's first job is the number, not the show.
  const fromRef = useRef(target);

  useEffect(() => {
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || target === fromRef.current) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

const entranceStore = { entered: false };
const entranceSubscribe = () => () => {};

/**
 * Entrance motion belongs to SOFT navigations only. On a full document
 * load the server HTML must be readable the instant it arrives — hiding
 * it until hydration reveals it made every fresh tab feel like a spinner
 * (the payload was there; 1.4MB of JS was gatekeeping it). So the server
 * snapshot and the first client mount render settled; the store flips
 * after entry and every in-app navigation after that gets the motion.
 */
export function useEntranceOnce(): boolean {
  const animate = useSyncExternalStore(
    entranceSubscribe,
    () => entranceStore.entered,
    () => false,
  );
  useEffect(() => {
    entranceStore.entered = true;
  }, []);
  return animate;
}
