/**
 * READING A CALL FROM THE LINK A CLOSER PASTED.
 *
 * Every end-of-call report on a client's tracking sheet carries a Fathom share
 * link — the closer's own "here's the call" URL. That link is the whole
 * transcript, and it needs no API key: the share page itself exposes Fathom's
 * copy-transcript endpoint carrying the same share token, which is exactly what
 * the "copy transcript" button on that page uses.
 *
 * That matters because it closes the loop TODAY. The Fathom API integration is
 * still waiting on a key; these recordings are not.
 *
 * Everything here is pure — URL parsing and payload shaping — so the fetching
 * module stays thin and this stays testable with no network.
 */

/** The share token in a Fathom share URL, or null when it isn't one. */
export function parseShareToken(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^https?:\/\/(?:www\.)?fathom\.video\/share\/([A-Za-z0-9_-]{8,})/.exec(
    url.trim(),
  );
  return match ? match[1] : null;
}

/**
 * The copy-transcript endpoint advertised by a share page.
 *
 * The page embeds it as HTML-escaped JSON (`&quot;copyTranscriptUrl&quot;:...`),
 * so both the escaped and plain spellings are accepted. Returning null rather
 * than constructing a URL from a guessed call id keeps this honest: if Fathom
 * changes the page, this fails visibly instead of hitting an invented endpoint.
 */
export function copyTranscriptUrlFrom(pageHtml: string): string | null {
  const patterns = [
    /&quot;copyTranscriptUrl&quot;:&quot;(https:\/\/[^&]+?)&quot;/,
    /"copyTranscriptUrl":"(https:\/\/[^"]+)"/,
  ];
  for (const p of patterns) {
    const m = p.exec(pageHtml);
    if (m) return decodeHtml(m[1]);
  }
  return null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** The Fathom call id inside a copy-transcript URL, when present. */
export function callIdFrom(copyUrl: string): string | null {
  const m = /\/calls\/(\d+)\//.exec(copyUrl);
  return m ? m[1] : null;
}

export interface ShareTranscript {
  /** The call's own title, e.g. "(YA) Louie Pablo | AI Strategy Call". */
  title: string | null;
  /** Speaker-labelled transcript text. */
  text: string;
  /** Runtime in seconds when the header states it. */
  durationSeconds: number | null;
}

/**
 * Shape the copy-transcript payload into something storable.
 *
 * Fathom returns both an `html` rendering and a `plain_text` one; the plain
 * text is already speaker-labelled and timestamped, so it is preferred and the
 * HTML is only a fallback. A payload with neither returns null — an empty
 * transcript stored as if it were the call would read as a silent meeting.
 */
export function parseTranscriptPayload(payload: unknown): ShareTranscript | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as { plain_text?: unknown; html?: unknown };

  let text: string | null = null;
  if (typeof body.plain_text === "string" && body.plain_text.trim() !== "") {
    text = body.plain_text.trim();
  } else if (typeof body.html === "string" && body.html.trim() !== "") {
    text = stripHtml(body.html);
  }
  if (!text || text.trim() === "") return null;

  const [firstLine = ""] = text.split("\n");
  const title = firstLine.trim() === "" ? null : firstLine.trim();
  return { title, text, durationSeconds: parseDuration(text) };
}

/** "VIEW RECORDING - 52 mins" → 3120. Null when the header doesn't say. */
export function parseDuration(text: string): number | null {
  const m = /VIEW RECORDING\s*-\s*(\d+)\s*(min|hour)/i.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return m[2].toLowerCase().startsWith("hour") ? value * 3600 : value * 60;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join("\n");
}
