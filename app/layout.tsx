import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taleem AI",
  description: "AI-powered education platform for Punjab & Federal Boards",
};

import { AuthProvider } from "../components/AuthProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
