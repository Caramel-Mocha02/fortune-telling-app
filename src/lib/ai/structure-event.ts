import "server-only";
import { z } from "zod";
import { DirectionSchema, EVENT_TYPES, EventTypeSchema, MagnitudeSchema, ThemeSchema } from "@/lib/domain/taxonomy";
import { callStructured } from "./client";

export const EventStructureSchema = z.object({
  theme: ThemeSchema,
  event_type: EventTypeSchema,
  direction: DirectionSchema,
  magnitude: MagnitudeSchema,
  confidence: z.enum(["low", "medium", "high"]).describe("この分類の確からしさ"),
});
export type EventStructure = z.infer<typeof EventStructureSchema>;

const SYSTEM = `ライフログに記録された現実の出来事を、予測と照合できる形に分類します。
書かれている事実だけを分類し、出来事を膨らませたり、占いの予測に合わせて解釈したりしません。

event_type は次から選ぶ: ${Object.entries(EVENT_TYPES)
  .map(([k, v]) => `${k}=${v.label}`)
  .join(", ")}
direction: positive=本人にとって良い変化, negative=悪い変化, change=良し悪しを問わない変化, stable=継続, unknown=不明
magnitude: small / medium / large (本人の生活への影響の大きさ)`;

export async function structureEvent(description: string) {
  return callStructured({
    system: SYSTEM,
    user: `出来事:\n${description}`,
    schema: EventStructureSchema,
    effort: "low",
    maxTokens: 2000,
  });
}
