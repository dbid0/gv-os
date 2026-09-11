"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root error boundary. Next.js renders this in place of the entire app
 * (including layout.tsx, which has already failed to render) when an error
 * escapes every other boundary — the last line of defense against a truly
 * silent failure. Reporting it is a no-op when Sentry was never initialized.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            padding: "1.5rem",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#71717a" }}>
            The error has been reported. Try reloading the page.
          </p>
        </div>
      </body>
    </html>
  );
}
