"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/time/zoned";

const optionalNumber = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null ? null : Number(v)), z.number().min(min).max(max).nullable());

const ProfileSchema = z.object({
  birth_date: z.iso.date("生年月日を入力してください"),
  birth_time: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{2}:\d{2}$/).nullable()),
  time_zone: z.string().refine(isValidTimeZone, "タイムゾーンが正しくありません"),
  place_name: z.preprocess((v) => (v === "" ? null : v), z.string().max(100).nullable()),
  latitude: optionalNumber(-90, 90),
  longitude: optionalNumber(-180, 180),
  gender: z.enum(["female", "male", "unspecified"]),
});

export interface ProfileState {
  error?: string;
}

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase, userId } = await requireUser();
  const timeUnknown = formData.get("time_unknown") === "on";
  const parsed = ProfileSchema.safeParse({
    birth_date: formData.get("birth_date"),
    birth_time: timeUnknown ? "" : formData.get("birth_time"),
    time_zone: formData.get("time_zone"),
    place_name: formData.get("place_name"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    gender: formData.get("gender"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if ((parsed.data.latitude === null) !== (parsed.data.longitude === null)) {
    return { error: "緯度と経度は両方入力するか、両方空欄にしてください" };
  }

  // 過去の予測は Snapshot に当時の出生データを保持しているため、ここでの更新は影響しない (仕様 10)
  const { error } = await supabase
    .from("birth_profiles")
    .upsert({ user_id: userId, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return { error: `保存に失敗しました: ${error.message}` };
  revalidatePath("/", "layout");
  redirect("/");
}
