import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import { TestGeneratorClient } from "@/components/tests/TestGeneratorClient";

export const metadata: Metadata = { title: "Test Paper Generator | Taleem AI", description: "Generate and download a printable Taleem test paper." };

export default function TestGeneratorPage() { return <TestGeneratorClient />; }
