import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import AcademySettingsClient from "./AcademySettingsClient";

export default function AcademySettingsPage() {
  if (!isAdminPanelEnabled()) notFound();
  return <AcademySettingsClient />;
}
