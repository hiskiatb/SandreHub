"use client";
/**
 * SDP2_Home.jsx — SDP Management (Baru), Registrasi — landing CSE/RSE.
 *
 * Rebuild dari SDP Management lama, hasil diskusi "rombak total":
 *   • Form pengisian & edit TETAP memakai SDP_QuickForm / SDP_RegistrationDetail
 *     yang sudah teruji (validasi, upload dokumen, RLS) — yang di-rebuild di
 *     sini murni lapisan navigasi & visual, bukan menulis ulang logic data.
 *   • Modul lama tidak dihapus — tetap ada sebagai "SDP Management (Archive)".
 *
 * UPDATE (permintaan user - "tidak perlu menampilkan data sdp disini, yang
 * pertama ialah Registrasi SDP, nanti terminasi SDP, Rebordering SDP"):
 * layar "SDP Saya" (daftar + progress tiap SDP yang pernah diajukan)
 * DIHAPUS dari sini — landing sekarang jadi menu PEMILIHAN JENIS AKSI:
 * Registrasi SDP (aktif), Terminasi SDP & Rebordering SDP (segera hadir).
 * Kode list/progress lama TIDAK dihapus dari repo, cuma dipindah ke
 * SDP2_Home_Archive.jsx kalau someday perlu dikembalikan — di sini hanya
 * menu + form registrasi.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useState } from "react";
import { ArrowLeft, FilePlus2, FileMinus2, Shuffle, ChevronRight, Lock, ClipboardCheck, Inbox } from "lucide-react";
import SDP_QuickForm from "./SDP_QuickForm";
import SDP_Drafts from "./SDP_Drafts";
import { SdpHeaderBanner, SDP_GRADIENT_CTA } from "./SDP2_Shared";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.28)" : "rgba(26,158,144,.18)",
  acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.12)" : "rgba(237,28,36,.08)", accBd: d ? "rgba(237,28,36,.28)" : "rgba(237,28,36,.18)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.08)", blueBd: d ? "rgba(10,132,255,.28)" : "rgba(37,99,235,.18)",
  amber: "#C8790A", amberBg: d ? "rgba(255,176,32,.14)" : "rgba(200,121,10,.1)", amberBd: d ? "rgba(255,176,32,.3)" : "rgba(200,121,10,.2)",
  violet: "#7C5CFC", violetBg: d ? "rgba(124,92,252,.14)" : "rgba(124,92,252,.08)", violetBd: d ? "rgba(124,92,252,.3)" : "rgba(124,92,252,.18)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 8px 24px rgba(0,0,0,.5)" : "0 8px 20px rgba(15,17,23,.08)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// Menu jenis aksi SDP — baru "Registrasi SDP" yg aktif, sisanya "segera
// hadir" (ready:false) sampai alurnya dibangun.
const ACTION_MENU = [
  { id: "new", icon: FilePlus2, label: "Registrasi SDP", desc: "Daftarkan SDP baru — ID dibuatkan otomatis.", tint: "violet", ready: true },
  // UPDATE (permintaan user - "tambahkan fitur Draft Form, disini akan
  // menyimpan semua proses yang masih on process, namun ini semua disimpan
  // dengan baik secara online tidak hanya local"): draft SUDAH disimpan ke
  // tabel server `sdp_draft` sejak "Simpan Draft" ditekan (lihat
  // SDP_QuickForm.jsx saveServerDraft()) — localStorage cuma cadangan
  // instan/offline, bukan sumber utama. Menu ini cuma membuka inbox-nya
  // (SDP_Drafts.jsx, sudah ada & sudah online) supaya bisa dilanjutkan.
  { id: "drafts", icon: Inbox, label: "Draft Form", desc: "Lanjutkan pengajuan yang masih berjalan — tersimpan online.", tint: "amber", ready: true },
  // UPDATE (permintaan user - lihat alur "SDP Management (Archive)" yang
  // masih punya Terminate/Remapping dalam satu form "Registrasi & Perubahan
  // SDP": "pindahkan fitur ke modul baru"): dibuka di sini juga, pakai
  // SDP_QuickForm yang SAMA dengan lockRequestType="Terminate"/"Remapping"
  // (bukan komponen baru) — sudah termasuk kotak "Pilih SDP yang akan
  // di-..." & toolbar "Simpan ke server"/"Bagikan & Salin" link.
  { id: "terminate", icon: FileMinus2, label: "Terminasi SDP", desc: "Akhiri kemitraan SDP yang sudah ada.", tint: "acc", ready: true },
  { id: "rebordering", icon: Shuffle, label: "Rebordering SDP", desc: "Pindahkan cakupan kecamatan SDP existing.", tint: "blue", ready: true },
];

function ActionCard({ item, t, onClick }) {
  const [hov, setHov] = useState(false);
  // UPDATE (permintaan user - "buat warnanya tegas dan beda beda"): tiap
  // tint sekarang punya warna solid SENDIRI yang jelas beda satu sama lain
  // (bukan cuma 2 warna terpakai utk 4 kartu spt sebelumnya - Registrasi &
  // Draft Form dulu sama-sama teal) - lihat TINT_SOLID di bawah utk badge
  // ikonnya.
  const TINT_BG = { teal: t.tealBg, acc: t.accBg, amber: t.amberBg, blue: t.blueBg, violet: t.violetBg };
  const TINT_FG = { teal: t.tealD, acc: t.acc, amber: t.amber, blue: t.blue, violet: t.violet };
  const TINT_BD = { teal: t.tealBd, acc: t.accBd, amber: t.amberBd, blue: t.blueBd, violet: t.violetBd };
  const TINT_SOLID = { teal: SDP_GRADIENT_CTA, acc: t.acc, amber: t.amber, blue: t.blue, violet: t.violet };
  const tintBg = TINT_BG[item.tint] ?? t.blueBg;
  const tintFg = TINT_FG[item.tint] ?? t.blue;
  const tintBd = TINT_BD[item.tint] ?? t.blueBd;
  const tintSolid = TINT_SOLID[item.tint] ?? t.blue;
  const Icon = item.icon;
  return (
    <button onClick={item.ready ? onClick : undefined}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14, textAlign: "left", width: "100%",
        padding: "18px 20px", borderRadius: 16, border: `1px solid ${hov && item.ready ? tintBd : t.line}`,
        background: t.card, cursor: item.ready ? "pointer" : "not-allowed", opacity: item.ready ? 1 : 0.55,
        boxShadow: hov && item.ready ? t.md : t.sm, transition: "box-shadow .15s, border-color .15s", fontFamily: FF,
      }}>
      {/* UPDATE (permintaan user - "buat warnanya tegas dan beda beda"):
          SEMUA kartu yang READY dapat badge ikon warna SOLID & tegas sesuai
          tint masing² (bukan cuma Registrasi SDP/teal spt sebelumnya) -
          kartu "segera hadir" tetap tint datar pastel biasa
          (secondary/disabled, TIDAK dibuat seolah bisa diklik). */}
      <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: item.ready ? tintSolid : tintBg, color: item.ready ? "#fff" : tintFg }}>
        <Icon size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.hi }}>{item.label}</div>
          {!item.ready && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: t.mid, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 99, padding: "2px 8px" }}>
              <Lock size={9} /> Segera hadir
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3 }}>{item.desc}</div>
      </div>
      {item.ready && <ChevronRight size={17} color={t.lo} style={{ flexShrink: 0 }} />}
    </button>
  );
}

