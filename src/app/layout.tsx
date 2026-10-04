import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({ variable: "--font-noto-sans-jp", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "予測ログ",
  description: "占術による予測と現実を比較・検証し続けるライフログ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Nav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-muted">
          占術による予測は自己理解・内省・仮説形成のためのものです。医療・法律・投資などの判断の根拠にはしないでください。
        </footer>
      </body>
    </html>
  );
}
