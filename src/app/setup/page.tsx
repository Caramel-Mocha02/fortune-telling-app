import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, PageTitle } from "@/components/ui";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export default async function SetupPage() {
  await connection();
  if (isSupabaseConfigured()) redirect("/");

  // 値そのものは表示せず、設定されているかどうかだけを示す
  const vars = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", set: SUPABASE_URL !== "" },
    { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", set: SUPABASE_PUBLISHABLE_KEY !== "" },
    { name: "ANTHROPIC_API_KEY", set: Boolean(process.env.ANTHROPIC_API_KEY) },
  ];

  return (
    <div className="space-y-6">
      <PageTitle sub="アプリが Supabase の接続先を受け取れていません">セットアップ</PageTitle>

      <Card className="space-y-2 text-sm">
        <h2 className="font-bold">環境変数の状態</h2>
        <ul className="space-y-1">
          {vars.map((v) => (
            <li key={v.name}>
              <code>{v.name}</code>: {v.set ? "設定済み" : <b className="text-red-600">未設定</b>}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3 text-sm leading-relaxed">
        <h2 className="font-bold">Vercel などで公開している場合</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            プロジェクトの Settings → Environment Variables に、上の 3 つを登録します (名前は完全一致、値に引用符や空白を入れない、Environments は
            Production を含める)。
          </li>
          <li>
            <code>NEXT_PUBLIC_</code> で始まる値はビルド時に組み込まれるため、登録後に Deployments から最新のデプロイを <b>Redeploy</b>{" "}
            します (Use existing Build Cache は外す)。
          </li>
        </ol>
      </Card>

      <Card className="space-y-3 text-sm leading-relaxed">
        <h2 className="font-bold">手元で開発している場合</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <code>.env.example</code> を <code>.env.local</code> にコピーし、上の 3 つを設定します。
          </li>
          <li>開発サーバーを再起動します。</li>
        </ol>
      </Card>
    </div>
  );
}
