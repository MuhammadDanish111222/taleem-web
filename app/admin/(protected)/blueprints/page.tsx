import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import BlueprintAdminClient from "./BlueprintAdminClient";

export default function BlueprintPage() {
  if (!isAdminPanelEnabled()) notFound();
  return <BlueprintAdminClient />;
}
