// lib/reportMerge/settings.js
// Helper baca/tulis key-value di rm_app_settings, dipakai semua route
// app/api/report-merge/settings*. Mekanis: port dari getSetting/setSetting
// dkk di server.js standalone, tanpa mengubah logikanya — cuma diadaptasi
// jadi terima `supabaseAdmin` (dari requireReportMergeAccess) alih-alih
// pakai client module-level.

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
