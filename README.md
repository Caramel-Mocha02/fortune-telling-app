# 予測ログ — 統合占術・予測検証型ライフログ (Phase 1)

占術で未来の仮説を立て、改変せずに保存し、現実の出来事と照合して検証を積み重ねるアプリです。
仕様書 v2.0 の Phase 1〜3 を実装しています。
8 占術 (西洋占星術・四柱推命・紫微斗数・算命学・九星気学・数秘術・タロット・手相)、AI 解釈、予測保存、
ライフログ、答え合わせ、自動照合 (候補提示) に対応しています。

## セットアップ

```bash
npm install
cp .env.example .env.local   # Supabase と Anthropic の値を設定
```

1. Supabase プロジェクトを用意する (クラウド、または `supabase start`)
2. `supabase/migrations/` の SQL をファイル名順にすべて適用する (`supabase db push` または SQL エディタ)
3. `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `ANTHROPIC_API_KEY` を設定
4. `npm run dev`

接続設定がない間は、どのページも `/setup` の案内に誘導されます。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm test` | 計算エンジン・評価ルール・ルーターのテスト (vitest) |
| `npm run typecheck` | 型チェック |
| `npm run build` | 本番ビルド |

## 構成

```
src/lib/
  domain/taxonomy.ts        予測・現実・評価で共有する分類体系 (テーマ/方向/イベント種別/規模…)
  divination/               占術計算エンジン (AI には計算させない — 仕様 7)
    western/engine.ts       西洋占星術 v1: トロピカル・ホールサイン・外惑星トランジット・二次進行
    four-pillars/engine.ts  四柱推命 v1: 立春/節入り切替・十神・蔵干・大運・流年・流月
    sanmei/engine.ts        算命学 v1: 陽占 (十大主星・十二大従星)・天中殺・流年流月
    zi-wei/engine.ts        紫微斗数 v1: 命宮・五行局・14主星+補助星・四化・大限・流年
    kyusei/engine.ts        九星気学 v1: 本命星・月命星・年盤/月盤・吉方/凶方
    numerology/engine.ts    数秘術 v1: ライフパス・個人年/月・ピナクル
    tarot/engine.ts         タロット v1: 78 枚・逆位置あり・シード固定の引き (Snapshot に保存)
    palmistry/engine.ts     手相 v1: 登録済み観察結果の最新状態と前回比較
    calendar/lunar.ts       旧暦変換 (定気法・閏月判定)
    registry.ts             占術一覧と相関グループ (仕様 19)
  routing/router.ts         質問分類 → 使用占術 (routing_v1)。未実装の占術はスキップ理由を記録
  ai/                       Claude 呼び出し (分類・解釈・ライフログ構造化。構造化出力)
  prediction/pipeline.ts    分類 → ルーティング → 計算 → 解釈 → Snapshot → 保存
  prediction/schedule.ts    予測期間の決定と答え合わせリマインド日程 (仕様 29)
  evaluation/evaluate.ts    ルールベースの多軸評価 (時期・テーマ・イベント・方向・規模)
  evaluation/check-in.ts    答え合わせ回答 → 評価レコード (user_confirmed / ambiguous の区別)
  evaluation/match.ts       自動照合: 出来事と予測項目の候補を評価ルールで抽出 (保存はしない)
  evaluation/performance.ts 実績要約。n<10 は「データ不足」として数値を出さない
  ai/observe-palm.ts        手相画像 → 線・形の観察 (登録時に 1 回だけ。解釈はしない)
  versions.ts               予測に記録する全バージョン
supabase/migrations/        スキーマ・RLS・不変性トリガー・RPC・初期データ
```

## 設計上の保証

- **後知恵バイアス対策**: `predictions` / `prediction_items` / `prediction_snapshots` は DB トリガーで更新を拒否します (service role でも不可)。予測で変更できるのは `status` だけです。再予測は `parent_prediction_id` を持つ別の予測として保存されます。
- **Snapshot**: 出生データ・分類・ルーティング・各エンジンの生データ・AI 解釈・全バージョンを JSON で保存し、SHA-256 を記録します。
- **追記型の評価**: `feedback` と `prediction_evaluations` は追記のみで、最新の行を現在の値として扱います。
- **AI に当否を判定させない**: 評価スコアは `evaluation_rules_v1` の固定ルールで計算します。ライフログの出来事が紐付かない「当たった」は `ambiguous` として区別します。
- **「まだ分からない」**: 期間中の「起きなかった」は評価せず、回答だけ保存します。
- **タロットの引き直し防止**: 引きは乱数シードから決定的に再現でき、シードと引いたカードは Snapshot に保存されます。
- **自動照合は候補のみ**: 出来事を記録すると関連しそうな予測項目を提示しますが、評価として保存されるのは答え合わせで本人が確認したときだけです。
- **手相画像**: 非公開バケットの本人フォルダに保存し、本人が削除できます。予測に使った観察結果は Snapshot に残るため、削除しても過去の予測は変わりません。
- **断定の禁止**: 総合スコアは画面に出しません。占術上のシグナルと過去の個人実績は分けて表示します。

## 計算上の既定値 (流派)

| 項目 | 既定値 |
|---|---|
| 西洋: 黄道 / ハウス | トロピカル / ホールサイン |
| 西洋: トランジットのオーブ | 1.5° (木星〜冥王星) |
| 四柱推命: 日の区切り | 0 時 (23 時台は当日の干で子の刻) |
| 四柱推命: 時刻 | 標準時 (真太陽時補正なし) |
| 出生時刻不明 | 正午で計算し、ASC・ハウス・時柱・紫微斗数の命盤は出さない |
| 算命学: 蔵干 | 本元 (主気) のみ。節入りからの日数で選ぶ流派には未対応 |
| 紫微斗数: 暦 / 閏月 | 出生地タイムゾーンの旧暦 / 15日までは当月、16日以降は翌月 |
| 紫微斗数: 庚干の四化 | 太陽禄・武曲権・太陰科・天同忌 |
| 九星気学: 吉方 | 本命星と相生・比和の星の方位 (月命星は考慮しない) |
| 数秘術 | ピタゴラス式・全桁合計。氏名を使う数は未対応 (プロフィールに氏名がないため) |

既定値は各エンジンの `settings` として Snapshot に記録されます。変更する場合はエンジンのバージョンを上げてください (仕様 49)。

## 未実装のもの (Phase 4 以降)
- プッシュ/メール通知 (答え合わせの期日はホーム画面に表示)
- 占術別・ユーザー別の性能集計、個人別ルーティング、予測モデル比較、月次・年次レビュー (テーブル `method_performance` / `user_method_performance` のみ用意)
