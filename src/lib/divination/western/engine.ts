/**
 * 西洋占星術 計算エンジン v1
 *
 * - 天体位置: astronomy-engine (VSOP87 / ELP 系) による地心・真黄道座標 (トロピカル)
 * - ASC / MC: 視恒星時と真黄道傾斜角から算出
 * - ハウス: ホールサイン (高緯度でも破綻せず、流派差が小さいため v1 の既定とする)
 * - 予測期間: 外惑星トランジット、木星・土星のサイン移動、二次進行 (太陽・月)
 *
 * AI には計算させない (仕様 7)。ここでの出力が唯一の天体データとなる。
 */
import * as Astronomy from "astronomy-engine";
import type { DivinationEngine, EngineInput, EngineResult } from "../types";
import { addDays, daysBetween, formatIsoDate, fromZoned, parseIsoDate } from "@/lib/time/zoned";

export const WESTERN_ENGINE_VERSION = "western_engine_v1";

export const SIGNS = [
  { id: "aries", ja: "牡羊座" },
  { id: "taurus", ja: "牡牛座" },
  { id: "gemini", ja: "双子座" },
  { id: "cancer", ja: "蟹座" },
  { id: "leo", ja: "獅子座" },
  { id: "virgo", ja: "乙女座" },
  { id: "libra", ja: "天秤座" },
  { id: "scorpio", ja: "蠍座" },
  { id: "sagittarius", ja: "射手座" },
  { id: "capricorn", ja: "山羊座" },
  { id: "aquarius", ja: "水瓶座" },
  { id: "pisces", ja: "魚座" },
] as const;

const PLANETS = [
  { body: Astronomy.Body.Sun, id: "sun", ja: "太陽" },
  { body: Astronomy.Body.Moon, id: "moon", ja: "月" },
  { body: Astronomy.Body.Mercury, id: "mercury", ja: "水星" },
  { body: Astronomy.Body.Venus, id: "venus", ja: "金星" },
  { body: Astronomy.Body.Mars, id: "mars", ja: "火星" },
  { body: Astronomy.Body.Jupiter, id: "jupiter", ja: "木星" },
  { body: Astronomy.Body.Saturn, id: "saturn", ja: "土星" },
  { body: Astronomy.Body.Uranus, id: "uranus", ja: "天王星" },
  { body: Astronomy.Body.Neptune, id: "neptune", ja: "海王星" },
  { body: Astronomy.Body.Pluto, id: "pluto", ja: "冥王星" },
] as const;
type PlanetId = (typeof PLANETS)[number]["id"];

const TRANSITING: PlanetId[] = ["jupiter", "saturn", "uranus", "neptune", "pluto"];

export const ASPECTS = [
  { id: "conjunction", ja: "合", angle: 0, natalOrb: 8 },
  { id: "sextile", ja: "セクスタイル", angle: 60, natalOrb: 4 },
  { id: "square", ja: "スクエア", angle: 90, natalOrb: 7 },
  { id: "trine", ja: "トライン", angle: 120, natalOrb: 7 },
  { id: "opposition", ja: "オポジション", angle: 180, natalOrb: 8 },
] as const;
type AspectId = (typeof ASPECTS)[number]["id"];

const TRANSIT_ORB = 1.5;
const TROPICAL_YEAR_DAYS = 365.24219;

// --- 基本計算 ----------------------------------------------------------------

export function normalizeDeg(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** 2 つの黄経の最小角距離 (0–180) */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a - b));
  return d > 180 ? 360 - d : d;
}

/** 真黄道座標 (of date) での地心黄経 */
export function eclipticLongitude(planet: PlanetId, date: Date): number {
  if (planet === "sun") return Astronomy.SunPosition(date).elon;
  if (planet === "moon") return Astronomy.EclipticGeoMoon(date).lon;
  const body = PLANETS.find((p) => p.id === planet)!.body;
  return Astronomy.Ecliptic(Astronomy.GeoVector(body, date, true)).elon;
}

function dailyMotion(planet: PlanetId, date: Date): number {
  const before = eclipticLongitude(planet, addDays(date, -0.5));
  const after = eclipticLongitude(planet, addDays(date, 0.5));
  let d = after - before;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function signOf(longitude: number) {
  const index = Math.floor(normalizeDeg(longitude) / 30);
  return { index, id: SIGNS[index].id, ja: SIGNS[index].ja, degree: round(normalizeDeg(longitude) - index * 30, 2) };
}

/** ASC と MC (度)。latitude / longitude は度、東経・北緯が正。 */
export function computeAngles(date: Date, latitude: number, longitude: number) {
  const gast = Astronomy.SiderealTime(date); // 時
  const eps = Astronomy.e_tilt(Astronomy.MakeTime(date)).tobl * DEG;
  const ramc = normalizeDeg(gast * 15 + longitude) * DEG;
  const phi = latitude * DEG;
  const mc = normalizeDeg(Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) / DEG);
  const asc = normalizeDeg(
    Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / DEG,
  );
  return { asc, mc };
}

