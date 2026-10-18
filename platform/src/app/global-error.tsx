"use client";

/** Letzte Rückfallebene, falls das Root-Layout selbst fehlschlägt. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="de-AT">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fffbfc", color: "#2a1d2c", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 24 }}>Die Anwendung ist gerade nicht erreichbar</h1>
          <p style={{ lineHeight: 1.6 }}>Bitte versuche es in einigen Augenblicken erneut.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 12, background: "#cc2f6e", color: "white", border: 0, borderRadius: 10, padding: "12px 20px", fontWeight: 600, cursor: "pointer" }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
