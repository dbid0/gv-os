"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Toasts.
 *
 * Needed before any screen writes data: an action that changes something must
 * say so, or people click twice and double-submit.
 *
 * Deliberate choices:
 * - Errors DO NOT auto-dismiss. A success can disappear; a failure the user
 *   never read is a failure they will repeat.
 * - Newest appears at the bottom of the stack, nearest the thumb, and older
 *   ones slide up. Nothing jumps position under the cursor.
 * - Capped at three. Beyond that they stop being read and start being wallpaper.
 */

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
};

type ToastInput = Omit<Toast, "id">;

const ToastContext = createContext<{
  toast: (input: ToastInput) => void;
} | null>(null);

const MAX_VISIBLE = 3;
const DISMISS_AFTER = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }].slice(-MAX_VISIBLE));

      // Errors stay until dismissed. Everything else clears itself.
      if (input.tone !== "error") {
        setTimeout(() => dismiss(id), DISMISS_AFTER);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}

const icons = {
  success: Check,
  error: AlertTriangle,
  info: Info,
} as const;

const tones = {
  success: "text-success",
  error: "text-destructive",
  info: "text-brand",
} as const;

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const reduceMotion = useReducedMotion();

  const items = toasts.map((t) => {
    const Icon = icons[t.tone];
    return (
      <Fragment key={t.id}>
        <ToastCard toast={t} Icon={Icon} onDismiss={onDismiss} reduceMotion />
      </Fragment>
    );
  });

  return (
    <div
      // polite, not assertive: a toast should not interrupt what is being read.
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {/* Under reduced motion there is no exit animation, so a dismissed toast
          leaves the DOM immediately rather than lingering through a tween. */}
      {reduceMotion ? (
        items
      ) : (
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = icons[t.tone];

            return (
              <motion.div
                key={t.id}
                layout
                initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={reduceMotion ? { duration: 0 } : snappy}
                className="bg-popover elev-raised pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", tones[t.tone])} />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.detail && (
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {t.detail}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onDismiss(t.id)}
                  aria-label="Dismiss"
                  className="text-faint hover:text-foreground press -m-1 shrink-0 p-1 transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}

function ToastCard({
  toast,
  Icon,
  onDismiss,
}: {
  toast: Toast;
  Icon: (typeof icons)[ToastTone];
  onDismiss: (id: number) => void;
  reduceMotion?: boolean;
}) {
  return (
    <div className="bg-popover elev-raised pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4">
      <Icon className={cn("mt-0.5 size-4 shrink-0", tones[toast.tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.detail && (
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {toast.detail}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="text-faint hover:text-foreground press -m-1 shrink-0 p-1 transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
