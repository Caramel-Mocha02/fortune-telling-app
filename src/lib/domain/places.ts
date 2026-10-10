/**
 * 出生地: 都道府県 → 市区町村 (政令市は区) の代表点。
 * 出典: 「アドレス・ベース・レジストリ」(デジタル庁) をもとに株式会社 Geolonia が作成したデータ (CC BY 4.0) を加工。
 * 西洋占星術の ASC 計算に使う。経度 1° の差は約 4 分の時差に相当し、市区町村の代表点で十分な精度がある。
 */
import data from "./japan-municipalities.json";

export const PLACE_DATA_ATTRIBUTION = "市区町村の位置: 「アドレス・ベース・レジストリ」(デジタル庁) をもとに株式会社 Geolonia が作成 (CC BY 4.0)";

export interface Prefecture {
  pref: string;
  lat: number;
  lon: number;
  /** [市区町村名, 緯度, 経度] */
  cities: Array<[string, number, number]>;
}

export const PREFECTURES = data.prefectures as Prefecture[];

/** 保存済みの地名 (例: 「東京都新宿区」) を都道府県と市区町村に分ける。見つからなければ null */
export function parsePlaceName(name: string | null): { pref: string; city: string | null } | null {
  if (!name) return null;
  const pref = PREFECTURES.find((p) => name.startsWith(p.pref));
  if (!pref) return null;
  const rest = name.slice(pref.pref.length);
  if (rest === "") return { pref: pref.pref, city: null };
  return pref.cities.some(([c]) => c === rest) ? { pref: pref.pref, city: rest } : null;
}
