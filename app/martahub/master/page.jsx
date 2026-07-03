"use client";
import MartaShell, { T } from "../components/MartaShell";
import { useGeoLayers, LayerPanel } from "../components/SumatraMap";

// Master Data — pusat semua file yang perlu diupload tiap bulan:
//   • List Site / Titik Site (Excel .xlsb/.xlsx/.csv)
//   • Batas Wilayah / Map SHP (.zip SHP / .kml / .kmz / .geojson)
// Upload dipindahkan ke sini (dulu di tab Map). Peta kini view-only.
export default function MasterDataPage() {
  return (
    <MartaShell active="master" title="Master Data" subtitle="Pusat upload bulanan — List Site & Map SHP. Peta hanya menampilkan hasilnya.">
      {(ctx) => <Body canManage={ctx?.canManage} />}
    </MartaShell>
  );
}

// Theme kompat untuk LayerPanel (butuh: card, line, hi, mid, lo, hover).
const mtT = { card: "#FFFFFF", line: T.line, hi: T.hi, mid: T.mid, lo: T.lo, hover: "#F0F4FA" };

function Body({ canManage }) {
  const geo = useGeoLayers();
  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Upload bulanan (terpusat di sini)</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: T.mid, fontSize: 13.5, lineHeight: 1.7 }}>
          <li><b>List Site / Titik Site</b> — Excel (.xlsb/.xlsx/.csv) berisi koordinat & atribut site.</li>
          <li><b>Batas Wilayah (Map SHP)</b> — .zip (SHP), .kml, .kmz, atau .geojson.</li>
          <li>Setiap upload <b>mengganti</b> data bulan sebelumnya; tersimpan aman di server privat.</li>
        </ul>
        {!canManage && <div style={{ ...note, marginTop: 12 }}>Mode lihat saja — hanya Admin (SPM Sumatera) yang bisa mengunggah.</div>}
      </div>

      {/* Panel upload asli (SHP + Site) dipindahkan dari tab Map ke sini */}
      <LayerPanel t={mtT} geo={geo} canManage={canManage} style={{ boxShadow: "none", maxWidth: 520 }} />
    </div>
  );
}

const card = { background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 };
