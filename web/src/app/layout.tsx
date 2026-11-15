import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import { Frame } from "@/components/frame";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Osmo on Monad",
  description: "Pay friends in stocks and crypto. They get exactly what you sent, settled on Monad in under a second.",
  appleWebApp: { capable: true, title: "Osmo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f3eee5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <StoreProvider>
          <Frame>{children}</Frame>
        </StoreProvider>
      </body>
    </html>
  );
}
