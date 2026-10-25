import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { LocaleProvider } from "@/lib/i18n";
import { PREFS_SCRIPT } from "@/lib/prefs";
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The per-request CSP nonce from src/proxy.ts; reading headers makes every page dynamic.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The head script sets lang and data-theme before React hydrates, so the server's
    // values can differ from the client's on purpose.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
