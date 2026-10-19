import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Bundled with the app (Inter 4.1, SIL OFL 1.1); served from this server, never fetched from the internet.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Spending Classifier",
  description: "Categorize your BCA e-statement PDF or bank-statement CSV locally. Nothing is stored.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
