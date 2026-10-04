"use client";
import { useActionState, useState } from "react";
import { deleteAccount, type DeleteState } from "./actions";
import { buttonClass, ErrorMessage } from "@/components/ui";

export function DataManagement() {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccount, {});
  const [confirm, setConfirm] = useState("");
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium">データの書き出し</h3>
        <p className="text-sm text-muted">
          プロフィール・質問・予測 (Snapshot を含む)・ライフログ・答え合わせ・評価・手相の観察結果などを JSON ファイルでダウンロードします。手相画像そのものは含みません。
        </p>
        <a href="/api/export" className={buttonClass("secondary")} download>
          データを書き出す
        </a>
      </div>

      <form action={action} className="space-y-2 rounded-lg border border-red-300 p-4 dark:border-red-900">
        <h3 className="font-medium text-red-700 dark:text-red-300">アカウントの削除</h3>
        <p className="text-sm text-muted">
          アカウントと、予測・ライフログ・答え合わせ・手相画像を含むすべてのデータを削除します。<b>元に戻せません。</b>
          必要なら先にデータを書き出してください。
        </p>
        <label htmlFor="confirm" className="block text-sm font-normal">
          確認のため「削除」と入力してください
        </label>
        <input id="confirm" name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        <ErrorMessage message={state.error} />
        <button
          type="submit"
          disabled={confirm !== "削除" || pending}
          className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "削除しています…" : "アカウントを削除する"}
        </button>
      </form>
    </div>
  );
}
