// Logo WhatsApp resmi (bulatan gradasi hijau + cincin putih + gagang telepon
// putih) - dipakai konsisten di semua tombol "Hubungi Call Center via
// WhatsApp" (app promotor & dashboard SPM Sumatera).
let _uid = 0;
export function WhatsAppIcon({ size = 20 }) {
  const gradId = `wa-grad-${++_uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5BD066" />
          <stop offset="1" stopColor="#27B43E" />
        </linearGradient>
      </defs>
      {/* Cincin putih luar (bentuk gelembung chat dengan ekor) */}
      <path
        fill="#FFFFFF"
        d="M24 3C12.4 3 3 12.4 3 24c0 3.98 1.1 7.7 3.02 10.87L3.4 44.2a1 1 0 0 0 1.24 1.23l9.6-2.58A20.9 20.9 0 0 0 24 45c11.6 0 21-9.4 21-21S35.6 3 24 3Z"
      />
      {/* Isi bulatan gradasi hijau */}
      <path
        fill={`url(#${gradId})`}
        d="M24 6C14.06 6 6 14.06 6 24c0 3.5 1 6.77 2.72 9.55l-1.8 6.58 6.75-1.77A17.9 17.9 0 0 0 24 42c9.94 0 18-8.06 18-18S33.94 6 24 6Z"
      />
      {/* Gagang telepon putih */}
      <path
        fill="#FFFFFF"
        d="M18.63 13.99c-.4-.9-.82-.92-1.2-.93-.31-.02-.66-.02-1.02-.02-.35 0-.93.13-1.42.65-.49.53-1.86 1.82-1.86 4.43s1.9 5.14 2.17 5.49c.26.36 3.66 5.86 9.04 7.99 4.47 1.77 5.38 1.42 6.35 1.33.97-.09 3.13-1.28 3.57-2.52.44-1.24.44-2.3.31-2.52-.13-.22-.48-.35-1.02-.62-.53-.26-3.13-1.55-3.62-1.72-.49-.18-.84-.26-1.2.26-.35.53-1.37 1.72-1.68 2.07-.31.36-.62.4-1.15.13-.53-.26-2.23-.82-4.25-2.62-1.57-1.4-2.63-3.13-2.94-3.65-.31-.53-.03-.81.23-1.08.24-.24.53-.62.79-.93.26-.31.35-.53.53-.88.18-.36.09-.66-.04-.93-.13-.26-1.16-2.9-1.6-3.96Z"
      />
    </svg>
  );
}
