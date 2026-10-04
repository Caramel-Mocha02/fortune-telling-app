import { Badge, Card, formatDate, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time/zoned";
import { LINE_LABELS, PalmObservationSchema } from "@/lib/divination/palmistry/observation";
import { deletePalm } from "./actions";
import { PALM_BUCKET } from "@/lib/supabase/buckets";
import { PalmForm } from "./palm-form";

const LENGTH = { short: "短い", medium: "標準", long: "長い", unknown: "不明" } as const;
const DEPTH = { faint: "薄い", moderate: "標準", deep: "濃い", unknown: "不明" } as const;

export default async function PalmPage() {
  const { supabase } = await requireUser();
  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("birth_profiles").select("time_zone").maybeSingle(),
    supabase.from("palm_readings").select("id, hand, captured_on, image_path, observation").order("captured_on", { ascending: false }),
  ]);
  const readings = rows ?? [];
  const { data: signed } = readings.length
    ? await supabase.storage.from(PALM_BUCKET).createSignedUrls(readings.map((r) => r.image_path), 600)
    : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="space-y-6">
      <PageTitle sub="登録時に画像から線の状態を読み取って記録します。予測では、記録した状態と前回からの変化を使います。">手相</PageTitle>
      <Card>
        <PalmForm today={todayIn(profile?.time_zone ?? "Asia/Tokyo")} />
      </Card>
      <ul className="space-y-3">
        {readings.map((r) => {
          const obs = PalmObservationSchema.safeParse(r.observation);
          const url = urlFor.get(r.image_path);
          return (
            <li key={r.id} className="flex gap-4 rounded-xl border border-border bg-surface p-4">
              {url && (
                // 署名付き URL は短時間で失効するため next/image の最適化は使わない
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`${r.hand === "right" ? "右手" : "左手"} ${r.captured_on}`} className="h-28 w-28 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">{formatDate(r.captured_on)}</span>
                  <Badge>{r.hand === "right" ? "右手" : "左手"}</Badge>
                  {obs.success && <Badge>画質: {obs.data.image_quality}</Badge>}
                </div>
                {obs.success && (
                  <ul className="grid grid-cols-2 gap-x-4 text-xs sm:grid-cols-3">
                    {(Object.keys(LINE_LABELS) as Array<keyof typeof LINE_LABELS>).map((k) => {
                      const l = obs.data.lines[k];
                      return (
                        <li key={k}>
                          {LINE_LABELS[k]}: {l.visible ? `${LENGTH[l.length]}・${DEPTH[l.depth]}` : "見えない"}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <form action={deletePalm}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs text-muted underline">画像と記録を削除</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
