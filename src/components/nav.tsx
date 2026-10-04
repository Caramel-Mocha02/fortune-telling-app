import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { todayIn } from "@/lib/time/zoned";

const LINKS = [
  { href: "/", label: "ホーム" },
  { href: "/ask", label: "質問する" },
  { href: "/predictions", label: "タイムライン" },
  { href: "/log", label: "ライフログ" },
  { href: "/palm", label: "手相" },
  { href: "/insights", label: "実績" },
  { href: "/reviews", label: "レビュー" },
  { href: "/profile", label: "プロフィール" },
];

export async function Nav() {
  let signedIn = false;
  let dueCount = 0;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
    if (signedIn) {
      // 答え合わせの期日が来ている件数 (仕様 28: アプリ内通知)
      const { data: profile } = await supabase.from("birth_profiles").select("time_zone").maybeSingle();
      const { count } = await supabase
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .is("completed_at", null)
        .lte("due_on", todayIn(profile?.time_zone ?? "Asia/Tokyo"));
      dueCount = count ?? 0;
    }
  }
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="font-bold text-accent">
          予測ログ
        </Link>
        {signedIn && (
          <>
            <nav className="flex flex-wrap gap-4 text-sm">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="text-muted hover:text-foreground">
                  {l.label}
                  {l.href === "/" && dueCount > 0 && (
                    <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-white" aria-label={`答え合わせ ${dueCount} 件`}>
                      {dueCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
            <form action={signOut} className="ml-auto">
              <button className="text-xs text-muted hover:text-foreground">ログアウト</button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
