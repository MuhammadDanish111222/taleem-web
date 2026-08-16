import type { Metadata } from "next";
import { connection } from "next/server";
import "katex/dist/katex.min.css";
import { resolveTestGenerationState } from "@/lib/features/testGenerationStateResolver";
import { FeatureLifecycleGate } from "@/components/ui/FeatureLifecycleGate";
import { TestGeneratorClient } from "@/components/tests/TestGeneratorClient";

export const metadata: Metadata = {
  title: "Test Paper Generator | Taleem AI",
  description: "Generate and download a printable Taleem test paper.",
};

export default async function TestGeneratorPage() {
  await connection();
  const state = await resolveTestGenerationState();
  return (
    <FeatureLifecycleGate state={state}>
      <TestGeneratorClient />
    </FeatureLifecycleGate>
  );
}
