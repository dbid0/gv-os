/**
 * Copy text to the clipboard, robustly.
 *
 * `navigator.clipboard` only exists in a secure context (https / localhost) and
 * can be blocked, so a bare `writeText` silently fails on plain-http previews and
 * older browsers. This falls back to a hidden textarea + `execCommand("copy")`,
 * which works without the async API, and returns whether the copy succeeded so
 * the caller can toast the right thing.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const el = document.createElement("textarea");
    el.value = text;
    // Keep it out of view and out of the layout, but still selectable.
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-9999px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
