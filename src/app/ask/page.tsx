import Link from "next/link";
import { Card, PageTitle, formatDate } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/domain/taxonomy";
import { AskForm } from "./ask-form";

// その場での手相の登録 (Claude による画像の読み取り) に数十秒かかるため
export const maxDuration = 120;


export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const parentId = typeof sp.reforecast === "string" ? sp.reforecast : null;

  const { data: profile } = await supabase.from("birth_profiles").select("user_id").maybeSingle();
  if (!profile) {
    return (
      <Card>
        <p className="text-sm">
          予測には生年月日が必要です。<Link href="/profile" className="text-accent underline">プロフィールを登録</Link>してください。
        </p>
      </Card>
    );
  }

  let defaultQuestion = "";
  if (parentId) {
    const { data } = await supabase.from("predictions").select("questions(text)").eq("id", parentId).maybeSingle();
    defaultQuestion = (data?.questions as unknown as { text: string } | null)?.text ?? "";
  }

  const { data: recent } = await supabase
    .from("questions")
    .select("id, text, category, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-6">
      <PageTitle sub="知りたいことを書くと、質問に合った占いを選んで、これからを予想します">
        {parentId ? "もう一度占う" : "占う"}
      </PageTitle>
      {parentId && (
        <p className="text-sm text-muted">
          元の予測は変更されず、新しい予測として別に保存されます。
        </p>
      )}
      <Card>
        <AskForm parentId={parentId} defaultQuestion={defaultQuestion} />
      </Card>
      {recent && recent.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold text-muted">最近の質問</h2>
          <ul className="space-y-1 text-sm">
            {recent.map((q) => (
              <li key={q.id} className="flex gap-3">
                <span className="text-muted">{formatDate(q.created_at)}</span>
                <span className="text-muted">
                  {q.category ? QUESTION_CATEGORY_LABELS[q.category as QuestionCategory] : "未分類"}
                </span>
                <span className="truncate">{q.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
