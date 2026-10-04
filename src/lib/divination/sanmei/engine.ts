/**
 * 算命学 計算エンジン v1
 *
 * 干支暦 (年・月・日) は四柱推命エンジンと共通 (相関グループ eastern_fate)。
 * - 陽占: 人体星図の十大主星 (5 か所) と十二大従星 (3 か所)
 * - 天中殺: 日柱の旬から求める 2 支。予測期間内の天中殺の年・月を列挙
 * - 流年: 年ごとの十大主星・十二大従星
 *
 * 蔵干は v1 では本元 (主気) のみを使う。節入りからの日数で蔵干を選ぶ流派 (二十八元) には未対応。
 */
import type { DivinationEngine, EngineInput, EngineResult } from "../types";
import {
  adjacentJie,
  BRANCHES,
  cycleToPillar,
  dayPillarIndex,
  HIDDEN_STEMS,
  monthPillarAt,
  pillarName,
  STEM_IS_YANG,
  tenGod,
  yearPillarAt,
} from "../four-pillars/engine";
import { fromZoned, parseIsoDate, todayIn } from "@/lib/time/zoned";

export const SANMEI_ENGINE_VERSION = "sanmei_engine_v1";

const MAIN_STARS: Record<string, string> = {
  比肩: "貫索星",
  劫財: "石門星",
  食神: "鳳閣星",
  傷官: "調舒星",
  偏財: "禄存星",
  正財: "司禄星",
  偏官: "車騎星",
  正官: "牽牛星",
  偏印: "龍高星",
  印綬: "玉堂星",
};

const SUBORDINATE_STARS = ["天貴星", "天恍星", "天南星", "天禄星", "天将星", "天堂星", "天胡星", "天極星", "天庫星", "天馳星", "天報星", "天印星"];
/** 十干ごとの長生の支 */
const CHANGSHENG = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3];

export function mainStar(dayStem: number, other: number): string {
  return MAIN_STARS[tenGod(dayStem, other)];
}

/** 十二大従星 (十二運: 陽干は順行、陰干は逆行) */
export function subordinateStar(dayStem: number, branch: number): string {
  const start = CHANGSHENG[dayStem];
  const stage = STEM_IS_YANG(dayStem) ? (branch - start + 12) % 12 : (start - branch + 12) % 12;
  return SUBORDINATE_STARS[stage];
}

/** 日柱の六十干支インデックスから天中殺の 2 支 */
export function tenchusatsuBranches(dayCycle: number): [number, number] {
  const startBranch = (Math.floor(dayCycle / 10) * 10) % 12;
  return [(startBranch + 10) % 12, (startBranch + 11) % 12];
}

export interface SanmeiData {
  insen: { year: string; month: string; day: string };
  yosen: {
    main_stars: Array<{ position: string; source: string; star: string }>;
    subordinate_stars: Array<{ position: string; source: string; star: string }>;
  };
  tenchusatsu: string;
  period: {
    start: string;
    end: string;
    annual: Array<{ solar_year: number; name: string; main_star: string; subordinate_star: string; tenchusatsu: boolean }>;
    monthly: Array<{ begins: string; name: string; main_star: string; tenchusatsu: boolean }>;
  };
}

function compute(input: EngineInput): EngineResult<SanmeiData> {
  const { birth, period } = input;
  const [y, m, d] = birth.birthDate.split("-").map(Number);
  const [hh, mm] = birth.birthTime ? birth.birthTime.split(":").map(Number) : [12, 0];
  const instant = fromZoned({ year: y, month: m, day: d, hour: hh, minute: mm }, birth.timeZone);
  const caveats = ["蔵干は本元 (主気) のみで算出。節入りからの日数で蔵干を選ぶ流派とは結果が異なる場合がある。"];
  if (!birth.birthTime) caveats.push("出生時刻が不明なため正午で判定。節入り当日生まれの場合は年干支・月干支が前後する可能性がある。");

  const yp = yearPillarAt(instant);
  const mp = monthPillarAt(instant);
  const dayCycle = dayPillarIndex(y, m, d);
  const dp = cycleToPillar(dayCycle);
  const ds = dp.stem;
  const hidden = (branch: number) => HIDDEN_STEMS[branch][0];
  const [t1, t2] = tenchusatsuBranches(dayCycle);
  const isTcs = (branch: number) => branch === t1 || branch === t2;

  const start = parseIsoDate(period.start);
  const end = parseIsoDate(period.end);
  const annual: SanmeiData["period"]["annual"] = [];
  for (let sy = yearPillarAt(start).solarYear; sy <= yearPillarAt(end).solarYear; sy++) {
    const p = cycleToPillar(sy - 4);
    annual.push({
      solar_year: sy,
      name: pillarName(p),
      main_star: mainStar(ds, p.stem),
      subordinate_star: subordinateStar(ds, p.branch),
      tenchusatsu: isTcs(p.branch),
    });
  }

  const monthly: SanmeiData["period"]["monthly"] = [];
  let cursor = adjacentJie(start, -1);
  while (cursor.getTime() <= end.getTime() && monthly.length < 36) {
    const p = monthPillarAt(new Date(cursor.getTime() + 3600_000));
    monthly.push({ begins: todayIn(birth.timeZone, cursor), name: pillarName(p), main_star: mainStar(ds, p.stem), tenchusatsu: isTcs(p.branch) });
    cursor = adjacentJie(new Date(cursor.getTime() + 86400_000), 1);
  }

  return {
    method: "sanmei",
    engine_version: SANMEI_ENGINE_VERSION,
    settings: {
      year_boundary: "lichun",
      month_boundary: "jie_solar_terms",
      hidden_stem: "honmoto_only",
      twelve_stages: "yang_forward_yin_backward",
    },
    caveats,
    data: {
      insen: { year: pillarName(yp), month: pillarName(mp), day: pillarName(dp) },
      yosen: {
        main_stars: [
          { position: "頭 (北)", source: "日干×年干", star: mainStar(ds, yp.stem) },
          { position: "胸 (中央)", source: "日干×月支蔵干", star: mainStar(ds, hidden(mp.branch)) },
          { position: "腹 (南)", source: "日干×月干", star: mainStar(ds, mp.stem) },
          { position: "左手 (東)", source: "日干×年支蔵干", star: mainStar(ds, hidden(yp.branch)) },
          { position: "右手 (西)", source: "日干×日支蔵干", star: mainStar(ds, hidden(dp.branch)) },
        ],
        subordinate_stars: [
          { position: "左肩 (初年期)", source: "日干×年支", star: subordinateStar(ds, yp.branch) },
          { position: "右足 (中年期)", source: "日干×月支", star: subordinateStar(ds, mp.branch) },
          { position: "左足 (晩年期)", source: "日干×日支", star: subordinateStar(ds, dp.branch) },
        ],
      },
      tenchusatsu: `${BRANCHES[t1]}${BRANCHES[t2]}天中殺`,
      period: { start: period.start, end: period.end, annual, monthly },
    },
  };
}

export const sanmeiEngine: DivinationEngine<SanmeiData> = {
  method: "sanmei",
  version: SANMEI_ENGINE_VERSION,
  compute,
};
