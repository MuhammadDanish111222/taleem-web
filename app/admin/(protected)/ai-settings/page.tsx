import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import AiSettingsClient from "./AiSettingsClient";

export default function AiSettingsPage() {
  if (!isAdminPanelEnabled()) notFound();
  return <AiSettingsClient />;
}
