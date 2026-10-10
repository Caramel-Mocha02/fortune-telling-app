import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { todayIn } from "@/lib/time/zoned";
import { LogoMark } from "./logo";
import { APP_NAME } from "@/lib/brand";
import { BottomTabs, TopTabs } from "./nav-links";

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
    <>
      <header className="starry-header sticky top-0 z-40">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-serif text-lg font-bold tracking-wide">
            <LogoMark />
            {APP_NAME}
          </Link>
          {signedIn && (
            <>
              <TopTabs dueCount={dueCount} />
              <form action={signOut} className="ml-auto">
                <button className="text-xs opacity-70 hover:opacity-100">ログアウト</button>
              </form>
            </>
          )}
        </div>
      </header>
      {signedIn && <BottomTabs dueCount={dueCount} />}
    </>
  );
}
