import { Badge, Card, formatDate, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { DIRECTION_LABELS, EVENT_TYPES, MAGNITUDE_LABELS, THEME_LABELS } from "@/lib/domain/taxonomy";
import type { OutcomeRow } from "@/lib/db/types";
import { todayIn } from "@/lib/time/zoned";
import { LogForm } from "./log-form";

export default async function LogPage() {
  const { supabase } = await requireUser();
  const [{ data: profile }, { data: outcomes }] = await Promise.all([
    supabase.from("birth_profiles").select("time_zone").maybeSingle(),
    supabase.from("outcomes").select("*").order("occurred_at", { ascending: false }).limit(50),
  ]);
  const today = todayIn(profile?.time_zone ?? "Asia/Tokyo");

  return (
    <div className="space-y-6">
      <PageTitle sub="実際に起きた出来事を書き留めます。占いの答え合わせのもとになります。">記録する</PageTitle>
      <Card>
        <LogForm today={today} />
      </Card>
      <ul className="space-y-2">
        {((outcomes ?? []) as OutcomeRow[]).map((o) => (
          <li key={o.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-muted">{formatDate(o.occurred_at)}</span>
              <span>{o.description}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge>{THEME_LABELS[o.theme]}</Badge>
              <Badge>{EVENT_TYPES[o.event_type].label}</Badge>
              <Badge>{DIRECTION_LABELS[o.direction]}</Badge>
              <Badge>規模: {MAGNITUDE_LABELS[o.magnitude]}</Badge>
              {o.source === "ai_confirmed" && <Badge tone="accent">AI分類を確認済み</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
