import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import { SingleAskClient } from "@/components/ai/SingleAskClient";

export const metadata: Metadata = {
  title: "Single Ask | Taleem AI",
  description:
    "Ask a typed English study question and receive a clearly sourced Taleem AI answer.",
};

export default function SingleAskPage() {
  return <SingleAskClient />;
}
