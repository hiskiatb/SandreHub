/** @type {import('next').NextConfig} */
const nextConfig = {
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
