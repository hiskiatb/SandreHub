"use client";
/**
 * /martahub/m/activities/[id]/submit - Submit Laporan Actual (web mobile),
 * setara submit_actual_screen.dart. Cakupan iterasi ini:
 *   - MSISDN per jenis (SP/FWA): ketik manual + scan kamera QR kartu SIM
 *     via jsQR (decoder JS murni, SEMUA browser termasuk Safari/iOS - lihat
 *     _shared/QrScanSheet.jsx; sebelumnya pakai BarcodeDetector API native
 *     yg cuma didukung Chrome/Edge Android, jadi tombol scan otomatis
 *     hilang/"belum aktif" di banyak perangkat lain).
 *   - Cek kepemilikan MSISDN (mh_dsf_check_msisdn_owner) + ajukan
 *     pemindahan (mh_dsf_request_msisdn_transfer) kalau nomor sudah ditag
 *     org lain - SAMA PERSIS dgn alur Flutter, bukan disederhanakan.
 *   - Rebuy Pulsa/Data, Cost Actual, Insight.
 *   - submitActual() → status 'pending_validation' → trigger server
 *     otomatis memutuskan approved/revision_actual (TIDAK ada approval
 *     manusia lagi utk fase ini).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Plus, QrCode, Trash2, Loader2, CheckCircle2, AlertTriangle, MapPin, Camera, ImagePlus, Images, X, Receipt, RefreshCw, CardSim, Router, Gauge, FolderClock, Wallet, SignalHigh, Building2 } from "lucide-react";
import supabaseMarta from "../../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../_shared/MobileShell";
import { isValidMsisdn, normalizeMsisdn } from "../../../_shared/msisdn";
import { compressToMaxBytes } from "../../../_shared/imageTools";
import PhotoCollageSheet from "../../../_shared/PhotoCollageSheet";
import QrScanSheet from "../../../_shared/QrScanSheet";
import OrgIdBar from "../../../_shared/OrgIdBar";
import { fetchSalesEntries, deleteSalesEntry } from "../../../_shared/planData";

const CATS = [
  { key: "sp", label: "Catat Penjualan SP", icon: CardSim },
  { key: "fwa", label: "Catat Penjualan FWA", icon: Router },
];

const REBUY_TYPES = [
  { key: "pulsa", label: "Pulsa", icon: Wallet },
  { key: "data", label: "Data", icon: SignalHigh },
];

const MIN_PHOTOS = 1;
const PHOTO_BUCKET = "mh-photos";
// Draft otomatis - hanya data teks/nomor (MSISDN, rebuy, cost, insight)
// yg disimpan; foto TIDAK disertakan krn File/Blob tidak bisa di-serialize
// ke localStorage. Jadi kalau DSF keluar di tengah jalan lalu kembali,
// semua MSISDN yg sudah dicatat otomatis muncul lagi - tinggal foto yg
// perlu diambil ulang.
const draftKey = (id) => `mh_actual_draft_${id}`;

export default function SubmitActualPage() {
  const { id: activityId } = useParams();
  const router = useRouter();
  const { loading, userId, scope } = useMartaSession();

  const [activity, setActivity] = useState(null);
  const [siteLabels, setSiteLabels] = useState([]); // site(s) yg dipilih sebelumnya (Check-In/Create Plan) - array, satu baris per site
  const [types, setTypes] = useState({ sp: [], fwa: [] });
  const [dataLoading, setDataLoading] = useState(true);
  const [err, setErr] = useState("");

  // Satu event bisa dicatat oleh BEBERAPA org_id sekaligus (mis. TL/Head
  // mencatatkan penjualan beberapa DSF di bawahnya dari satu device) - lihat
  // _shared/OrgIdBar.jsx & komentar mh_dsf_submit_sales_entries() di DB.
  // ownOrgId = org_id profil sendiri (auto-seed chip pertama), activeOrgId =
  // org_id yg sedang "aktif" dipilih, distempel ke entry baru yg ditambahkan.
  const [ownOrgId, setOwnOrgId] = useState("");
  const [activeOrgId, setActiveOrgId] = useState("");
  const [selectedType, setSelectedType] = useState({ sp: null, fwa: null });
  const [entries, setEntries] = useState({ sp: [], fwa: [] }); // {msisdn, typeId, typeName, orgId}
  const [pendingTransfers, setPendingTransfers] = useState({ sp: [], fwa: [] });
  const [msisdnInput, setMsisdnInput] = useState({ sp: "", fwa: "" });
  const [msisdnErr, setMsisdnErr] = useState({ sp: null, fwa: null });

  // Rebuy - SEKARANG wajib per-MSISDN juga (bukan cuma dua angka total):
  // masukkan nomor dulu, pilih jenisnya Pulsa/Data, baru masukkan amount-nya.
  const [rebuyEntries, setRebuyEntries] = useState([]); // {msisdn, type:'pulsa'|'data', amount}
  const [rebuyMsisdn, setRebuyMsisdn] = useState("");
  const [rebuyType, setRebuyType] = useState(null);
  const [rebuyAmount, setRebuyAmount] = useState("");
  const [rebuyErr, setRebuyErr] = useState(null);
  const rebuyPulsaTotal = rebuyEntries.filter((r) => r.type === "pulsa").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rebuyDataTotal = rebuyEntries.filter((r) => r.type === "data").reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const [costActual, setCostActual] = useState("0");
  const [insight, setInsight] = useState("");

  // Dokumentasi foto - WAJIB minimal 2 sebelum bisa kirim (sama persis
  // dgn `_minPhotos`/`_docsValid` di submit_actual_screen.dart Flutter).
  const [photos, setPhotos] = useState([]); // {file, previewUrl}
  const [uploadProgress, setUploadProgress] = useState(null); // {done, total}
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [collageOpen, setCollageOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  function addPhotoFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }
  function removePhoto(i) {
    setPhotos((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); });
  }
  // Hasil kolase (beberapa foto digabung jadi satu) masuk ke daftar photos
  // yang SAMA - dari sisi upload/hapus/preview diperlakukan sama persis
  // dgn foto tunggal, cuma sumbernya beda (isCollage cuma penanda visual).
  function addCollagePhoto(blob, previewUrl) {
    setPhotos((prev) => [...prev, { file: blob, previewUrl, isCollage: true }]);
    setCollageOpen(false);
  }
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [conflict, setConflict] = useState(null); // { category, typeId, typeName, msisdn, owner }
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [draftReady, setDraftReady] = useState(false); // baru mulai autosave SETELAH draft lama (kalau ada) selesai dibaca

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: a, error: e1 }, { data: sp }, { data: fwa }, { data: profile }] = await Promise.all([
          supabaseMarta.from("mh_activities").select("id,event_name,brand,address,site_id,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,status,checkin_valid").eq("id", activityId).single(),
          supabaseMarta.from("mh_product_types").select("id,name,unit_price").eq("category", "sp").eq("active", true).order("name"),
          supabaseMarta.from("mh_product_types").select("id,name,unit_price").eq("category", "fwa").eq("active", true).order("name"),
          scope?.email ? supabaseMarta.from("mh_profiles").select("dsf_org_id").eq("email", scope.email.toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setActivity(a);
        setTypes({ sp: sp || [], fwa: fwa || [] });
        // Jenis SP/FWA tidak lagi dipilih manual oleh DSF - otomatis pakai
        // jenis pertama yg aktif utk brand ybs (transparan di belakang layar).
        setSelectedType({ sp: sp?.[0]?.id || null, fwa: fwa?.[0]?.id || null });
        if (profile?.dsf_org_id) setOwnOrgId(profile.dsf_org_id);

        // Site yg dipilih sebelumnya (waktu Create Plan/Check-In) - tampilkan
        // nama site-nya (bukan cuma kode) di hero, kalau tersedia.
        try {
          const { data: extraSites } = await supabaseMarta.from("mh_activity_sites").select("site_id").eq("activity_id", activityId);
          const siteIds = Array.from(new Set([a?.site_id, ...(extraSites || []).map((s) => s.site_id)].filter(Boolean)));
          if (siteIds.length > 0) {
            const { data: siteRows } = await supabaseMarta.from("mh_sites").select("site_id,site_name").in("site_id", siteIds);
            const labels = siteIds.map((id) => {
              const row = siteRows?.find((s) => s.site_id === id);
              return row?.site_name ? `${id} · ${row.site_name}` : id;
            });
            if (alive) setSiteLabels(labels);
          }
        } catch { /* best-effort - hero tetap tampil tanpa label site kalau gagal */ }

        // Pulihkan draft (kalau ada) SEBELUM autosave dinyalakan - jadi kalau
        // DSF keluar di tengah pencatatan lalu kembali ke halaman ini,
        // MSISDN/rebuy/cost/insight yg sudah diketik langsung muncul lagi.
        // Draft ini cuma utk nomor yg BELUM tersimpan di DB (localStorage,
        // per-perangkat) - lihat blok fetchSalesEntries() di bawah utk nomor
        // yg SUDAH tercatat (mis. di-booking sebelum event lewat Catat
        // Penjualan di wizard Buat Plan, atau revisi laporan yg dikirim
        // ulang) - keduanya digabung supaya tidak ada nomor yg "hilang".
        try {
          const raw = localStorage.getItem(draftKey(activityId));
          if (raw) {
            const d = JSON.parse(raw);
            if (d.entries) setEntries(d.entries);
            if (d.pendingTransfers) setPendingTransfers(d.pendingTransfers);
            if (d.rebuyEntries) setRebuyEntries(d.rebuyEntries);
            if (d.costActual != null) setCostActual(d.costActual);
            if (d.insight != null) setInsight(d.insight);
          }
        } catch { /* draft rusak/kosong - abaikan, mulai dari kosong */ }

        // Nomor yang SUDAH tercatat di DB utk activity ini - baik dari sesi
        // Isi Laporan sebelumnya (mis. status revision_actual, kirim ulang)
        // maupun dari Catat Penjualan di wizard Buat Plan sebelum event.
        // Ditandai `persisted:true` supaya hapusnya lewat deleteSalesEntry()
        // (RPC) bukan cuma dibuang dari state lokal, dan supaya submit()
        // tidak mengirim ulang nomor yang sudah ada.
        try {
          const rows = await fetchSalesEntries(activityId);
          const byCat = { sp: [], fwa: [] };
          for (const r of rows) {
            if (r.category !== "sp" && r.category !== "fwa") continue;
            const typeList = r.category === "sp" ? sp : fwa;
            const typeObj = (typeList || []).find((t) => t.id === r.product_type_id);
            byCat[r.category].push({
              id: r.id, msisdn: r.msisdn, typeId: r.product_type_id, typeName: typeObj?.name,
              taggedAt: r.tagged_at, orgId: r.org_id, persisted: true,
            });
          }
          if (alive) {
            setEntries((prev) => ({
              sp: [...byCat.sp, ...prev.sp.filter((e) => !byCat.sp.some((p) => p.msisdn === e.msisdn))],
              fwa: [...byCat.fwa, ...prev.fwa.filter((e) => !byCat.fwa.some((p) => p.msisdn === e.msisdn))],
            }));
          }
        } catch { /* best-effort - jangan blokir halaman kalau gagal muat nomor lama */ }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat aktivitas");
      } finally {
        if (alive) { setDataLoading(false); setDraftReady(true); }
      }
    })();
    return () => { alive = false; };
  }, [loading, activityId, scope]);

  // Autosave draft - jalan tiap kali data teks berubah, TAPI baru mulai
  // SETELAH draft lama selesai dipulihkan (`draftReady`), supaya draft lama
  // tidak keburu tertimpa kosong sebelum sempat dibaca.
  useEffect(() => {
    if (!draftReady || !activityId) return;
    try {
      localStorage.setItem(draftKey(activityId), JSON.stringify({ entries, pendingTransfers, rebuyEntries, costActual, insight }));
    } catch { /* localStorage penuh/diblokir - draft best-effort saja */ }
  }, [draftReady, activityId, entries, pendingTransfers, rebuyEntries, costActual, insight]);

  if (loading || dataLoading) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;
  if (err && !activity) return <MobileShell active="activities"><div style={{ padding: 40, textAlign: "center", color: "#C62828", fontSize: 13 }}>{err}</div></MobileShell>;

  function isDuplicateLocal(cat, msisdn) {
    return entries[cat].some((e) => e.msisdn === msisdn) || pendingTransfers[cat].some((p) => p.msisdn === msisdn);
  }

  async function addMsisdn(cat, rawMsisdn) {
    // Jenis sudah diisi otomatis di belakang layar - DSF cukup fokus
    // memasukkan nomor MSISDN, tapi ORG ID Aktif WAJIB dipilih dulu (bisa
    // beda-beda per nomor kalau event ini dicatat oleh beberapa org_id).
    if (!activeOrgId.trim()) { setMsisdnErr((e) => ({ ...e, [cat]: "Pilih ORG ID Aktif dulu sebelum tagging nomor." })); return; }
    const typeId = selectedType[cat];
    const norm = normalizeMsisdn(rawMsisdn);
    if (!isValidMsisdn(norm)) { setMsisdnErr((e) => ({ ...e, [cat]: 'Format MSISDN tidak valid - wajib diawali "62".' })); return; }
    if (isDuplicateLocal(cat, norm)) { setMsisdnErr((e) => ({ ...e, [cat]: "Nomor ini sudah ditambahkan." })); return; }

    const typeObj = types[cat].find((t) => t.id === typeId);
    const entryOrgId = activeOrgId.trim();
    setMsisdnErr((e) => ({ ...e, [cat]: null }));

    // Cek kepemilikan - kalau sudah ditag di event lain, tawarkan pemindahan
    // alih-alih langsung menambahkan (mencegah double-count SP/FWA).
    try {
      const { data: ownerRows } = await supabaseMarta.rpc("mh_dsf_check_msisdn_owner", { p_msisdn: norm });
      const owner = ownerRows && ownerRows.length > 0 ? ownerRows[0] : null;
      if (owner) {
        setConflict({ category: cat, typeId, typeName: typeObj?.name, msisdn: norm, owner, orgId: entryOrgId });
        return;
      }
    } catch {
      // best-effort - kalau cek gagal, tetap lanjut tambahkan (jangan blokir input)
    }

    // Longlat saat tagging TIDAK dicatat lagi - tidak pernah benar-benar
    // dipakai utk validasi apa pun (beda dgn check-in yg divalidasi jarak ke
    // site), jadi cuma menambah izin lokasi yg diminta tanpa manfaat nyata.
    setEntries((prev) => ({ ...prev, [cat]: [...prev[cat], { msisdn: norm, typeId, typeName: typeObj?.name, taggedAt: new Date().toISOString(), orgId: entryOrgId }] }));
    setMsisdnInput((prev) => ({ ...prev, [cat]: "" }));
  }

  async function resolveConflictTransfer() {
    if (!conflict) return;
    try {
      await supabaseMarta.rpc("mh_dsf_request_msisdn_transfer", {
        p_entry_id: conflict.owner.entry_id,
        p_to_activity_id: activityId,
        p_category: conflict.category,
        p_product_type_id: conflict.typeId,
        p_org_id: conflict.orgId,
      });
      setPendingTransfers((prev) => ({ ...prev, [conflict.category]: [...prev[conflict.category], { msisdn: conflict.msisdn }] }));
      setConflict(null);
    } catch (e) {
      setErr(e.message || "Gagal mengajukan pemindahan MSISDN");
    }
  }

  // Hapus HARUS mudah walau nomornya sudah diclaim/tersimpan di DB (bukan
  // cuma yg belum disimpan) - msisdn UNIQUE global di tabel, jadi menghapus
  // adalah satu-satunya cara membebaskan nomor yg salah catat. Optimistic:
  // langsung hilang dari layar, di-rollback (+ pesan error) kalau RPC-nya
  // ternyata gagal (mis. bukan pencatat/pemilik plan-nya).
  async function removeEntry(cat, msisdn) {
    const entry = entries[cat].find((e) => e.msisdn === msisdn);
    if (!entry) return;
    setEntries((prev) => ({ ...prev, [cat]: prev[cat].filter((e) => e.msisdn !== msisdn) }));
    if (entry.persisted && entry.id) {
      try {
        await deleteSalesEntry(entry.id);
      } catch (e) {
        setEntries((prev) => ({ ...prev, [cat]: [...prev[cat], entry] }));
        setErr(e.message || "Gagal menghapus nomor");
      }
    }
  }

  function addRebuyEntry() {
    const norm = normalizeMsisdn(rebuyMsisdn);
    if (!isValidMsisdn(norm)) { setRebuyErr('Format MSISDN tidak valid - wajib diawali "62".'); return; }
    if (!rebuyType) { setRebuyErr("Pilih jenisnya dulu - Pulsa atau Data."); return; }
    const amt = Number(rebuyAmount);
    if (!amt || amt <= 0) { setRebuyErr("Masukkan amount rebuy-nya."); return; }
    if (rebuyEntries.some((r) => r.msisdn === norm && r.type === rebuyType)) { setRebuyErr("Nomor + jenis ini sudah ditambahkan."); return; }
    setRebuyErr(null);
    setRebuyEntries((prev) => [...prev, { msisdn: norm, type: rebuyType, amount: amt }]);
    setRebuyMsisdn(""); setRebuyType(null); setRebuyAmount("");
  }
  function removeRebuyEntry(idx) {
    setRebuyEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (photos.length < MIN_PHOTOS) {
      setErr(`Wajib upload minimal ${MIN_PHOTOS} foto dokumentasi sebelum mengirim laporan.`);
      return;
    }
    if (!costActual || Number(costActual) <= 0) {
      setErr("Cost Actual wajib diisi sebelum mengirim laporan.");
      return;
    }
    setSaving(true); setErr("");
    try {
      const actualSp = entries.sp.length;
      const actualFwa = entries.fwa.length;
      const revenue = [...entries.sp, ...entries.fwa].reduce((sum, e) => {
        const t = [...types.sp, ...types.fwa].find((x) => x.id === e.typeId);
        return sum + (t?.unit_price || 0);
      }, 0);

      const { data, error } = await supabaseMarta.from("mh_activities").update({
        actual_date: new Date().toISOString().slice(0, 10),
        actual_sp: actualSp,
        actual_fwa: actualFwa,
        actual_rebuy_pulsa: rebuyPulsaTotal,
        actual_rebuy_data: rebuyDataTotal,
        actual_rev_3m: revenue,
        cost_actual: Number(costActual) || 0,
        insight: insight.trim() || null,
        status: "pending_validation",
      }).eq("id", activityId).select("status,validation_status,validation_note").single();
      if (error) throw error;

      // Upload foto dokumentasi - SETELAH laporan pokok tersimpan (kalau
      // upload sebagian gagal, laporan tetap tersubmit; sama spt Flutter).
      setUploadProgress({ done: 0, total: photos.length });
      for (let i = 0; i < photos.length; i++) {
        try {
          const blob = await compressToMaxBytes(photos[i].file);
          const path = `${activityId}/${Date.now()}_${i}.jpg`;
          const { error: upErr } = await supabaseMarta.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
          if (upErr) throw upErr;
          await supabaseMarta.from("mh_documents").insert({ activity_id: activityId, uploader_id: userId, storage_path: path, file_type: "photo" });
          supabaseMarta.functions.invoke("media-relay", { body: { bucket: PHOTO_BUCKET, path } }).catch(() => {});
        } catch { /* best-effort per foto, lanjut foto berikutnya */ }
        setUploadProgress({ done: i + 1, total: photos.length });
      }

      // Kirim entries per kelompok kategori+jenis+org_id - best-effort,
      // laporan pokok TETAP tersubmit walau bagian ini gagal (sama spt
      // Flutter). Dikelompokkan per org_id juga (bukan cuma typeId) krn satu
      // event bisa dicatat oleh beberapa org_id sekaligus (lihat OrgIdBar) -
      // mh_dsf_submit_sales_entries cuma menerima SATU p_org_id per panggilan.
      for (const cat of ["sp", "fwa"]) {
        const byGroup = new Map();
        // `persisted` = sudah tercatat di DB sebelumnya (dimuat lewat
        // fetchSalesEntries) - JANGAN dikirim ulang, cuma entry baru yang
        // belum tersimpan yang perlu di-submit di sini.
        for (const e of entries[cat].filter((e) => !e.persisted)) {
          const key = `${e.typeId}|${e.orgId}`;
          if (!byGroup.has(key)) byGroup.set(key, { typeId: e.typeId, orgId: e.orgId, list: [] });
          byGroup.get(key).list.push(e);
        }
        for (const { typeId, orgId: groupOrgId, list } of byGroup.values()) {
          try {
            await supabaseMarta.rpc("mh_dsf_submit_sales_entries", {
              p_activity_id: activityId,
              p_org_id: groupOrgId,
              p_category: cat,
              p_product_type_id: typeId,
              p_entries: list.map((e) => ({ msisdn: e.msisdn, imei: null, tagged_at: e.taggedAt })),
            });
          } catch { /* best-effort, lanjut kelompok berikutnya */ }
        }
      }

      try { localStorage.removeItem(draftKey(activityId)); } catch { /* best-effort */ }
      setResult(data);
    } catch (e) {
      setErr(e.message || "Gagal mengirim laporan");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const validated = result.status === "approved";
    return (
      <MobileShell active="activities">
        <div style={{ padding: "60px 24px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: validated ? "rgba(21,128,61,0.1)" : "rgba(180,83,9,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            {validated ? <CheckCircle2 size={30} color="#15803D" /> : <AlertTriangle size={30} color="#B45309" />}
          </div>
          <div style={{ marginTop: 18, fontSize: 17, fontWeight: 800, color: "#17181C" }}>
            {validated ? "Laporan tervalidasi otomatis" : "Laporan perlu ditinjau"}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#6B6B76", lineHeight: 1.6 }}>
            {result.validation_note || (validated ? "Check-in cocok dengan site event ini." : "Titik check-in tidak cocok dengan site manapun di event ini - approver bisa meninjau manual.")}
          </div>
          <button onClick={() => router.replace(`/martahub/m/activities?open=${activityId}`)}
            style={{ marginTop: 26, width: "100%", height: 48, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
            Selesai
          </button>
        </div>
      </MobileShell>
    );
  }

  const rebuyGrandTotal = rebuyPulsaTotal + rebuyDataTotal;
  const revenueEstimate = [...entries.sp, ...entries.fwa].reduce((sum, e) => {
    const t = [...types.sp, ...types.fwa].find((x) => x.id === e.typeId);
    return sum + (t?.unit_price || 0);
  }, 0) + rebuyGrandTotal;
  const costRatioPct = revenueEstimate > 0 ? Math.round(((Number(costActual) || 0) / revenueEstimate) * 100) : 0;
  const locationLine = activity?.address || null;

  return (
    <MobileShell active="activities">
      {/* Hero card ringkas - identitas event + lokasi, tanpa hiasan berlebih.
          Site id ditaruh sebagai strip TERPISAH di bawahnya (bukan di dalam
          hero) tapi disambung tanpa jarak/garis supaya terasa satu kesatuan
          - hero rounded cuma di atas, strip site rounded cuma di bawah. */}
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 14px) 20px 0" }}>
        <div style={{
          borderRadius: siteLabels.length > 0 ? "22px 22px 0 0" : 22, padding: 18, position: "relative", overflow: "hidden",
          background: "linear-gradient(135deg, #1B1C21 0%, #2A1420 100%)",
        }}>
          <div style={{ position: "absolute", top: -50, right: -30, width: 130, height: 130, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,0,140,0.22), transparent 70%)" }} />

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => router.back()} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
              <ArrowLeft size={15} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#F5A3CB" }}>Laporan Actual</div>
              <div style={{ marginTop: 1, fontSize: 15.5, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activity?.event_name}</div>
              {locationLine && (
                <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <MapPin size={11} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{locationLine}</span>
                </div>
              )}
            </div>
          </div>

          {/* Report grid 2x2 - live sesuai input pengguna */}
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
            <ReportTile icon={CardSim} label="Total SP" value={entries.sp.length} />
            <ReportTile icon={Router} label="Total FWA" value={entries.fwa.length} />
            <ReportTile icon={RefreshCw} label="Total Rebuy" value={`Rp ${rebuyGrandTotal.toLocaleString("id-ID")}`} />
            <ReportTile icon={Gauge} label="Estimasi Cost Ratio" value={`${costRatioPct}%`} />
          </div>
        </div>

        {/* Strip Site ID - kartu berbeda, tapi disambung langsung ke bawah
            hero (tanpa margin/gap, tone warna diteruskan sedikit lebih
            terang) jadi terasa satu kesatuan. Tiap site id baris sendiri
            supaya gampang dibaca walau namanya panjang. */}
        {siteLabels.length > 0 && (
          <div style={{
            borderRadius: "0 0 22px 22px", padding: "12px 18px 14px",
            background: "#241419", borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
              <Building2 size={10} /> Site Dipilih
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {siteLabels.map((label, i) => (
                <div key={i} style={{ fontSize: 12, fontWeight: 700, color: "#fff", wordBreak: "break-word" }}>{label}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>
          <FolderClock size={11} /> Draft MSISDN, rebuy & catatan tersimpan otomatis di perangkat ini
        </div>

        {/* ORG ID Aktif - satu kontrol dipakai bareng utk kategori SP & FWA
            di bawahnya (persis pola Tagging Nomor di wizard Buat Plan):
            pilih/tambah org_id di sini dulu, baru scan/catat nomornya. */}
        <Card accent>
          <OrgIdBar value={activeOrgId} onChange={setActiveOrgId} ownOrgId={ownOrgId} ownLabel={scope?.fullName} />
        </Card>

        {CATS.map((c) => (
          <SalesSection key={c.key} cat={c.key} label={c.label} icon={c.icon}
            types={types[c.key]} selectedType={selectedType[c.key]} onSelectType={(v) => setSelectedType((s) => ({ ...s, [c.key]: v }))}
            input={msisdnInput[c.key]} onInputChange={(v) => setMsisdnInput((s) => ({ ...s, [c.key]: v }))}
            onAdd={() => addMsisdn(c.key, msisdnInput[c.key])}
            entries={entries[c.key]} onRemove={(m) => removeEntry(c.key, m)}
            pending={pendingTransfers[c.key]} error={msisdnErr[c.key]}
            onScanResult={(msisdn) => addMsisdn(c.key, msisdn)}
          />
        ))}

        {/* Catat Penjualan Rebuy - SEKARANG wajib per-MSISDN: nomor dulu,
            baru pilih jenis (Pulsa/Data), baru amount-nya. */}
        <RebuySection
          msisdn={rebuyMsisdn} onMsisdnChange={setRebuyMsisdn}
          type={rebuyType} onTypeChange={setRebuyType}
          amount={rebuyAmount} onAmountChange={setRebuyAmount}
          onAdd={addRebuyEntry} error={rebuyErr}
          entries={rebuyEntries} onRemove={removeRebuyEntry}
          pulsaTotal={rebuyPulsaTotal} dataTotal={rebuyDataTotal}
        />

        <Card accent>
          <SectionHeading icon={Receipt} title="Cost & Insight" subtitle="Biaya aktual dan catatan lapangan" />
          <Divider />
          <FieldLabel text="Cost Actual" required top />
          <NumberInput value={costActual} onChange={setCostActual} prefix="Rp" />
          {(!costActual || Number(costActual) <= 0) && <FieldError text="Cost Actual wajib diisi (tidak boleh 0)." />}
          <FieldLabel text="Insight" top hint="Opsional" />
          <TextInput value={insight} onChange={setInsight} placeholder="Catatan/insight dari lapangan…" multiline />
        </Card>

        {/* Dokumentasi Foto - satu grid rapi, ketuk kotak "+" utk pilih
            sumbernya (Kamera/Galeri/Kolase) - bukan lagi 3 tombol terpisah
            di atas grid. */}
        <Card accent>
          <SectionHeading icon={Images} title="Dokumentasi Foto" subtitle={`Minimal ${MIN_PHOTOS} foto · ${photos.length} terpilih`} />
          <Divider />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#F0F0F3" }}>
                <img src={p.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {p.isCollage && (
                  <span style={{ position: "absolute", bottom: 5, left: 5, display: "flex", alignItems: "center", gap: 3, fontSize: 8.5, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: "2px 6px" }}>
                    <Images size={9} /> Kolase
                  </span>
                )}
                <button onClick={() => removePhoto(i)}
                  style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={13} color="#fff" />
                </button>
              </div>
            ))}
            <button onClick={() => setPhotoPickerOpen(true)}
              style={{
                aspectRatio: "1", borderRadius: 12, border: "1.5px dashed #D8D9E0", background: "#F6F7F9",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                color: "#8A8A96", cursor: "pointer", fontFamily: FF,
              }}>
              <ImagePlus size={18} />
              <span style={{ fontSize: 9.5, fontWeight: 700 }}>Tambah</span>
            </button>
          </div>

          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple hidden
            onChange={(e) => { addPhotoFiles(e.target.files); e.target.value = ""; }} />
          <input ref={galleryInputRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { addPhotoFiles(e.target.files); e.target.value = ""; }} />
          {collageOpen && <PhotoCollageSheet onClose={() => setCollageOpen(false)} onDone={addCollagePhoto} />}
          {photoPickerOpen && (
            <PhotoSourceSheet
              onClose={() => setPhotoPickerOpen(false)}
              onCamera={() => { setPhotoPickerOpen(false); cameraInputRef.current?.click(); }}
              onGallery={() => { setPhotoPickerOpen(false); galleryInputRef.current?.click(); }}
              onCollage={() => { setPhotoPickerOpen(false); setCollageOpen(true); }}
            />
          )}

          {photos.length < MIN_PHOTOS && (
            <FieldError text={`Wajib tambahkan minimal ${MIN_PHOTOS} foto dokumentasi sebelum mengirim laporan.`} />
          )}
          {uploadProgress && uploadProgress.done < uploadProgress.total && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>Mengunggah foto {uploadProgress.done}/{uploadProgress.total}…</div>
          )}
        </Card>
      </div>

      {(() => {
        const photosMissing = photos.length < MIN_PHOTOS;
        const costMissing = !costActual || Number(costActual) <= 0;
        const blocked = photosMissing || costMissing;
        const label = photosMissing ? "Tambahkan Foto Dokumentasi" : costMissing ? "Isi Cost Actual dulu" : "Kirim Laporan";
        return (
          <div style={{ position: "sticky", bottom: 66, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", padding: "16px 20px 0" }}>
            <button onClick={submit} disabled={saving || blocked}
              style={{ width: "100%", height: 52, borderRadius: 14, border: "none", cursor: (saving || blocked) ? "default" : "pointer", background: (saving || blocked) ? "#D8D9E0" : BRAND, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: (saving || blocked) ? "none" : "0 4px 14px rgba(17,17,20,0.11)" }}>
              {saving ? <Loader2 size={17} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={18} />}
              {saving ? (uploadProgress ? `Mengunggah foto ${uploadProgress.done}/${uploadProgress.total}…` : "Mengirim…") : label}
            </button>
          </div>
        );
      })()}

      {conflict && (
        <ConflictSheet conflict={conflict} onClose={() => setConflict(null)} onConfirm={resolveConflictTransfer} />
      )}
    </MobileShell>
  );
}

// ═══════════════════════════════ Sections ══════════════════════════════════
function SalesSection({ cat, label, icon, types, selectedType, onSelectType, input, onInputChange, onAdd, entries, onRemove, pending, error, onScanResult }) {
  const [scanning, setScanning] = useState(false);
  const total = entries.length;

  return (
    <Card accent>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeading icon={icon} title={label} subtitle='MSISDN wajib diawali "62"' />
        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: "#ED1C24", background: "rgba(237,28,36,0.08)", padding: "4px 10px", borderRadius: 999 }}>{total} nomor</span>
      </div>
      <Divider />
      {types.length === 0 && <div style={{ marginTop: 10 }}><LockedField text="Belum ada jenis untuk brand Anda - hubungi admin" muted /></div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={input} onChange={(e) => onInputChange(e.target.value)} inputMode="tel"
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Contoh: 628123456789"
          style={{ flex: 1, minWidth: 0, height: 46, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13.5, fontFamily: FF, color: "#17181C", outline: "none" }} />
        <button onClick={() => setScanning(true)} style={{ width: 46, height: 46, borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
          <QrCode size={17} />
        </button>
        <button onClick={onAdd} style={{ width: 46, height: 46, borderRadius: 12, background: BRAND, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 12px rgba(237,28,36,0.25)" }}>
          <Plus size={18} color="#fff" />
        </button>
      </div>
      {error && <FieldError text={error} />}

      {total > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => (
            <MsisdnCard key={e.msisdn} entry={e} onRemove={() => onRemove(e.msisdn)} />
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#B45309" }}>Menunggu persetujuan pemindahan · {pending.length} nomor</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {pending.map((p) => (
              <span key={p.msisdn} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999, background: "#FFF7ED", border: "1px solid #FDE1B8", fontSize: 12, fontWeight: 700, color: "#17181C" }}>{p.msisdn}</span>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "#8A8A96" }}>Belum dihitung ke SP/FWA - akan aktif otomatis setelah disetujui pemilik sebelumnya.</div>
        </div>
      )}

      {scanning && (
        <QrScanSheet
          title={`Scan QR Kartu SIM · ${label}`}
          onClose={() => setScanning(false)}
          onDetect={(msisdn) => { setScanning(false); onScanResult(msisdn); }}
        />
      )}
    </Card>
  );
}

/** Catat Penjualan Rebuy - urutan input SESUAI PERMINTAAN: MSISDN dulu
 * (wajib), baru pilih jenisnya Pulsa/Data, baru masukkan amount-nya,
 * tekan Tambah utk mencatat satu entri. Total Pulsa/Data dihitung
 * otomatis dari daftar entri utk dikirim ke `actual_rebuy_pulsa/data`. */
function RebuySection({ msisdn, onMsisdnChange, type, onTypeChange, amount, onAmountChange, onAdd, error, entries, onRemove, pulsaTotal, dataTotal }) {
  return (
    <Card accent>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeading icon={RefreshCw} title="Catat Penjualan Rebuy" subtitle='MSISDN (wajib diawali "62") → jenis → amount' />
        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: "#C6168D", background: "rgba(236,0,140,0.08)", padding: "4px 10px", borderRadius: 999 }}>{entries.length} entri</span>
      </div>
      <Divider />

      <FieldLabel text="1. MSISDN" top hint='Wajib "62"' />
      <input value={msisdn} onChange={(e) => onMsisdnChange(e.target.value)} inputMode="tel"
        placeholder="Contoh: 628123456789"
        style={{ width: "100%", minWidth: 0, height: 46, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13.5, fontFamily: FF, color: "#17181C", outline: "none", boxSizing: "border-box" }} />

      <FieldLabel text="2. Jenis" top />
      <div style={{ display: "flex", gap: 8 }}>
        {REBUY_TYPES.map((t) => {
          const Icon = t.icon; const active = type === t.key;
          return (
            <button key={t.key} onClick={() => onTypeChange(t.key)}
              style={{
                flex: 1, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                border: `1.5px solid ${active ? "transparent" : "#ECEDF0"}`,
                background: active ? "linear-gradient(135deg,#ED1C24,#EC008C)" : "#F6F7F9",
                color: active ? "#fff" : "#5A5A68", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
                boxShadow: active ? "0 4px 12px rgba(237,28,36,0.22)" : "none",
              }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <FieldLabel text="3. Amount" top />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <NumberInput value={amount} onChange={onAmountChange} prefix="Rp" />
        </div>
        <button onClick={onAdd} style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 12, background: BRAND, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 12px rgba(237,28,36,0.25)" }}>
          <Plus size={18} color="#fff" />
        </button>
      </div>
      {error && <FieldError text={error} />}

      {entries.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e, i) => <RebuyCard key={`${e.msisdn}-${e.type}-${i}`} entry={e} onRemove={() => onRemove(i)} />)}
        </div>
      )}

      {entries.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <MiniTotal label="Total Pulsa" value={pulsaTotal} />
          <MiniTotal label="Total Data" value={dataTotal} />
        </div>
      )}
    </Card>
  );
}

function RebuyCard({ entry, onRemove }) {
  const isPulsa = entry.type === "pulsa";
  const Icon = isPulsa ? Wallet : SignalHigh;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F6F7F9", border: "1px solid #ECEDF0", borderRadius: 14, padding: "10px 8px 10px 12px" }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: isPulsa ? "rgba(237,28,36,0.08)" : "rgba(236,0,140,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} color={isPulsa ? "#ED1C24" : "#C6168D"} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{entry.msisdn}</div>
        <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>{isPulsa ? "Pulsa" : "Data"} · Rp {Number(entry.amount).toLocaleString("id-ID")}</div>
      </div>
      <button onClick={onRemove} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "transparent", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function MiniTotal({ label, value }) {
  return (
    <div style={{ flex: 1, borderRadius: 12, background: "#F6F7F9", border: "1px solid #ECEDF0", padding: "9px 12px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#B0B0BA" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>Rp {Number(value).toLocaleString("id-ID")}</div>
    </div>
  );
}

function ReportTile({ icon: Icon, label, value }) {
  return (
    <div style={{ minWidth: 0, borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={14} color="#F5A3CB" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      </div>
    </div>
  );
}

function Divider() { return <div style={{ height: 1, background: "#EEEEF2", margin: "12px 0 0" }} />; }

function SectionHeading({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {Icon && (
        <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, rgba(237,28,36,0.12), rgba(236,0,140,0.12))", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={16} color="#C6168D" />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function MsisdnCard({ entry, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F6F7F9", border: "1px solid #ECEDF0", borderRadius: 14, padding: "10px 8px 10px 12px" }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MapPin size={15} color="#ED1C24" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{entry.msisdn}</span>
          {/* Badge org_id - satu event bisa dicatat oleh beberapa org_id
              sekaligus, jadi tetap jelas nomor mana milik org_id mana. */}
          {entry.orgId && (
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#C6168D", background: "rgba(198,22,141,0.09)", borderRadius: 999, padding: "2px 6px", flexShrink: 0 }}>{entry.orgId}</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>{entry.typeName || "-"}</div>
      </div>
      <button onClick={onRemove} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "transparent", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/** Muncul SETELAH kotak "+" di grid dokumentasi diketuk - baru di sini
 * pengguna memilih sumber fotonya (Kamera/Galeri/Kolase), bukan 3 tombol
 * terpisah yg selalu tampil di atas grid spt sebelumnya (lebih rapi). */
function PhotoSourceSheet({ onClose, onCamera, onGallery, onCollage }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 65, background: "rgba(13,17,23,0.4)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", fontFamily: FF }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 14px" }} />
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", textAlign: "center", marginBottom: 12 }}>Tambah Dokumentasi</div>
        <div style={{ display: "flex", gap: 8 }}>
          <SourceOption icon={Camera} label="Kamera" onClick={onCamera} />
          <SourceOption icon={ImagePlus} label="Galeri" onClick={onGallery} />
          <SourceOption icon={Images} label="Kolase" onClick={onCollage} />
        </div>
      </div>
    </div>
  );
}
function SourceOption({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ flex: 1, height: 74, borderRadius: 14, border: "1.5px solid #ECEDF0", background: "#F6F7F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", color: "#17181C", fontFamily: FF }}>
      <Icon size={19} />
      <span style={{ fontSize: 12, fontWeight: 800 }}>{label}</span>
    </button>
  );
}

function ConflictSheet({ conflict, onClose, onConfirm }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "22px 22px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={20} color="#B45309" />
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>Nomor sudah ditag orang lain</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#5A5A68", lineHeight: 1.6 }}>
          Nomor <b>{conflict.msisdn}</b> sudah ditandai oleh <b>{conflict.owner.owner_name}</b> pada &ldquo;{conflict.owner.event_name}&rdquo;. Anda bisa mengajukan pemindahan kepemilikan ke event ini - akan aktif setelah disetujui pemilik sebelumnya.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, height: 48, borderRadius: 12, border: "1.5px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>Batal</button>
          <button onClick={onConfirm} style={{ flex: 1.2, height: 48, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>Ajukan Pemindahan</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════ Primitives ════════════════════════════════
function Card({ children, accent }) {
  return (
    <div style={{
      background: "#FFFFFF", border: "1px solid #EEEEF2", borderRadius: 20, padding: 16,
      boxShadow: accent ? "0 2px 14px rgba(23,24,28,0.05)" : "none",
    }}>
      {children}
    </div>
  );
}
function FieldLabel({ text, required, hint, top }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginTop: top ? 16 : 0, marginBottom: 7 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96" }}>{text}</span>
      {required && <span style={{ color: "#ED1C24", fontWeight: 800, marginLeft: 3 }}>*</span>}
      {hint && <span style={{ marginLeft: "auto", fontSize: 10, color: "#B0B0BA", fontWeight: 500 }}>{hint}</span>}
    </div>
  );
}
function FieldError({ text }) { return <div style={{ marginTop: 6, fontSize: 11.5, color: "#DC2626", fontWeight: 600 }}>{text}</div>; }
const inputBase = { width: "100%", minWidth: 0, height: 48, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 14, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };
function TextInput({ value, onChange, placeholder, error, multiline }) {
  const Comp = multiline ? "textarea" : "input";
  return <Comp value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={multiline ? 3 : undefined}
    style={{ ...inputBase, height: multiline ? 84 : 48, paddingTop: multiline ? 12 : 0, resize: multiline ? "vertical" : undefined, border: `1.5px solid ${error ? "#DC2626" : "#ECEDF0"}` }} />;
}
function NumberInput({ value, onChange, prefix }) {
  const display = value === "" ? "" : Number(value).toLocaleString("id-ID");
  return (
    <div style={{ ...inputBase, display: "flex", alignItems: "center" }}>
      {prefix && <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#8A8A96", marginRight: 6 }}>{prefix}</span>}
      <input value={display} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        style={{ flex: 1, minWidth: 0, width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "#17181C", fontFamily: FF }} />
    </div>
  );
}
function Chip({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{ padding: "8px 13px", borderRadius: 999, border: `1.5px solid ${active ? "#ED1C24" : "#ECEDF0"}`, background: active ? "rgba(237,28,36,0.08)" : "#F6F7F9", color: active ? "#ED1C24" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
      {label}
    </button>
  );
}
function LockedField({ text, muted }) {
  return <div style={{ ...inputBase, display: "flex", alignItems: "center", background: muted ? "#F6F7F9" : "rgba(237,28,36,0.06)", color: muted ? "#B0B0BA" : "#5A5A68", border: "none" }}>{text}</div>;
}
