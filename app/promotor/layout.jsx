export const metadata = {
  title: "Promotor Tracking System",
  description: "Promotor Tracking System — SandraHub",
  manifest: "/promotor/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PTS Promotor",
  },
  icons: {
    icon: [{ url: "/promotor/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/promotor/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ED1C24",
};

export default function PromotorLayout({ children }) {
  return children;
}
