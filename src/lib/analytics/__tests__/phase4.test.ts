import { describe, expect, it } from "vitest";
import { estimate, personalize, routingTheme, userWeight } from "@/lib/routing/personalize";
import { route } from "@/lib/routing/router";
import { byMethodThemeHorizon, byVersion, chanceBaseline, horizonOf, summarize } from "../metrics";
import { buildReview, monthRange, yearRange } from "../review";
import type { EvaluatedItem } from "../types";

describe("個人別ルーティング", () => {
  it("サンプル数に応じた個人の重み (仕様 22)", () => {
    expect(userWeight(9)).toBe(0);
    expect(userWeight(10)).toBeCloseTo(10 / 30 / 2);
    expect(userWeight(30)).toBeCloseTo(30 / 50);
  });

  it("全体実績がなければ中立 0.5、少数の全体実績は 0.5 に縮小される", () => {
    expect(estimate(undefined, undefined).estimate).toBe(0.5);
    expect(estimate(undefined, { n: 10, event_score: 1, timing_score: 1 }).estimate).toBe(0.75);
  });

  it("個人データ 10 件未満なら全体モデルのまま (applied=false)", () => {
    const r = personalize(route("CAREER"), "career", { four_pillars: { n: 5, event_score: 1, timing_score: 1 } }, {});
    expect(r.personalization?.applied).toBe(false);
    expect(r.primary).toEqual(["western_astrology", "four_pillars", "zi_wei_dou_shu"]);
    expect(r.routing_version).toBe("routing_v2");
  });

  it("弱い個人補正では主要の順序だけが変わる", () => {
    const r = personalize(route("CAREER"), "career", { zi_wei_dou_shu: { n: 15, event_score: 1, timing_score: 1 } }, {});
    expect(r.primary[0]).toBe("zi_wei_dou_shu");
    expect(r.secondary).toEqual(["sanmei"]);
    expect(r.personalization?.weights.find((w) => w.method === "zi_wei_dou_shu")?.level).toBe("weak_personal");
  });

  it("30 件以上で明確に上回る補助占術は主要に繰り上がる", () => {
    const r = personalize(
      route("CAREER"),
      "career",
      { sanmei: { n: 40, event_score: 0.9, timing_score: 0.9 }, zi_wei_dou_shu: { n: 40, event_score: 0.1, timing_score: 0.1 } },
      {},
    );
    expect(r.primary).toContain("sanmei");
    expect(r.secondary).toEqual(["zi_wei_dou_shu"]);
    expect(r.personalization?.changes.some((c) => c.includes("入れ替え"))).toBe(true);
  });

  it("実績を引くテーマ", () => {
    expect(routingTheme("DECISION", ["career"])).toBe("career");
    expect(routingTheme("LOVE", [])).toBe("love");
    expect(routingTheme("TIMING", [])).toBe("other");
  });
});

const row = (i: number, over: Partial<EvaluatedItem> = {}, ev: Partial<EvaluatedItem["evaluation"]> = {}): EvaluatedItem => ({
  item_id: `i${i}`,
  prediction_id: `p${i}`,
  theme: "career",
  event_type: "role_change",
  direction: "positive",
  magnitude: "medium",
  start_date: "2027-01-01",
  end_date: "2027-03-31",
  supporting_methods: ["western_astrology"],
  prediction_created_at: "2026-12-20T00:00:00Z",
  period_days: 90,
  prediction_model_version: "prediction_model_v3",
  routing_version: "routing_v1",
  prompt_version: "interpret_v3",
  ...over,
  evaluation: {
    outcome_id: `o${i}`,
    timing_score: 1,
    theme_score: 1,
    event_score: 1,
    direction_score: 1,
    magnitude_score: 1,
    overall_score: 1,
    evaluation_source: "user_confirmed",
    evaluated_at: "2027-04-05T00:00:00Z",
    ...ev,
  },
});

