"use client";
import { useActionState, useState } from "react";
import { saveProfile, type ProfileState } from "./actions";
import { parsePlaceName, PLACE_DATA_ATTRIBUTION, PREFECTURES } from "@/lib/domain/places";
import { SubmitButton } from "@/components/submit-button";
import { ErrorMessage } from "@/components/ui";
import type { BirthProfileRow } from "@/lib/db/types";
import { BirthFields } from "./birth-fields";

export function ProfileForm({ initial }: { initial: BirthProfileRow | null }) {
  const [state, action] = useActionState<ProfileState, FormData>(saveProfile, {});
  const [place, setPlace] = useState({
    name: initial?.place_name ?? "",
    lat: initial?.latitude?.toString() ?? "",
    lon: initial?.longitude?.toString() ?? "",
  });
  const parsed = parsePlaceName(initial?.place_name ?? null);
  const [pref, setPref] = useState(parsed?.pref ?? "");
  const [city, setCity] = useState(parsed?.city ?? "");
  // 一覧にない地名 (海外や旧データ) が保存されていれば、座標の直接入力を開いておく
  const [manual, setManual] = useState(Boolean(initial?.place_name) && !parsed);
  const prefData = PREFECTURES.find((p) => p.pref === pref);

  const choose = (prefName: string, cityName: string) => {
    setPref(prefName);
    setCity(cityName);
    const p = PREFECTURES.find((x) => x.pref === prefName);
    if (!p) return setPlace({ name: "", lat: "", lon: "" });
    const c = p.cities.find(([n]) => n === cityName);
    // 市区町村が分からなければ都道府県の代表点を使う
    setPlace(c ? { name: `${p.pref}${c[0]}`, lat: String(c[1]), lon: String(c[2]) } : { name: p.pref, lat: String(p.lat), lon: String(p.lon) });
  };

  return (
    <form action={action} className="space-y-5">
      <BirthFields initialDate={initial?.birth_date ?? null} initialTime={initial?.birth_time ?? null} />

      <div className="space-y-2">
        <span className="text-sm font-medium">出生地</span>
        <input type="hidden" name="place_name" value={place.name} />
        <input type="hidden" name="latitude" value={place.lat} />
        <input type="hidden" name="longitude" value={place.lon} />
        {!manual && (
          <div className="grid gap-2 sm:grid-cols-2">
            <select aria-label="都道府県" value={pref} onChange={(e) => choose(e.target.value, "")}>
              <option value="">都道府県を選ぶ…</option>
              {PREFECTURES.map((p) => (
                <option key={p.pref} value={p.pref}>
                  {p.pref}
                </option>
              ))}
            </select>
            <select aria-label="市区町村" value={city} disabled={!prefData} onChange={(e) => choose(pref, e.target.value)}>
              <option value="">{prefData ? "市区町村が分からない" : "先に都道府県を選んでください"}</option>
              {prefData?.cities.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        {manual && (
          <div className="grid gap-2 sm:grid-cols-3">
            <input aria-label="地名" placeholder="地名" value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} />
            <input aria-label="緯度" placeholder="緯度 (北緯+)" inputMode="decimal" value={place.lat} onChange={(e) => setPlace({ ...place, lat: e.target.value })} />
            <input aria-label="経度" placeholder="経度 (東経+)" inputMode="decimal" value={place.lon} onChange={(e) => setPlace({ ...place, lon: e.target.value })} />
          </div>
        )}
        <button
          type="button"
          className="text-xs text-muted underline"
          onClick={() => {
            setManual(!manual);
            if (manual) choose("", "");
          }}
        >
          {manual ? "一覧から選ぶ" : "海外で生まれた・緯度経度を直接入力する"}
        </button>
        <p className="text-xs text-muted">生まれた時刻と場所が分かると、西洋占星術などでより細かく占えます。</p>
        <p className="text-[10px] text-muted">{PLACE_DATA_ATTRIBUTION}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="time_zone">生まれた国の時間帯</label>
          <input id="time_zone" name="time_zone" defaultValue={initial?.time_zone ?? "Asia/Tokyo"} required />
          <p className="text-xs text-muted">日本で生まれた場合は、このまま (Asia/Tokyo) で大丈夫です。</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="gender">性別</label>
          <select id="gender" name="gender" defaultValue={initial?.gender ?? "unspecified"}>
            <option value="unspecified">指定しない</option>
            <option value="female">女性</option>
            <option value="male">男性</option>
          </select>
          <p className="text-xs text-muted">10年ごとの運気の流れを計算するのに使います (四柱推命・紫微斗数)。</p>
        </div>
      </div>

      <ErrorMessage message={state.error} />
      <SubmitButton>保存する</SubmitButton>
    </form>
  );
}
