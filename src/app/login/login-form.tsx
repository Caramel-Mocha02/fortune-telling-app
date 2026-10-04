"use client";
import { useActionState, useState } from "react";
import { authenticate, type AuthState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ErrorMessage } from "@/components/ui";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action] = useActionState<AuthState, FormData>(authenticate, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <div className="space-y-1">
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1">
        <label htmlFor="password">パスワード</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </div>
      <ErrorMessage message={state.error} />
      {state.message && <p className="text-sm text-accent">{state.message}</p>}
      <div className="flex items-center justify-between">
        <SubmitButton>{mode === "signup" ? "登録する" : "ログイン"}</SubmitButton>
        <button
          type="button"
          className="text-sm text-muted underline"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        >
          {mode === "signup" ? "アカウントをお持ちの方" : "新規登録はこちら"}
        </button>
      </div>
    </form>
  );
}
