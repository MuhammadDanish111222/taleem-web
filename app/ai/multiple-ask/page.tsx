import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import { MultipleAskClient } from "@/components/ai/MultipleAskClient";

export const metadata: Metadata = { title: "Multiple Ask | Taleem AI", description: "Upload or paste one paper and receive ordered, clearly sourced answers." };
export default function MultipleAskPage() { return <MultipleAskClient />; }
