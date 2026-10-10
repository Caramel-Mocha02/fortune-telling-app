import type { Metadata } from "next";
import { Shippori_Mincho_B1, Zen_Maru_Gothic } from "next/font/google";
import { Nav } from "@/components/nav";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import "./globals.css";

const zenMaru = Zen_Maru_Gothic({ variable: "--font-zen-maru", subsets: ["latin"], weight: ["400", "500", "700"] });
const shippori = Shippori_Mincho_B1({ variable: "--font-shippori", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${zenMaru.variable} ${shippori.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Nav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 text-xs text-muted sm:pb-6">
          占いは、自分を見つめ直したり、これからを考えたりするためのヒントです。医療・法律・お金などの大切な判断は、専門家に相談してください。
        </footer>
      </body>
    </html>
  );
}
