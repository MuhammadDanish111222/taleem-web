import type { Metadata } from "next";
import { connection } from "next/server";
import "katex/dist/katex.min.css";
import { resolveMultipleAskState } from "@/lib/features/multipleAskStateResolver";
import { FeatureLifecycleGate } from "@/components/ui/FeatureLifecycleGate";
import { MultipleAskClient } from "@/components/ai/MultipleAskClient";

export const metadata: Metadata = {
  title: "Multiple Ask | Taleem AI",
  description: "Upload or paste one paper and receive ordered, clearly sourced answers.",
};

export default async function MultipleAskPage() {
  await connection();
  const state = await resolveMultipleAskState();
  return (
    <FeatureLifecycleGate state={state}>
      <MultipleAskClient />
    </FeatureLifecycleGate>
  );
}
