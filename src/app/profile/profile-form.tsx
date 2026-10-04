"use client";
import { useActionState, useState } from "react";
import { saveProfile, type ProfileState } from "./actions";
import { JAPAN_PLACES } from "@/lib/domain/places";
import { SubmitButton } from "@/components/submit-button";
import { ErrorMessage } from "@/components/ui";
import type { BirthProfileRow } from "@/lib/db/types";

export function ProfileForm({ initial }: { initial: BirthProfileRow | null }) {
  const [state, action] = useActionState<ProfileState, FormData>(saveProfile, {});
  const [timeUnknown, setTimeUnknown] = useState(initial ? initial.birth_time === null : false);
  const [place, setPlace] = useState({
    name: initial?.place_name ?? "",
    lat: initial?.latitude?.toString() ?? "",
    lon: initial?.longitude?.toString() ?? "",
  });

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="birth_date">生年月日</label>
          <input id="birth_date" name="birth_date" type="date" required defaultValue={initial?.birth_date ?? ""} />
        </div>
        <div className="space-y-1">
          <label htmlFor="birth_time">出生時刻</label>
          <input
            id="birth_time"
            name="birth_time"
            type="time"
            disabled={timeUnknown}
            required={!timeUnknown}
            defaultValue={initial?.birth_time?.slice(0, 5) ?? ""}
          />
          <label className="flex items-center gap-2 font-normal text-muted">
            <input
              type="checkbox"
              name="time_unknown"
              className="w-auto"
              checked={timeUnknown}
              onChange={(e) => setTimeUnknown(e.target.checked)}
            />
            時刻が分からない
          </label>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="preset">出生地</label>
        <select
          id="preset"
          value=""
          onChange={(e) => {
            const p = JAPAN_PLACES.find((x) => x.name === e.target.value);
            if (p) setPlace({ name: p.name, lat: String(p.lat), lon: String(p.lon) });
          }}
        >
          <option value="">都道府県から選ぶ…</option>
          {JAPAN_PLACES.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="grid gap-2 pt-2 sm:grid-cols-3">
          <input name="place_name" placeholder="地名" value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} />
          <input name="latitude" placeholder="緯度 (北緯+)" inputMode="decimal" value={place.lat} onChange={(e) => setPlace({ ...place, lat: e.target.value })} />
          <input name="longitude" placeholder="経度 (東経+)" inputMode="decimal" value={place.lon} onChange={(e) => setPlace({ ...place, lon: e.target.value })} />
        </div>
        <p className="text-xs text-muted">出生時刻と出生地があると、西洋占星術のアセンダント・ハウスを計算できます。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="time_zone">タイムゾーン</label>
          <input id="time_zone" name="time_zone" defaultValue={initial?.time_zone ?? "Asia/Tokyo"} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="gender">性別</label>
          <select id="gender" name="gender" defaultValue={initial?.gender ?? "unspecified"}>
            <option value="unspecified">指定しない</option>
            <option value="female">女性</option>
            <option value="male">男性</option>
          </select>
          <p className="text-xs text-muted">四柱推命の大運 (10年ごとの運気) の向きの計算にのみ使います。</p>
        </div>
      </div>

      <ErrorMessage message={state.error} />
      <SubmitButton>保存する</SubmitButton>
    </form>
  );
}
