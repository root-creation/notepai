import type { Metadata } from "next";
import { Kalam } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const kalam = Kalam({
  variable: "--font-handwriting",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

export const metadata: Metadata = {
  title: "NotePAI",
  description: "AI-integrated notepad",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-KCXVLJTM22"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-KCXVLJTM22');
          `}
        </Script>
      </head>
      <body className={`${kalam.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
