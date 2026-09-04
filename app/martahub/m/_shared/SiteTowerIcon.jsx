"use client";
/**
 * SiteTowerIcon - ikon menara BTS, SAMA PERSIS dgn yg dipakai utk titik Site
 * di Map Intelligence (app/martahub/components/SumatraMap.jsx,
 * SITE_TOWER_PATHS + SITE_COLOR "#0E9488"). Dipusatkan di sini (sebelumnya
 * duplikat lokal di wizard Buat Plan) supaya identitas visual "Site"
 * konsisten di SEMUA layar yg menyebut site (wizard Review, Laporan
 * Actual, dst.), bukan cuma ikon generik yg tidak ada hubungannya dgn
 * menara/BTS.
 */
const SITE_TOWER_PATHS = [
  "M26.7,2.3c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4c3.5,3.5,3.5,9.1,0,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3\n\t\ts0.5-0.1,0.7-0.3C31,13.5,31,6.5,26.7,2.3z",
  "M22,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c1.1-1.1,1.7-2.5,1.6-4.1c0-1.5-0.7-3-1.8-4.1\n\t\tc-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4C23.3,8.7,23.4,11.2,22,12.6z",
  "M6.7,16.3c-3.5-3.5-3.5-9.1,0-12.6c0.4-0.4,0.4-1,0-1.4s-1-0.4-1.4,0C1,6.5,1,13.5,5.3,17.7C5.5,17.9,5.7,18,6,18\n\t\ts0.5-0.1,0.7-0.3C7.1,17.3,7.1,16.7,6.7,16.3z",
  "M8.8,14.2c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4c-1.5-1.5-1.6-4-0.2-5.4c0.4-0.4,0.4-1,0-1.4\n\t\tS9,5.6,8.6,6C7.5,7.1,7,8.5,7,10.1C7,11.6,7.7,13.1,8.8,14.2z",
  "M24,28h-2.2l-4-15.6C18.5,11.9,19,11,19,10c0-1.7-1.3-3-3-3s-3,1.3-3,3c0,1,0.5,1.9,1.3,2.4l-4,15.6H8c-0.6,0-1,0.4-1,1\n\t\ts0.4,1,1,1h16c0.6,0,1-0.4,1-1S24.6,28,24,28z M17.6,20h-3.3l1.6-6.3L17.6,20z M13.9,22c0,0,0.1,0,0.1,0h4c0.1,0,0.1,0,0.1,0l1.6,6\n\t\th-7.4L13.9,22z",
];

export default function SiteTowerIcon({ size = 12, color = "#0E9488" }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill={color}>
      {SITE_TOWER_PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
