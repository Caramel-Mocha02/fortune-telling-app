import { describe, expect, it } from "vitest";
import { computeKpis, performanceTrend, quarterOf, recentMonths } from "../kpi";
import { stalePredictions } from "@/lib/prediction/reminders";
import type { EvaluatedItem } from "../types";

const evaluated = (i: number, createdAt: string, eventScore: number): EvaluatedItem => ({
  item_id: `i${i}`,
  prediction_id: `p${i}`,
  theme: "career",
  event_type: "role_change",
  direction: "positive",
  magnitude: "medium",
  start_date: "2027-01-01",
  end_date: "2027-03-31",
  supporting_methods: ["western_astrology"],
  prediction_created_at: createdAt,
  period_days: 90,
  prediction_model_version: "prediction_model_v4",
  routing_version: "routing_v2",
  prompt_version: "interpret_v4",
  evaluation: {
    outcome_id: `o${i}`,
    timing_score: 1,
    theme_score: 1,
    event_score: eventScore,
    direction_score: 1,
    magnitude_score: 1,
    overall_score: eventScore,
    evaluation_source: "user_confirmed",
    evaluated_at: "2027-06-01T00:00:00Z",
  },
});

describe("期間の補助関数", () => {
  it("直近 6 か月と四半期", () => {
    expect(recentMonths("2027-02-15", 3)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(quarterOf("2027-02-15T00:00:00Z")).toBe("2027-Q1");
    expect(quarterOf("2027-10-01")).toBe("2027-Q4");
  });
});

describe("予測性能の推移 (仕様 56)", () => {
  it("十分なデータの四半期が 2 つなければ判定しない", () => {
    const t = performanceTrend(Array.from({ length: 10 }, (_, i) => evaluated(i, "2027-01-10T00:00:00Z", 1)));
    expect(t.direction).toBe("insufficient");
    expect(t.quarters).toHaveLength(1);
  });

  it("直近 2 四半期で一致の割合が上がれば improved", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => evaluated(i, "2027-01-10T00:00:00Z", i < 3 ? 1 : 0)),
      ...Array.from({ length: 10 }, (_, i) => evaluated(100 + i, "2027-04-10T00:00:00Z", i < 7 ? 1 : 0)),
    ];
    const t = performanceTrend(rows);
    expect(t.quarters.map((q) => [q.quarter, q.event_match_rate])).toEqual([
      ["2027-Q1", 0.3],
      ["2027-Q2", 0.7],
    ]);
    expect(t.direction).toBe("improved");
  });
});

describe("KPI", () => {
  const input = {
    predictions: [
      { id: "p1", created_at: "2027-01-05T00:00:00Z", parent_prediction_id: null },
      { id: "p2", created_at: "2027-03-01T00:00:00Z", parent_prediction_id: "p1" },
      { id: "p3", created_at: "2027-06-30T10:00:00Z", parent_prediction_id: null },
    ],
    items: [
      { id: "a", prediction_id: "p1", end_date: "2027-03-31" },
      { id: "b", prediction_id: "p1", end_date: "2027-03-31" },
      { id: "c", prediction_id: "p2", end_date: "2027-12-31" },
    ],
    feedback: [
      { prediction_item_id: "a", verdict: "occurred", created_at: "2027-04-02T00:00:00Z" },
      { prediction_item_id: "b", verdict: "pending", created_at: "2027-04-02T00:00:00Z" },
    ],
    evaluated: [{ ...evaluated(0, "2027-01-05T00:00:00Z", 1), item_id: "a" }],
    checkIns: [
      { prediction_id: "p1", due_on: "2027-02-15", completed_at: "2027-02-20T00:00:00Z" },
      { prediction_id: "p1", due_on: "2027-04-01", completed_at: null },
      { prediction_id: "p2", due_on: "2027-08-01", completed_at: null },
    ],
    outcomes: [{ recorded_at: "2027-05-10T00:00:00Z" }],
    views: [
      { prediction_id: "p1", viewed_at: "2027-01-05T00:05:00Z" }, // 作成直後は数えない
      { prediction_id: "p2", viewed_at: "2027-04-10T00:00:00Z" },
    ],
  };
  const k = computeKpis(input, "2027-06-30");

  it("答え合わせ率: 確認時期が来た項目のうち「まだ分からない」以外で回答したもの", () => {
    expect(k.verification_rate).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });

  it("評価カバレッジ: 期間が終わった項目のうち評価があるもの", () => {
    expect(k.evaluation_coverage).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });

  it("リマインドの完了率・再予測率・過去予測参照率", () => {
    expect(k.check_in_rate).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(k.reforecast_rate.numerator).toBe(1);
    // p3 は作成から 1 日経っていないので分母に入らない
    expect(k.reference_rate).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });

  it("直近 6 か月の利用状況", () => {
    expect(k.monthly.map((m) => m.month)).toEqual(["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"]);
    expect(k.monthly.map((m) => m.active)).toEqual([true, false, true, true, true, true]);
    expect(k.active_months.numerator).toBe(5);
  });
});

describe("定期的な確認 (仕様 25)", () => {
  const base = {
    items: [
      { id: "a", prediction_id: "p1" },
      { id: "b", prediction_id: "p2" },
    ],
    dueCheckInPredictionIds: new Set<string>(),
  };
  const pred = (id: string, created: string, status: "open" | "closed" = "open") => ({
    id,
    created_at: created,
    prediction_period_start: created.slice(0, 10),
    status,
    summary: id,
  });

  it("30 日以上回答のない進行中の予測を、古い順に尋ねる", () => {
    const r = stalePredictions(
      {
        ...base,
        predictions: [pred("p1", "2027-01-01T00:00:00Z"), pred("p2", "2027-02-01T00:00:00Z"), pred("p3", "2027-01-01T00:00:00Z", "closed")],
        feedback: [{ prediction_item_id: "a", created_at: "2027-05-01T00:00:00Z" }],
      },
      "2027-06-15",
    );
    expect(r.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("最近回答した予測、作ったばかりの予測、期日の案内済みの予測は尋ねない", () => {
    const r = stalePredictions(
      {
        ...base,
        predictions: [pred("p1", "2027-01-01T00:00:00Z"), pred("p2", "2027-06-01T00:00:00Z"), pred("p4", "2027-01-01T00:00:00Z")],
        feedback: [{ prediction_item_id: "a", created_at: "2027-06-10T00:00:00Z" }],
        dueCheckInPredictionIds: new Set(["p4"]),
      },
      "2027-06-15",
    );
    expect(r).toEqual([]);
  });
});
