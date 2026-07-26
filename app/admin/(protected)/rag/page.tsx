import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import RagAdminClient from "./RagAdminClient";

export default function RagAdminPage() {
  if (!isAdminPanelEnabled()) notFound();
  return <RagAdminClient />;
}