export default function SDP2_Home({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const [screen, setScreen] = useState("menu"); // menu | new | terminate | rebordering | drafts | resume
  const [draftToOpen, setDraftToOpen] = useState(null);

  if (screen === "new") {
    return (
      <SDP_QuickForm supabase={supabase} theme={theme} profile={profile} lockRequestType="New"
        onExit={() => setScreen("menu")} />
    );
  }

  if (screen === "terminate") {
    return (
      <SDP_QuickForm supabase={supabase} theme={theme} profile={profile} lockRequestType="Terminate"
        onExit={() => setScreen("menu")} />
    );
  }

  if (screen === "rebordering") {
    return (
      <SDP_QuickForm supabase={supabase} theme={theme} profile={profile} lockRequestType="Remapping"
        onExit={() => setScreen("menu")} />
    );
  }

  if (screen === "drafts") {
    return (
      <SDP_Drafts supabase={supabase} theme={theme} profile={profile}
        onOpen={(dr) => { setDraftToOpen(dr); setScreen("resume"); }}
        onExit={() => setScreen("menu")} />
    );
  }

  if (screen === "resume") {
    return (
      <SDP_QuickForm supabase={supabase} theme={theme} profile={profile} initialDraft={draftToOpen}
        onExit={() => { setDraftToOpen(null); setScreen("menu"); }} />
    );
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi, width: "100%", maxWidth: 640 }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 20 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      {/* UPDATE (permintaan user - "buatkan style gradient teal->gelap utk
          semua menu SDP Management"): judul polos diganti SdpHeaderBanner
          seragam dgn layar lain di modul ini. */}
      <SdpHeaderBanner icon={ClipboardCheck} title="Form SDP" subtitle="Pilih jenis pengajuan yang ingin Anda lakukan." />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ACTION_MENU.map((item) => (
          <ActionCard key={item.id} item={item} t={t} onClick={() => setScreen(item.id)} />
        ))}
      </div>
    </div>
  );
}
