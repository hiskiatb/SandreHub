// lib/reportMerge/settings.js
// Helper baca/tulis key-value di rm_app_settings, dipakai semua route
// app/api/report-merge/settings*. Mekanis: port dari getSetting/setSetting
// dkk di server.js standalone, tanpa mengubah logikanya — cuma diadaptasi
// jadi terima `supabaseAdmin` (dari requireReportMergeAccess) alih-alih
// pakai client module-level.

import crypto from "crypto";

const APPROVER_EMAIL_FALLBACK = (process.env.APPROVER_EMAIL || "").trim();

export async function getSetting(supabaseAdmin, key) {
  const { data } = await supabaseAdmin.from("rm_app_settings").select("value").eq("key", key).maybeSingle();
  return data ? data.value : null;
}

export async function setSetting(supabaseAdmin, key, value) {
  const { error } = await supabaseAdmin
    .from("rm_app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getEffectiveApproverEmail(supabaseAdmin) {
  const fromDb = await getSetting(supabaseAdmin, "approver_email");
  return (fromDb && fromDb.trim()) || APPROVER_EMAIL_FALLBACK;
}

export async function getLetterSignerDefaults(supabaseAdmin) {
  const raw = await getSetting(supabaseAdmin, "letter_signers");
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
  const signers = Array.isArray(parsed && parsed.signers) ? parsed.signers : [];
  const out = { KOTA: (parsed && parsed.kota) || "", KOTA_SURAT: (parsed && parsed.kota) || "" };
  signers.slice(0, 4).forEach((sg, i) => {
    const n = i + 1;
    if (sg && sg.name) out[`SIGNER_${n}_NAME`] = sg.name;
    if (sg && sg.title) out[`SIGNER_${n}_TITLE`] = sg.title;
    if (sg && sg.nik) out[`SIGNER_${n}_NIK`] = sg.nik;
    out[`SIGNER_${n}_ROLE`] = (sg && sg.role) || (i === 0 ? "Proposed by:" : "Approved by:");
  });
  return out;
}

export async function withLetterSignerDefaults(supabaseAdmin, templateConfig) {
  const signerDefaults = await getLetterSignerDefaults(supabaseAdmin);
  return { ...signerDefaults, ...(templateConfig || {}) };
}

export async function getAllMemoFieldMemory(supabaseAdmin) {
  const raw = await getSetting(supabaseAdmin, "memo_fields");
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

function addToOptionList(options, value) {
  const list = Array.isArray(options) ? options.slice() : [];
  if (value && !list.includes(value)) list.push(value);
  return list;
}

export async function saveMemoFieldMemory(supabaseAdmin, templateCode, fields) {
  const all = await getAllMemoFieldMemory(supabaseAdmin);
  const prev = all[templateCode] || {};
  const kepada = String((fields && fields.kepada) || "").trim();
  const dari = String((fields && fields.dari) || "").trim();
  const kepadaOptions = addToOptionList(prev.kepadaOptions, kepada);
  const dariOptions = addToOptionList(prev.dariOptions, dari);
  all[templateCode] = {
    noSurat: String((fields && fields.noSurat) || ""),
    hal: String((fields && fields.hal) || ""),
    referensi: String((fields && fields.referensi) || ""),
    kepada,
    dari,
    kepadaOptions,
    dariOptions,
    // Narasi bebas & kolom tabel (alur surat fleksibel) — kalau tidak
    // dikirim, nilai lama dipertahankan.
    introText: (fields && fields.introText !== undefined) ? String(fields.introText) : (prev.introText || ""),
    closingText: (fields && fields.closingText !== undefined) ? String(fields.closingText) : (prev.closingText || ""),
    tableCols: Array.isArray(fields && fields.tableCols) ? fields.tableCols : (prev.tableCols || []),
  };
  await setSetting(supabaseAdmin, "memo_fields", JSON.stringify(all));
  return all[templateCode];
}

export async function addMemoFieldOption(supabaseAdmin, templateCode, field, value) {
  const optionsKey = field === "dari" ? "dariOptions" : "kepadaOptions";
  const all = await getAllMemoFieldMemory(supabaseAdmin);
  const prev = all[templateCode] || { noSurat: "", hal: "", kepada: "", dari: "", kepadaOptions: [], dariOptions: [] };
  const options = addToOptionList(prev[optionsKey], value);
  all[templateCode] = { ...prev, [optionsKey]: options };
  await setSetting(supabaseAdmin, "memo_fields", JSON.stringify(all));
  return all[templateCode];
}

/* ---------- Daftar approver tersimpan (dipilih PER SURAT) ----------
 * rm_app_settings key 'approver_list' = [{ id, name, email }] */
export async function getApproverList(supabaseAdmin) {
  const raw = await getSetting(supabaseAdmin, "approver_list");
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

export async function saveApprover(supabaseAdmin, id, name, email) {
  const emailNorm = String(email || "").trim();
  if (!emailNorm) throw new Error("Email approver kosong.");
  const list = await getApproverList(supabaseAdmin);
  let idx = id ? list.findIndex((a) => a.id === id) : -1;
  if (idx < 0) idx = list.findIndex((a) => String(a.email || "").toLowerCase() === emailNorm.toLowerCase());
  const entry = {
    id: idx >= 0 ? list[idx].id : crypto.randomBytes(8).toString("hex"),
    name: String(name || "").trim(),
    email: emailNorm,
  };
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  await setSetting(supabaseAdmin, "approver_list", JSON.stringify(list));
  return { entry, list };
}

export async function deleteApprover(supabaseAdmin, id) {
  const list = await getApproverList(supabaseAdmin);
  const filtered = list.filter((a) => a.id !== id);
  await setSetting(supabaseAdmin, "approver_list", JSON.stringify(filtered));
  return filtered;
}

/* ---------- Template narasi bernama (paragraf pembuka + penutup) ----------
 * rm_app_settings key 'narrative_templates' =
 * [{ id, name, introText, closingText, updatedAt }] */
export async function getNarrativeTemplates(supabaseAdmin) {
  const raw = await getSetting(supabaseAdmin, "narrative_templates");
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

export async function saveNarrativeTemplate(supabaseAdmin, id, name, introText, closingText) {
  const list = await getNarrativeTemplates(supabaseAdmin);
  const idx = id ? list.findIndex((t) => t.id === id) : -1;
  const entry = {
    id: id && idx >= 0 ? id : crypto.randomBytes(8).toString("hex"),
    name: String(name || "").trim(),
    introText: String(introText || ""),
    closingText: String(closingText || ""),
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  await setSetting(supabaseAdmin, "narrative_templates", JSON.stringify(list));
  return entry;
}

export async function deleteNarrativeTemplate(supabaseAdmin, id) {
  const list = await getNarrativeTemplates(supabaseAdmin);
  const filtered = list.filter((t) => t.id !== id);
  await setSetting(supabaseAdmin, "narrative_templates", JSON.stringify(filtered));
  return filtered;
}
