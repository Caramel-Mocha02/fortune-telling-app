import Link from "next/link";
import { Badge, Card, PageTitle, buttonClass } from "@/components/ui";
import { METHODS } from "@/lib/divination/registry";
import { METHOD_DESCRIPTIONS } from "@/lib/divination/descriptions";
import { METHOD_IDS } from "@/lib/divination/types";
import { ROUTING_RULES_V1 } from "@/lib/routing/router";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS } from "@/lib/domain/taxonomy";
import type { MethodId } from "@/lib/divination/types";

/** 実際に占いを選ぶルールから「こんな質問で使います」を作る (ルールと説明がずれないように) */
function usedFor(method: MethodId) {
  const main = QUESTION_CATEGORIES.filter((c) => ROUTING_RULES_V1[c].primary.includes(method));
  const sub = QUESTION_CATEGORIES.filter((c) => ROUTING_RULES_V1[c].secondary.includes(method));
  return { main, sub };
}

export default function MethodsPage() {
  return (
    <div className="space-y-6">
      <PageTitle sub="このアプリで使う8つの占いの紹介です">占いの種類</PageTitle>

      <Card className="text-sm leading-relaxed">
        質問の内容に合わせて、向いている占いを自動で選びます。いくつもの占いに共通して出ていることを中心に、これから起きそうなことを予想します。
        答え合わせが増えてくると、あなたによく当たっている占いを優先するようになります。
      </Card>

      <nav className="flex flex-wrap gap-2" aria-label="占いの一覧">
        {METHOD_IDS.map((m) => (
          <a key={m} href={`#${m}`} className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-accent">
            {METHODS[m].label}
          </a>
        ))}
      </nav>

      {METHOD_IDS.map((m) => {
        const d = METHOD_DESCRIPTIONS[m];
        const { main, sub } = usedFor(m);
        return (
          <Card key={m} className="scroll-mt-24 space-y-3">
            <div id={m} className="scroll-mt-24">
              <h2 className="text-lg font-bold">{METHODS[m].label}</h2>
              <p className="text-sm text-accent">{d.summary}</p>
            </div>
            <p className="text-sm leading-relaxed">{d.about}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-[7rem_1fr]">
              <dt className="text-muted">得意なこと</dt>
              <dd>{d.strengths}</dd>
              <dt className="text-muted">使う情報</dt>
              <dd>{d.uses}</dd>
              <dt className="text-muted">こんな質問で</dt>
              <dd className="flex flex-wrap gap-1.5">
                {main.map((c) => (
                  <Badge key={c} tone="accent">
                    {QUESTION_CATEGORY_LABELS[c]}
                  </Badge>
                ))}
                {sub.map((c) => (
                  <Badge key={c}>{QUESTION_CATEGORY_LABELS[c]} (補助)</Badge>
                ))}
              </dd>
            </dl>
            {d.note && <p className="text-xs leading-relaxed text-muted">{d.note}</p>}
          </Card>
        );
      })}

      <div className="text-center">
        <Link href="/ask" className={buttonClass()}>
          占ってみる
        </Link>
      </div>
    </div>
  );
}
