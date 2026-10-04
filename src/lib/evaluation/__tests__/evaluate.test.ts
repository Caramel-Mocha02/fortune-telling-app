import { describe, expect, it } from "vitest";
import { evaluateMatch, evaluateNonOccurrence, scoreDirection, scoreTiming } from "../evaluate";
import { performanceNoteForAi, summarizeByTheme } from "../performance";
import { planCheckIns, periodFrom, resolvePeriodMonths } from "@/lib/prediction/schedule";
import { route } from "@/lib/routing/router";
import type { EvaluableItem } from "../evaluate";

const item: EvaluableItem = {
  theme: "career",
  event_type: "role_change",
  direction: "positive",
  magnitude: "medium",
  start_date: "2027-04-01",
  end_date: "2027-09-30",
};

describe("評価エンジン", () => {
  it("仕様 26 の例: 4 月に新プロジェクト → 時期・テーマ一致、イベントは類似", () => {
    const r = evaluateMatch(item, {
      occurred_at: "2027-04-15",
      theme: "career",
      event_type: "new_project",
      direction: "positive",
      magnitude: "medium",
    });
    expect(r.timing_label).toBe("within");
    expect(r.theme_label).toBe("match");
    expect(r.event_label).toBe("similar");
    expect(r.event_score).toBe(0.5);
    expect(r.overall_score).toBeGreaterThan(0.8);
    expect(r.overall_score).toBeLessThan(1);
  });

  it("時期のズレを近似と大幅なズレに分ける", () => {
    expect(scoreTiming(item, "2027-03-10").label).toBe("early_near");
    expect(scoreTiming(item, "2027-11-10").label).toBe("late_near");
    expect(scoreTiming(item, "2028-06-01").label).toBe("late_far");
  });

  it("方向: 逆・中立・不明を区別する", () => {
    expect(scoreDirection("positive", "negative").label).toBe("opposite");
    expect(scoreDirection("change", "negative").label).toBe("match");
    expect(scoreDirection("positive", "change").label).toBe("neutral");
    expect(scoreDirection("unknown", "positive").score).toBeNull();
  });

  it("規模の過大・過小評価", () => {
    const r = evaluateMatch(item, { ...{ occurred_at: "2027-05-01", theme: "career", event_type: "role_change", direction: "positive" }, magnitude: "small" });
    expect(r.magnitude_label).toBe("overestimate");
    expect(r.event_label).toBe("match");
  });

  it("起きなかった予測もイベント不一致として記録する", () => {
    const r = evaluateNonOccurrence();
    expect(r.event_score).toBe(0);
    expect(r.timing_score).toBeNull();
  });
});

describe("予測実績の要約", () => {
  it("10 件未満のテーマは数値を出さない", () => {
    const rows = Array.from({ length: 5 }, () => ({ theme: "love" as const, timing_score: 1, theme_score: 1, event_score: 1 }));
    const s = summarizeByTheme(rows);
    expect(s[0].level).toBe("insufficient");
    expect(s[0].timing_match_rate).toBeNull();
    expect(performanceNoteForAi(["love"], s)).toContain("データ不足");
  });
});

describe("予測期間とリマインド", () => {
  it("1 か月予測は約 2 週間後と終了後", () => {
    const p = periodFrom("2026-10-04", 1);
    expect(p.end).toBe("2026-11-03");
    expect(planCheckIns(p)).toEqual([
      { due_on: "2026-10-19", kind: "interim" },
      { due_on: "2026-11-04", kind: "final" },
    ]);
  });

  it("1 年予測は 6 か月後と 1 年後", () => {
    const plans = planCheckIns(periodFrom("2026-10-04", 12));
    expect(plans.map((p) => p.due_on)).toEqual(["2027-04-04", "2027-10-04"]);
  });

  it("2 年予測は 6 か月ごと", () => {
    const plans = planCheckIns(periodFrom("2026-10-04", 24));
    expect(plans.map((p) => p.kind)).toEqual(["interim", "interim", "interim", "final"]);
  });

  it("期間は 1〜36 か月に丸める", () => {
    expect(resolvePeriodMonths("LIFE", null, null)).toBe(24);
    expect(resolvePeriodMonths("CAREER", null, 120)).toBe(36);
    expect(resolvePeriodMonths("DECISION", 6, 1)).toBe(6);
  });
});

describe("ルーター", () => {
  it("Phase 2 の占術はルール通りに使われる", () => {
    const r = route("CAREER");
    expect(r.primary).toEqual(["western_astrology", "four_pillars", "zi_wei_dou_shu"]);
    expect(r.secondary).toEqual(["sanmei"]);
    expect(r.skipped).toEqual([]);
  });

  it("8 占術すべて実装済みで、ルール通りならスキップはない", () => {
    expect(route("DECISION")).toMatchObject({ primary: ["tarot", "western_astrology"], secondary: ["four_pillars"], skipped: [] });
  });

  it("引っ越しの質問では九星気学が主要になる", () => {
    expect(route("MOVE").primary).toEqual(["kyusei", "western_astrology", "four_pillars"]);
  });
});

import { buildEvaluation } from "../check-in";
import { sanitizeItems } from "@/lib/prediction/sanitize";

describe("答え合わせ → 評価", () => {
  const outcome = { id: "o1", occurred_at: "2027-05-01", theme: "career" as const, event_type: "role_change" as const, direction: "positive" as const, magnitude: "medium" as const };

  it("出来事が紐付けば user_confirmed で多軸評価", () => {
    const e = buildEvaluation(item, { verdict: "occurred", outcome }, "2027-05-10");
    expect(e?.evaluation_source).toBe("user_confirmed");
    expect(e?.timing_label).toBe("within");
  });

  it("出来事なしの「起きた」は ambiguous", () => {
    expect(buildEvaluation(item, { verdict: "partially", outcome: null }, "2027-05-10")?.evaluation_source).toBe("ambiguous");
  });

  it("期間中の「起きなかった」は評価しない", () => {
    expect(buildEvaluation(item, { verdict: "not_occurred", outcome: null }, "2027-05-10")).toBeNull();
    expect(buildEvaluation(item, { verdict: "not_occurred", outcome: null }, "2027-10-01")?.event_score).toBe(0);
  });

  it("まだ分からない・判断できないは評価しない", () => {
    expect(buildEvaluation(item, { verdict: "pending", outcome }, "2027-10-01")).toBeNull();
    expect(buildEvaluation(item, { verdict: "undeterminable", outcome }, "2027-10-01")).toBeNull();
  });
});

describe("AI 出力の予測項目の補正", () => {
  it("期間外の日付を期間内に収め、未使用の占術を除き、独立系統数を数える", () => {
    const [s] = sanitizeItems(
      [
        {
          theme: "career", event_type: "role_change", direction: "positive", magnitude: "medium", specificity: "moderate",
          start_date: "2026-01-01", end_date: "2029-01-01", description: "d", rationale: "r", signal_strength: "moderate",
          supporting_methods: ["western_astrology", "four_pillars", "four_pillars", "zi_wei_dou_shu"],
        },
      ],
      { start: "2026-10-04", end: "2027-10-03" },
      ["western_astrology", "four_pillars"],
    );
    expect(s.start_date).toBe("2026-10-04");
    expect(s.end_date).toBe("2027-10-03");
    expect(s.supporting_methods).toEqual(["western_astrology", "four_pillars"]);
    expect(s.independent_group_count).toBe(2);
  });
});
