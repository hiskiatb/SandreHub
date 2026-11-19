/** @type {import('next').NextConfig} */
const nextConfig = {
  // Template surat, font, dan tanda tangan Smart Mail Sumatera dibaca lewat fs
  // oleh app/api/smart-mail/* — pastikan ikut ter-deploy ke Vercel.
  // PGlite (database lokal untuk mode lokal Smart Mail saat npm run dev) memuat file wasm-nya
  // sendiri, jadi tidak boleh di-bundle webpack.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/api/smart-mail/*": ["./lib/smartMail/assets/**/*"],
  },
  async headers() {
    return [
      // Kedua service worker Photobooth (sw-camera.js, sw-scanner.js)
      // didaftarkan dgn `scope` di /marta/photobooth/... walau file
      // scriptnya sendiri ada di /photobooth/ - beda direktori, jadi
      // browser BUTUH header Service-Worker-Allowed eksplisit spy scope
      // yg lebih luas itu diizinkan (default: scope cuma boleh sedalam
      // direktori script-nya sendiri).
      {
        source: "/photobooth/sw-:variant.js",
        headers: [{ key: "Service-Worker-Allowed", value: "/marta/photobooth/" }],
      },
    ];
  },
}

export default nextConfig
