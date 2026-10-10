"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CredentialsSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
});

/** Supabase Auth のエラーコードを、次に何をすればよいか分かる日本語にする */
function authErrorMessage(error: { code?: string; message: string }, mode: "signin" | "signup"): string {
  switch (error.code) {
    case "email_not_confirmed":
      return "メールアドレスの確認が済んでいません。登録時に届いた確認メールのリンクを押してください。";
    case "invalid_credentials":
      return "メールアドレスまたはパスワードが正しくありません。まだ登録していない場合は「新規登録はこちら」から登録してください。";
    case "user_already_exists":
    case "email_exists":
      return "このメールアドレスはすでに登録されています。ログインしてください。";
    case "weak_password":
      return "パスワードが弱すぎます。もっと長く、推測されにくいものにしてください。";
    case "over_email_send_rate_limit":
      return "確認メールの送信回数の上限に達しました。しばらく (1時間ほど) 待ってから、もう一度お試しください。";
    case "over_request_rate_limit":
      return "短時間に操作が集中しました。少し待ってからお試しください。";
    case "email_address_invalid":
      return "このメールアドレスは使えません。別のメールアドレスをお試しください。";
    default:
      return mode === "signin" ? "ログインできませんでした。" : `登録できませんでした (${error.message})`;
  }
}

export interface AuthState {
  error?: string;
  message?: string;
}

export async function authenticate(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = CredentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  if (formData.get("mode") === "signup") {
    const origin = (await headers()).get("origin") ?? "";
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (error) return { error: authErrorMessage(error, "signup") };
    if (!data.session) return { message: "確認メールを送信しました。メール内のリンクから登録を完了してください。" };
  } else {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: authErrorMessage(error, "signin") };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
