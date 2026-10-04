import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, PageTitle } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SetupPage() {
  await connection();
  if (isSupabaseConfigured()) redirect("/");
  return (
    <div>
      <PageTitle sub="データベースの接続設定がまだありません">セットアップ</PageTitle>
      <Card className="space-y-4 text-sm leading-relaxed">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Supabase プロジェクトを用意します (クラウド、または <code>supabase start</code> によるローカル環境)。
          </li>
          <li>
            <code>supabase/migrations/</code> の SQL を適用します (<code>supabase db push</code> または SQL エディタで実行)。
          </li>
          <li>
            <code>.env.example</code> を <code>.env.local</code> にコピーし、<code>NEXT_PUBLIC_SUPABASE_URL</code> と{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>、<code>ANTHROPIC_API_KEY</code> を設定します。
          </li>
          <li>開発サーバーを再起動します。</li>
        </ol>
      </Card>
    </div>
  );
}
