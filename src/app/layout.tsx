import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
});

// Ikona zakładki: src/app/icon.png (konwencja Next.js App Router — generuje
// właściwy <link rel="icon"> automatycznie, więc nie trzeba go tu deklarować
// ręcznie). Usunięty src/app/favicon.ico (domyślna ikonka Vercel ze
// scaffoldu) wcześniej wygrywał z tym w karcie przeglądarki.
export const metadata: Metadata = {
  title: "City Sports",
  description: "System zarządzania City Sports — grafik, sprzątanie, godziny, zadania.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
