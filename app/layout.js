import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "SandraHub",
  description: "SandraHub - SPM Sumatera",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Sync theme before React hydrates — eliminates dark flash */}
        <Script id="theme-init" strategy="beforeInteractive">{`
try {
  var t = localStorage.getItem('hub-theme') || localStorage.getItem('sh-theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch(e) {}
        `}</Script>
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}