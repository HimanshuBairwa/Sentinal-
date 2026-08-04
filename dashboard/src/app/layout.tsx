import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/layout/AppShell";

export const metadata: Metadata = {
  title: "Sentinel | Fraud Intelligence Command Center",
  description: "Real-time fraud decisioning, threat analytics, and operational telemetry.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
