import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

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
  if (isSupabaseConfigured()) {
    const { data } = await (await createClient()).auth.getClaims();
    signedIn = Boolean(data?.claims);
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