describe("性能指標", () => {
  it("10 件未満は数値を出さない", () => {
    const s = summarize([row(1), row(2)]);
    expect(s.level).toBe("insufficient");
    expect(s.event_match_rate).toBeNull();
  });

  it("曖昧な評価は性能に含めない", () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => row(i)), row(99, {}, { evaluation_source: "ambiguous", event_score: 0 })];
    const [cell] = byMethodThemeHorizon(rows);
    expect(cell).toMatchObject({ method: "western_astrology", theme: "career", horizon: "short", n: 10, event_match_rate: 1 });
  });

  it("時間軸の区切りは SQL と同じ", () => {
    expect([horizonOf(90), horizonOf(100), horizonOf(101), horizonOf(400), horizonOf(401)]).toEqual(["short", "short", "mid", "mid", "long"]);
  });

  it("モデルのバージョン別に比較する", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row(i, {}, { event_score: 0, overall_score: 0 })),
      ...Array.from({ length: 10 }, (_, i) => row(100 + i, { prediction_model_version: "prediction_model_v4" })),
    ];
    const v = byVersion(rows, "prediction_model_version");
    expect(v.map((x) => [x.version, x.event_match_rate])).toEqual([
      ["prediction_model_v3", 0],
      ["prediction_model_v4", 1],
    ]);
  });

  it("偶然レベル: 紐付けた出来事以外と照合した一致度", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i));
    const outcomes = [
      { id: "o0", occurred_at: "2027-02-01", theme: "career" as const, event_type: "role_change" as const, direction: "positive" as const, magnitude: "medium" as const },
      { id: "x1", occurred_at: "2028-08-01", theme: "health" as const, event_type: "health_issue" as const, direction: "negative" as const, magnitude: "small" as const },
    ];
    const b = chanceBaseline(rows, outcomes);
    expect(b.actual.mean_overall).toBe(1);
    // i0 は o0 を自分の出来事として除外するので 1 ペア少ない
    expect(b.pairs).toBe(19);

    // 無関係な出来事だけと照合すれば偶然レベルは低い
    const unrelated = chanceBaseline(rows, [outcomes[1]]);
    expect(unrelated.pairs).toBe(10);
    expect(unrelated.chance_mean_overall).toBeLessThan(0.2);
    expect(unrelated.chance_event_match_rate).toBe(0);
  });
});

describe("月次・年次レビュー", () => {
  it("期間の範囲", () => {
    expect(monthRange(2027, 2)).toEqual({ start: "2027-02-01", end: "2027-02-28" });
    expect(yearRange(2027)).toEqual({ start: "2027-01-01", end: "2027-12-31" });
  });

  it("予測数・出来事数・回答状況・データ不足を集計する", () => {
    const review = buildReview(
      {
        predictions: [
          { id: "p1", created_at: "2027-03-10T00:00:00Z", category: "CAREER" },
          { id: "p2", created_at: "2027-04-02T00:00:00Z", category: "LOVE" },
        ],
        items: [
          { id: "a", prediction_id: "p1", theme: "career", start_date: "2027-03-15", end_date: "2027-05-31", supporting_methods: ["western_astrology"] },
          { id: "b", prediction_id: "p1", theme: "career", start_date: "2027-03-15", end_date: "2027-03-31", supporting_methods: ["four_pillars"] },
          { id: "c", prediction_id: "p2", theme: "love", start_date: "2027-04-02", end_date: "2027-06-30", supporting_methods: ["tarot"] },
        ],
        verdicts: { a: "occurred", b: "not_occurred" },
        evaluated: [row(1, { theme: "career" })],
        outcomes: [{ id: "o1", occurred_at: "2027-03-20", theme: "career" }],
      },
      monthRange(2027, 3),
    );
    expect(review.predictions_made).toBe(1);
    expect(review.items_made).toBe(2);
    expect(review.outcomes_recorded).toBe(1);
    expect(review.verification).toEqual({ match: 1, partial: 0, mismatch: 1, unevaluated: 0 });
    expect(review.metrics.level).toBe("insufficient");
    expect(review.best_theme).toBeNull();
    expect(review.insufficient_themes).toEqual(["love", "career"]);
  });
});
