/**
 * Ikon QR "viewfinder" khusus Scanner - diadaptasi dari referensi icon yang
 * diberikan user (vecteezy "simple QR code line icon"): 4 bracket sudut
 * (spt viewfinder kamera) + grid 2x2 modul QR (kotak bulat + titik tengah).
 * Dipakai gantiin lucide `QrCode` di semua layar Scanner (biar desainnya
 * "selaras" dgn ikon PWA Scanner yg sama persis) - SENGAJA beda dari ikon
 * Camera/Mobile (yg tetap pakai ikon FlashPrint lama, terpisah).
 */
export default function ScanQrGlyph({ size = 24, color = "currentColor", strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 8V5.5C2.5 3.84 3.84 2.5 5.5 2.5H8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 2.5H18.5C20.16 2.5 21.5 3.84 21.5 5.5V8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 16V18.5C21.5 20.16 20.16 21.5 18.5 21.5H16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 21.5H5.5C3.84 21.5 2.5 20.16 2.5 18.5V16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="5.3" y="5.3" width="5.4" height="5.4" rx="1.7" stroke={color} strokeWidth={strokeWidth} />
      <circle cx="8" cy="8" r="1" fill={color} />
      <rect x="13.3" y="5.3" width="5.4" height="5.4" rx="1.7" stroke={color} strokeWidth={strokeWidth} />
      <circle cx="16" cy="8" r="1" fill={color} />
      <rect x="5.3" y="13.3" width="5.4" height="5.4" rx="1.7" stroke={color} strokeWidth={strokeWidth} />
      <circle cx="8" cy="16" r="1" fill={color} />
      <rect x="13.3" y="13.3" width="5.4" height="5.4" rx="1.7" stroke={color} strokeWidth={strokeWidth} />
      <circle cx="16" cy="16" r="1" fill={color} />
    </svg>
  );
}
