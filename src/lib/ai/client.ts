import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { CLAUDE_MODEL } from "@/lib/versions";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class AiError extends Error {}

interface StructuredCallOptions<T extends z.ZodType> {
  system: string;
  /** テキスト、または画像などを含むコンテンツブロック */
  user: string | Anthropic.Beta.Messages.BetaContentBlockParam[];
  schema: T;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}

/**
 * スキーマで構造化された JSON を返す Claude 呼び出し。
 * 安全分類器による拒否に備え、サーバー側フォールバック ("default") を有効にしている。
 */
export async function callStructured<T extends z.ZodType>(
  opts: StructuredCallOptions<T>,
): Promise<{ output: z.infer<T>; model: string; usage: { input_tokens: number; output_tokens: number } }> {
  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiError("Claude API の認証に失敗しました。ANTHROPIC_API_KEY を確認してください。");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiError("Claude API のレート制限に達しました。しばらくしてから再試行してください。");
    }
    if (error instanceof Anthropic.APIError) {
      throw new AiError(`Claude API エラー (${error.status ?? "接続"}): ${error.message}`);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new AiError("この内容には回答できませんでした。質問の表現を変えてお試しください。");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError("AI の出力が長すぎて途中で終了しました。");
  }
  if (response.parsed_output == null) {
    throw new AiError("AI の出力を解析できませんでした。");
  }
  return {
    output: response.parsed_output as z.infer<T>,
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
