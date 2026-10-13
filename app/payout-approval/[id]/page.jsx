// /payout-approval/[id] — halaman review approval dokumen Payout (link dari email). Wajib login.
import ApprovalReview from "./ApprovalReview";

export const metadata = { title: "Document Approval · SandraHub" };

export default async function Page({ params }) {
  const { id } = await params;
  return <ApprovalReview id={id} />;
}
