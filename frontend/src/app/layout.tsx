import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vaccine Cold Chain DApp",
  description: "Role-based vaccine cold-chain tracking on Monad"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
