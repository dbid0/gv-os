"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

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

const entranceStore = { entered: false };
const entranceSubscribe = () => () => {};

/**
 * Play entrance motion once per app lifetime (P1-8): the first mounted
 * page animates in; every navigation after renders settled. Server
 * snapshot animates (safe default), the store flips after first mount.
 */
export function useEntranceOnce(): boolean {
  const first = useSyncExternalStore(
    entranceSubscribe,
    () => !entranceStore.entered,
    () => true,
  );
  useEffect(() => {
    entranceStore.entered = true;
  }, []);
  return first;
}
