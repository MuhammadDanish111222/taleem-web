import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Taleem AI",
  description: "AI-powered education platform for Punjab & Federal Boards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
