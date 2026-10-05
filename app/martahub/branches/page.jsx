"use client";
/**
 * /martahub/branches - Kelola Cabang. Thin page wrapper - logic & UI
 * sesungguhnya ada di BranchesBody.jsx (file terpisah, BUKAN page.jsx)
 * krn Next.js 16 menolak page.jsx yang export selain default (lihat
 * error build "BranchesBody is not a valid Page export field").
 * assignments/page.jsx (dan siapa pun lain) import BranchesBody LANGSUNG
 * dari ./BranchesBody, bukan dari sini.
 */
import MartaShell from "../components/MartaShell";
import { BranchesBody } from "./BranchesBody";

export default function BranchesPage() {
  return (
    <MartaShell active="branches" title="Kelola Cabang" subtitle="Master data cabang (branch) per region - sumber tunggal dipakai User Management, Activity Plan, Map, dst.">
      {(ctx) => <BranchesBody canManage={ctx?.canManage} />}
    </MartaShell>
  );
}
