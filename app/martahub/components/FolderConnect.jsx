"use client";
// Panel "Hubungkan Folder" generik — dipakai fitur mana pun yang perlu baca
// SATU file dari folder lokal secara berkala (Validasi Lokasi/Outlet Lat/Lng
// Master, Validity MSISDN, dst.), sumber dari lib/useFolderConnection.js.
// Gaya visual konsisten dengan ConnectSourceSection di SumatraMap.jsx (fitur
// peta) — tapi generik, tidak terikat konsep layer peta.
import { periodFromName, periodKeyFromName } from "../../../lib/geoImport";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const ERR = "#C62828";

function Icon({ name, size = 15, color = "currentColor" }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const p = { fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    folder: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>,
    calendar: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    refresh: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
    trash: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
    shield: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  };
  return icons[name] || null;
}

const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";

/**
 * @param t          token warna (butuh: card,hover,line,hi,mid,lo)
 * @param source     hasil useFolderConnection()
 * @param color      warna aksen (mis. warna primary halaman ini)
 * @param acceptAttr accept string utk <input type=file> fallback
 * @param extLabel   label ekstensi utk pesan bantuan, mis. ".xlsx/.xls/.csv"
 * @param gradient   true → tombol utama pakai gradient primary, false → outline `color`
 */
export function FolderConnectPanel({ t, source, color = "#ED1C24", acceptAttr, extLabel, gradient = true }) {
  const { supportsFolderLink: ok, folder, busy, err, fileRef, onPickFallback, connect, reauthorize, refresh, disconnect, pickFile } = source;
  const btnBase = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 38, borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.85 : 1, fontFamily: FONT, padding: "0 16px" };
  const primaryStyle = { border: "none", background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff" };
  const outlineStyle = { border: `1px solid ${color}`, background: "transparent", color };

  let body;
  if (!ok) {
    body = (<>
      <input ref={fileRef} type="file" accept={acceptAttr} onChange={onPickFallback} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...btnBase, ...(gradient ? primaryStyle : outlineStyle) }}>
        <Icon name="folder" size={15} color={gradient ? "#fff" : color} /> {busy ? "Memproses…" : "Pilih berkas (perangkat ini)"}
      </button>
      <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, marginTop: 8 }}>
        Browser ini tidak mendukung &ldquo;Hubungkan Folder&rdquo; (butuh Chrome/Edge) — pilih berkas manual tiap sesi, tetap diproses 100% lokal, tidak pernah dikirim ke server.
      </div>
    </>);
  } else if (!folder) {
    body = (<>
      <button onClick={connect} disabled={busy} style={{ ...btnBase, ...(gradient ? primaryStyle : outlineStyle) }}>
        <Icon name="folder" size={15} color={gradient ? "#fff" : color} /> {busy ? "Memproses…" : "Hubungkan Folder"}
      </button>
      <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, marginTop: 8 }}>
        Pilih folder yang berisi berkas {extLabel} — periode terdeteksi otomatis dari nama file. Sesi berikutnya tinggal beri izin ulang, bukan pilih ulang dari nol.
      </div>
    </>);
  } else if (folder.needsPermission) {
    body = (<>
      <div style={{ fontSize: 10.5, color: "#8a5b00", background: "#FFFDE7", border: "1px solid #F0E3B0", borderRadius: 9, padding: "8px 10px", marginBottom: 8, lineHeight: 1.5 }}>
        Folder <b>{folder.name}</b> pernah terhubung, tapi izin browser perlu di-refresh (wajar setelah logout/login atau sesi baru).
      </div>
      <button onClick={reauthorize} disabled={busy} style={{ ...btnBase, ...primaryStyle }}>
        <Icon name="shield" size={14} color="#fff" /> {busy ? "Memproses…" : "Berikan Izin Ulang"}
      </button>
    </>);
  } else {
    const filesWithMeta = (folder.files || []).map((f) => ({ ...f, period: periodFromName(f.name), periodKey: periodKeyFromName(f.name) }));
    const sortedFiles = filesWithMeta.slice().sort((a, b) => {
      if (a.periodKey && b.periodKey) return b.periodKey.localeCompare(a.periodKey);
      if (a.periodKey || b.periodKey) return a.periodKey ? -1 : 1;
      return b.lastModified - a.lastModified;
    });
    body = (<>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}14`, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="folder" size={14} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={folder.name}>{folder.name}</div>
          <div style={{ fontSize: 9.5, color: t.lo }}>Folder tersambung</div>
        </div>
        <button onClick={refresh} disabled={busy} title="Refresh dari folder"
          style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: busy ? "default" : "pointer", flexShrink: 0 }}>
          <Icon name="refresh" size={13} color={t.mid} />
        </button>
        <button onClick={disconnect} disabled={busy} title="Putuskan folder"
          style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${ERR}30`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: ERR, cursor: busy ? "default" : "pointer", flexShrink: 0 }}>
          <Icon name="trash" size={13} color={ERR} />
        </button>
      </div>
      {sortedFiles.length > 0 ? (<>
        <div style={{ fontSize: 10, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5, display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="calendar" size={11} color={t.mid} /> Periode
        </div>
        <select
          value={folder.activeFile || ""}
          disabled={busy}
          onChange={(e) => { const f = sortedFiles.find((x) => x.name === e.target.value); if (f) pickFile(f); }}
          style={{ width: "100%", padding: "8px 30px 8px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: busy ? "default" : "pointer", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", backgroundSize: 13 }}>
          {sortedFiles.map((f) => <option key={f.name} value={f.name}>{f.period || f.name}</option>)}
        </select>
        <div style={{ fontSize: 10, color: t.lo, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={folder.activeFile || ""}>
          {busy ? "Memproses…" : (folder.activeFile ? <>Berkas: <b style={{ color: t.mid }}>{folder.activeFile}</b></> : "Belum ada berkas dimuat")}
        </div>
      </>) : (
        <div style={{ fontSize: 11, color: t.lo, padding: "6px 0" }}>Tidak ada berkas yang cocok di folder ini ({extLabel}).</div>
      )}
    </>);
  }

  return (<>
    {body}
    {err && <div style={{ fontSize: 11, color: ERR, background: "#FFEBEE", border: `1px solid ${ERR}30`, borderRadius: 8, padding: "7px 9px", marginTop: 8 }}>{err}</div>}
  </>);
}
