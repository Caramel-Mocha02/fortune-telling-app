import { z } from "zod";

/**
 * 計算エンジンへの入力となる構造化された出生データ。
 * Prediction Snapshot にもこの形のまま保存する。
 */
export const BirthDataSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 出生時刻不明の場合は null */
  birthTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  timeZone: z.string().min(1),
  placeName: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  /** 四柱推命の大運の順行・逆行に使う */
  gender: z.enum(["female", "male", "unspecified"]),
});
export type BirthData = z.infer<typeof BirthDataSchema>;

export interface PredictionPeriod {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
}

/** 出生データ以外に占術が使う、予測ごとの入力 (Snapshot にそのまま保存する) */
export interface EngineContext {
  /** タロットの引きを再現するための乱数シード */
  seed?: string;
  /** タロットのスプレッド選択に使う質問分類 */
  category?: string;
  /** 手相: 登録済みの観察結果 (新しい順) */
  palmReadings?: PalmReadingInput[];
}

export interface PalmReadingInput {
  id: string;
  hand: "left" | "right";
  captured_on: string;
  observation: unknown;
}

export interface EngineInput {
  birth: BirthData;
  period: PredictionPeriod;
  context?: EngineContext;
}

/** 全エンジン共通の結果エンベロープ。JSON としてそのまま保存・AIに渡す。 */
export interface EngineResult<TData = unknown> {
  method: MethodId;
  engine_version: string;
  /** 流派・設定 (ハウス方式、日の区切りなど)。再現性のため必ず記録する。 */
  settings: Record<string, string | number | boolean>;
  /** 精度上の注意 (出生時刻不明など) */
  caveats: string[];
  data: TData;
}

export interface DivinationEngine<TData = unknown> {
  method: MethodId;
  version: string;
  compute(input: EngineInput): EngineResult<TData>;
}

export const METHOD_IDS = [
  "western_astrology",
  "four_pillars",
  "zi_wei_dou_shu",
  "sanmei",
  "kyusei",
  "numerology",
  "tarot",
  "palmistry",
] as const;
export type MethodId = (typeof METHOD_IDS)[number];
