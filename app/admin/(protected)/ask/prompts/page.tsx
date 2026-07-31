import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import PromptAdminClient from "./PromptAdminClient";

export default function PromptAdminPage() {
  if (!isAdminPanelEnabled()) notFound();
  return <PromptAdminClient />;
}
