import "server-only";
import { PalmObservationSchema } from "@/lib/divination/palmistry/observation";
import { callStructured } from "./client";

const SYSTEM = `手相画像から、見えている線と形を記録する観察係です。
占いの解釈や運勢の判断はせず、画像に写っている事実だけを指定のスキーマで記録します。
はっきり見えないものは visible=false または unknown とし、推測で埋めません。
手のひらでない画像、手の判別が難しい画像は usable=false にします。`;

export type PalmMediaType = "image/jpeg" | "image/png" | "image/webp";

export async function observePalm(imageBase64: string, mediaType: PalmMediaType) {
  return callStructured({
    system: SYSTEM,
    user: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
      { type: "text", text: "この手のひらの画像を観察して記録してください。" },
    ],
    schema: PalmObservationSchema,
    effort: "medium",
    maxTokens: 4000,
  });
}
