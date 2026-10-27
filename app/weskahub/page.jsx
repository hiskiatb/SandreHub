"use client";
/**
 * /weskahub — Region Salesforce Management preview (Western Kalimantan)
 * Static UI preview only (no backend wiring yet) — rendered from
 * /public/weskahub-ui/index.html inside an iframe so the design built
 * for the interview deck can be clicked through locally as-is.
 */
export default function WeskaHubPage() {
  return (
    <iframe
      src="/weskahub-ui/index.html"
      title="WeskaHub"
      style={{
        border: "none",
        width: "100vw",
        height: "100svh",
        display: "block",
      }}
    />
  );
}
