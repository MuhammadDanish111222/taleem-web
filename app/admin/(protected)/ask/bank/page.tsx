import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import ApprovedBankClient from "./ApprovedBankClient";

export default function ApprovedBankPage() {
  if (!isAdminPanelEnabled()) notFound();
  return <ApprovedBankClient />;
}
