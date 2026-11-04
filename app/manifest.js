export default function manifest() {
  return {
    name: "SandraHub",
    short_name: "SandraHub",
    description: "SandraHub Sales & Distribution Platform — SPM Sumatera.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/sandra-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/sandra-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/sandra-icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/sandra-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
