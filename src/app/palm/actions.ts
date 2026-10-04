"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { observePalm, type PalmMediaType } from "@/lib/ai/observe-palm";
import { AiError } from "@/lib/ai/client";
import { PROMPT_VERSIONS } from "@/lib/versions";
import { PALM_BUCKET } from "@/lib/supabase/buckets";

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<PalmMediaType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const UploadSchema = z.object({
  hand: z.enum(["left", "right"]),
  captured_on: z.iso.date("撮影日を入力してください"),
});

export interface PalmState {
  error?: string;
  ok?: number;
}

export async function uploadPalm(prev: PalmState, formData: FormData): Promise<PalmState> {
  const { supabase, userId } = await requireUser();
  const parsed = UploadSchema.safeParse({ hand: formData.get("hand"), captured_on: formData.get("captured_on") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "画像を選択してください" };
  if (!(file.type in EXT)) return { error: "JPEG・PNG・WebP の画像を選択してください" };
  if (file.size > MAX_BYTES) return { error: "画像は 5MB 以下にしてください" };
  const mediaType = file.type as PalmMediaType;
  const bytes = Buffer.from(await file.arrayBuffer());

  // 1. 観察 (画像から線と形を構造化。解釈はしない)
  let observation;
  let model: string;
  try {
    ({ output: observation, model } = await observePalm(bytes.toString("base64"), mediaType));
  } catch (error) {
    return { error: error instanceof AiError ? error.message : "画像の読み取りに失敗しました" };
  }
  if (!observation.usable) {
    return { error: `手のひらの線を判別できませんでした。明るい場所で手のひら全体を正面から撮影してください。(${observation.notes})` };
  }

  // 2. 画像を本人のフォルダに保存
  const path = `${userId}/${randomUUID()}.${EXT[mediaType]}`;
  const { error: uploadError } = await supabase.storage.from(PALM_BUCKET).upload(path, bytes, { contentType: mediaType });
  if (uploadError) return { error: `画像の保存に失敗しました: ${uploadError.message}` };

  // 3. 観察結果を固定保存
  const { error } = await supabase.from("palm_readings").insert({
    hand: parsed.data.hand,
    captured_on: parsed.data.captured_on,
    image_path: path,
    observation,
    observe_model: model,
    prompt_version: PROMPT_VERSIONS.observePalm,
  });
  if (error) {
    await supabase.storage.from(PALM_BUCKET).remove([path]);
    return { error: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath("/palm");
  return { ok: (prev.ok ?? 0) + 1 };
}

export async function deletePalm(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const { data } = await supabase.from("palm_readings").select("image_path").eq("id", id).maybeSingle();
  if (!data) return;
  await supabase.storage.from(PALM_BUCKET).remove([data.image_path]);
  await supabase.from("palm_readings").delete().eq("id", id);
  revalidatePath("/palm");
}
