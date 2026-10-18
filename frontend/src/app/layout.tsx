import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spending Classifier",
  description: "Categorize your bank-statement CSV locally. Nothing is stored.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
