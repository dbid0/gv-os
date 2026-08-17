"use client";

import { useCallback, useSyncExternalStore } from "react";

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
      const stored = window.localStorage.getItem(key);
      return stored === null ? fallback : stored === "true";
    },
    () => fallback,
  );

  const set = useCallback(
    (next: boolean) => {
      window.localStorage.setItem(key, String(next));
      emit();
    },
    [key],
  );

  return [value, set];
}