const DEG = Math.PI / 180;
function round(x: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function findAspect(a: number, b: number, orbOverride?: number) {
  const dist = angularDistance(a, b);
  for (const asp of ASPECTS) {
    const orb = Math.abs(dist - asp.angle);
    if (orb <= (orbOverride ?? asp.natalOrb)) return { aspect: asp, orb };
  }
  return null;
}

// --- 結果の型 ----------------------------------------------------------------

export interface WesternData {
  birth_instant_utc: string;
  time_known: boolean;
  planets: Array<{
    id: PlanetId;
    ja: string;
    longitude: number;
    sign: string;
    sign_ja: string;
    degree_in_sign: number;
    retrograde: boolean;
    house: number | null;
  }>;
  angles: { asc: { longitude: number; sign_ja: string; degree_in_sign: number }; mc: { longitude: number; sign_ja: string; degree_in_sign: number } } | null;
  natal_aspects: Array<{ a: PlanetId; b: PlanetId; aspect: AspectId; aspect_ja: string; orb: number }>;
  element_balance: Record<"fire" | "earth" | "air" | "water", number>;
  period: {
    start: string;
    end: string;
    transits: Array<{
      transiting: PlanetId;
      transiting_ja: string;
      natal_point: string;
      natal_point_ja: string;
      aspect: AspectId;
      aspect_ja: string;
      start: string;
      exact: string;
      end: string;
      min_orb: number;
    }>;
    ingresses: Array<{ planet: PlanetId; planet_ja: string; date: string; sign_ja: string; natal_house: number | null }>;
    progressions: {
      sun_at_start: { sign_ja: string; degree_in_sign: number };
      moon_at_start: { sign_ja: string; degree_in_sign: number };
      moon_sign_changes: Array<{ date: string; sign_ja: string }>;
      sun_sign_changes: Array<{ date: string; sign_ja: string }>;
    };
  };
}

// --- エンジン ----------------------------------------------------------------

function birthInstant(input: EngineInput["birth"]): { date: Date; timeKnown: boolean } {
  const [year, month, day] = input.birthDate.split("-").map(Number);
  const timeKnown = input.birthTime !== null;
  const [hour, minute] = timeKnown ? input.birthTime!.split(":").map(Number) : [12, 0];
  return { date: fromZoned({ year, month, day, hour, minute }, input.timeZone), timeKnown };
}

const ELEMENT_BY_SIGN = ["fire", "earth", "air", "water"] as const;

function compute(input: EngineInput): EngineResult<WesternData> {
  const { birth, period } = input;
  const { date: birthDate, timeKnown } = birthInstant(birth);
  const hasLocation = birth.latitude !== null && birth.longitude !== null;
  const anglesAvailable = timeKnown && hasLocation;
  const caveats: string[] = [];
  if (!timeKnown) {
    caveats.push("出生時刻が不明なため正午で計算。月の位置は最大±7°程度ずれ、ASC・MC・ハウスは算出していない。");
  } else if (!hasLocation) {
    caveats.push("出生地の緯度経度が未登録のため、ASC・MC・ハウスは算出していない。");
  }

  const angles = anglesAvailable ? computeAngles(birthDate, birth.latitude!, birth.longitude!) : null;
  const ascSign = angles ? signOf(angles.asc).index : null;
  const houseOf = (lon: number) => (ascSign === null ? null : ((signOf(lon).index - ascSign + 12) % 12) + 1);

  const natal = PLANETS.map((p) => {
    const lon = eclipticLongitude(p.id, birthDate);
    const s = signOf(lon);
    return {
      id: p.id,
      ja: p.ja,
      longitude: round(lon, 3),
      sign: s.id,
      sign_ja: s.ja,
      degree_in_sign: s.degree,
      retrograde: p.id !== "sun" && p.id !== "moon" && dailyMotion(p.id, birthDate) < 0,
      house: houseOf(lon),
    };
  });

  const natalAspects: WesternData["natal_aspects"] = [];
  for (let i = 0; i < natal.length; i++) {
    for (let j = i + 1; j < natal.length; j++) {
      if (!timeKnown && (natal[i].id === "moon" || natal[j].id === "moon")) continue;
      const hit = findAspect(natal[i].longitude, natal[j].longitude);
      if (hit) {
        natalAspects.push({ a: natal[i].id, b: natal[j].id, aspect: hit.aspect.id, aspect_ja: hit.aspect.ja, orb: round(hit.orb, 2) });
      }
    }
  }

  const elementBalance = { fire: 0, earth: 0, air: 0, water: 0 };
  for (const p of natal.slice(0, 7)) {
    elementBalance[ELEMENT_BY_SIGN[SIGNS.findIndex((s) => s.id === p.sign) % 4]] += 1;
  }

  // トランジット対象の出生点
  const natalPoints: Array<{ id: string; ja: string; lon: number }> = natal
    .filter((p) => ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"].includes(p.id))
    .filter((p) => timeKnown || p.id !== "moon")
    .map((p) => ({ id: p.id, ja: p.ja, lon: p.longitude }));
  if (angles) {
    natalPoints.push({ id: "asc", ja: "ASC", lon: angles.asc }, { id: "mc", ja: "MC", lon: angles.mc });
  }

  const periodStart = parseIsoDate(period.start);
  const periodEnd = parseIsoDate(period.end);
  const days = Math.max(0, Math.floor(daysBetween(periodStart, periodEnd)));

  const transits: WesternData["period"]["transits"] = [];
  const ingresses: WesternData["period"]["ingresses"] = [];

  for (const tp of TRANSITING) {
    const tpJa = PLANETS.find((p) => p.id === tp)!.ja;
    const open = new Map<string, { start: Date; exact: Date; minOrb: number; last: Date }>();
    let prevSign: number | null = null;

    const flush = (key: string) => {
      const w = open.get(key)!;
      const [natalId, aspectId] = key.split("|");
      const np = natalPoints.find((n) => n.id === natalId)!;
      const asp = ASPECTS.find((a) => a.id === aspectId)!;
      transits.push({
        transiting: tp,
        transiting_ja: tpJa,
        natal_point: np.id,
        natal_point_ja: np.ja,
        aspect: asp.id,
        aspect_ja: asp.ja,
        start: formatIsoDate(w.start),
        exact: formatIsoDate(w.exact),
        end: formatIsoDate(w.last),
        min_orb: round(w.minOrb, 2),
      });
      open.delete(key);
    };

    for (let d = 0; d <= days; d++) {
      const date = addDays(periodStart, d);
      const lon = eclipticLongitude(tp, date);

      const sign = signOf(lon).index;
      if (prevSign !== null && sign !== prevSign) {
        ingresses.push({ planet: tp, planet_ja: tpJa, date: formatIsoDate(date), sign_ja: SIGNS[sign].ja, natal_house: houseOf(lon) });
      }
      prevSign = sign;

      const active = new Set<string>();
      for (const np of natalPoints) {
        for (const asp of ASPECTS) {
          const orb = Math.abs(angularDistance(lon, np.lon) - asp.angle);
          if (orb > TRANSIT_ORB) continue;
          const key = `${np.id}|${asp.id}`;
          active.add(key);
          const w = open.get(key);
          if (!w) open.set(key, { start: date, exact: date, minOrb: orb, last: date });
          else {
            w.last = date;
            if (orb < w.minOrb) {
              w.minOrb = orb;
              w.exact = date;
            }
          }
        }
      }
      for (const key of [...open.keys()]) if (!active.has(key)) flush(key);
    }
    for (const key of [...open.keys()]) flush(key);
  }
  transits.sort((a, b) => a.exact.localeCompare(b.exact));

  // 二次進行 (1日 = 1年)
  const progressedDate = (at: Date) => addDays(birthDate, daysBetween(birthDate, at) / TROPICAL_YEAR_DAYS);
  const progSun0 = signOf(eclipticLongitude("sun", progressedDate(periodStart)));
  const progMoon0 = signOf(eclipticLongitude("moon", progressedDate(periodStart)));
  const moonChanges: Array<{ date: string; sign_ja: string }> = [];
  const sunChanges: Array<{ date: string; sign_ja: string }> = [];
  let pm = progMoon0.index;
  let ps = progSun0.index;
  for (let d = 7; d <= days; d += 7) {
    const date = addDays(periodStart, d);
    const pd = progressedDate(date);
    const m = signOf(eclipticLongitude("moon", pd)).index;
    const s = signOf(eclipticLongitude("sun", pd)).index;
    if (m !== pm) moonChanges.push({ date: formatIsoDate(date), sign_ja: SIGNS[m].ja });
    if (s !== ps) sunChanges.push({ date: formatIsoDate(date), sign_ja: SIGNS[s].ja });
    pm = m;
    ps = s;
  }

  const angleView = (lon: number) => {
    const s = signOf(lon);
    return { longitude: round(lon, 3), sign_ja: s.ja, degree_in_sign: s.degree };
  };

  return {
    method: "western_astrology",
    engine_version: WESTERN_ENGINE_VERSION,
    settings: {
      zodiac: "tropical",
      house_system: "whole_sign",
      ephemeris: "astronomy-engine",
      transit_orb_deg: TRANSIT_ORB,
      transiting_planets: TRANSITING.join(","),
      progression: "secondary",
    },
    caveats,
    data: {
      birth_instant_utc: birthDate.toISOString(),
      time_known: timeKnown,
      planets: natal,
      angles: angles ? { asc: angleView(angles.asc), mc: angleView(angles.mc) } : null,
      natal_aspects: natalAspects,
      element_balance: elementBalance,
      period: {
        start: period.start,
        end: period.end,
        transits,
        ingresses,
        progressions: {
          sun_at_start: { sign_ja: progSun0.ja, degree_in_sign: progSun0.degree },
          moon_at_start: { sign_ja: progMoon0.ja, degree_in_sign: progMoon0.degree },
          moon_sign_changes: moonChanges,
          sun_sign_changes: sunChanges,
        },
      },
    },
  };
}

export const westernAstrologyEngine: DivinationEngine<WesternData> = {
  method: "western_astrology",
  version: WESTERN_ENGINE_VERSION,
  compute,
};
