import { notFound } from "next/navigation";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import CandidateReviewClient from "./CandidateReviewClient";

export default function CandidateReviewPage() {
  if (!isAdminPanelEnabled()) notFound();
  return <CandidateReviewClient />;
}
