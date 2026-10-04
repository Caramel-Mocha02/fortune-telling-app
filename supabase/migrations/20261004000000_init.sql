-- =============================================================================
-- 統合占術・予測検証型ライフログアプリ  初期スキーマ (Phase 1)
--
-- 設計上の要点
--   * 予測 (predictions / prediction_items / prediction_snapshots) は作成後に変更しない。
--     後知恵バイアス対策としてトリガーで UPDATE を拒否する (仕様 10 / 42 / 54-①)。
--   * 答え合わせ (feedback) と評価 (prediction_evaluations) は追記のみ。最新行が現在値。
--   * 全予測にルーティング・モデル・プロンプト・占術エンジンのバージョンを記録する (仕様 23)。
--   * 行レベルセキュリティで本人のデータのみ読み書きできる。DELETE ポリシーは置かない。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 共通: 変更禁止トリガー
-- ---------------------------------------------------------------------------
create or replace function public.reject_update()
returns trigger language plpgsql as $$
begin
  raise exception '% is immutable (append-only)', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- 指定した列以外が変わっていたら拒否する
create or replace function public.allow_only_columns()
returns trigger language plpgsql as $$
declare
  allowed text[] := tg_argv;
begin
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'only % may be updated on %', allowed, tg_table_name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- バージョン管理 (仕様 23 / 24 / 49)
-- ---------------------------------------------------------------------------
create table public.routing_versions (
  version     text primary key,
  description text not null,
  created_at  timestamptz not null default now()
);

create table public.routing_rules (
  routing_version   text not null references public.routing_versions(version),
  category          text not null,
  primary_methods   text[] not null,
  secondary_methods text[] not null,
  primary key (routing_version, category)
);

create table public.model_versions (
  version     text primary key,
  kind        text not null check (kind in ('prediction_model', 'ai_model', 'divination_engine', 'evaluation_rules')),
  description text not null,
  created_at  timestamptz not null default now()
);

create table public.prompt_versions (
  version     text primary key,
  purpose     text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ユーザーの基礎データ
-- ---------------------------------------------------------------------------
create table public.birth_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  birth_date  date not null,
  birth_time  time,                       -- 不明なら null
  time_zone   text not null default 'Asia/Tokyo',
  place_name  text,
  latitude    double precision check (latitude between -90 and 90),
  longitude   double precision check (longitude between -180 and 180),
  gender      text not null default 'unspecified' check (gender in ('female', 'male', 'unspecified')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 質問 (仕様 40)
-- ---------------------------------------------------------------------------
create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text            text not null check (length(text) between 1 and 2000),
  category        text,
  themes          text[] not null default '{}',
  classification  jsonb,
  created_at      timestamptz not null default now()
);
create index questions_user_created_idx on public.questions(user_id, created_at desc);
create index questions_user_category_idx on public.questions(user_id, category);
-- 分類結果は後から付与するため category / themes / classification のみ更新可
create trigger questions_limit_update before update on public.questions
  for each row execute function public.allow_only_columns('category', 'themes', 'classification');

-- ---------------------------------------------------------------------------
-- 予測 (仕様 44)
-- ---------------------------------------------------------------------------
create table public.predictions (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id                uuid not null references public.questions(id),
  parent_prediction_id       uuid references public.predictions(id),   -- 再予測 (仕様 42)
  created_at                 timestamptz not null default now(),
  prediction_period_start    date not null,
  prediction_period_end      date not null check (prediction_period_end >= prediction_period_start),
  category                   text not null,
  methods                    text[] not null,
  routing_version            text not null references public.routing_versions(version),
  prediction_model_version   text not null references public.model_versions(version),
  ai_model                   text not null,
  prompt_version             text not null references public.prompt_versions(version),
  divination_engine_versions jsonb not null,
  summary                    text not null,
  report                     jsonb not null,
  status                     text not null default 'open' check (status in ('open', 'closed'))
);
create index predictions_user_created_idx on public.predictions(user_id, created_at desc);
create trigger predictions_limit_update before update on public.predictions
  for each row execute function public.allow_only_columns('status');

-- ---------------------------------------------------------------------------
-- 予測項目 (仕様 45)
-- ---------------------------------------------------------------------------
create table public.prediction_items (
  id                      uuid primary key default gen_random_uuid(),
  prediction_id           uuid not null references public.predictions(id) on delete cascade,
  user_id                 uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position                int not null,
  theme                   text not null,
  event_type              text not null,
  direction               text not null,
  magnitude               text not null,
  specificity             text not null,
  start_date              date not null,
  end_date                date not null check (end_date >= start_date),
  description             text not null,
  supporting_methods      text[] not null,
  independent_group_count int not null,          -- 相関グループ単位の支持数 (仕様 19)
  signal_strength         text not null check (signal_strength in ('weak', 'moderate', 'strong')),
  rationale               text not null,
  unique (prediction_id, position)
);
create index prediction_items_user_idx on public.prediction_items(user_id);
create trigger prediction_items_immutable before update on public.prediction_items
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------------
-- Prediction Snapshot (仕様 10)
-- ---------------------------------------------------------------------------
create table public.prediction_snapshots (
  id             uuid primary key default gen_random_uuid(),
  prediction_id  uuid not null unique references public.predictions(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  payload        jsonb not null,
  payload_sha256 text not null
);
create trigger prediction_snapshots_immutable before update on public.prediction_snapshots
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------------
-- 答え合わせのリマインド (仕様 28 / 29)
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  due_on        date not null,
  kind          text not null check (kind in ('interim', 'final')),
  completed_at  timestamptz
);
create index check_ins_user_due_idx on public.check_ins(user_id, due_on) where completed_at is null;
create trigger check_ins_limit_update before update on public.check_ins
  for each row execute function public.allow_only_columns('completed_at');

-- ---------------------------------------------------------------------------
-- ライフログと構造化された現実の出来事 (仕様 11 / 30 / 46)
-- ---------------------------------------------------------------------------
create table public.life_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  recorded_at timestamptz not null default now(),
  category    text not null,
  title       text not null check (length(title) between 1 and 200),
  description text
);
create index life_events_user_occurred_idx on public.life_events(user_id, occurred_on desc);

create table public.outcomes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  life_event_id uuid references public.life_events(id) on delete restrict,
  occurred_at   date not null,
  recorded_at   timestamptz not null default now(),
  theme         text not null,
  event_type    text not null,
  direction     text not null,
  magnitude     text not null,
  description   text not null,
  -- user: 手動分類 / ai_confirmed: AI の分類案をユーザーが確認 (編集含む)
  source        text not null check (source in ('user', 'ai_confirmed')),
  confidence    text check (confidence in ('low', 'medium', 'high'))
);
create index outcomes_user_occurred_idx on public.outcomes(user_id, occurred_at desc);
create trigger outcomes_immutable before update on public.outcomes
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------------
-- 答え合わせの回答 (仕様 12 / 13 / 25)。追記のみ。
-- ---------------------------------------------------------------------------
create table public.feedback (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prediction_item_id uuid not null references public.prediction_items(id) on delete cascade,
  check_in_id        uuid references public.check_ins(id) on delete set null,
  verdict            text not null check (verdict in ('occurred', 'partially', 'similar', 'not_occurred', 'pending', 'undeterminable')),
  note               text,
  created_at         timestamptz not null default now()
);
create index feedback_item_idx on public.feedback(prediction_item_id, created_at desc);
create trigger feedback_immutable before update on public.feedback
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------------
-- 予測評価 (仕様 14 / 15 / 26 / 47)。追記のみ。
-- ---------------------------------------------------------------------------
create table public.prediction_evaluations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prediction_item_id uuid not null references public.prediction_items(id) on delete cascade,
  outcome_id         uuid references public.outcomes(id) on delete restrict,
  feedback_id        uuid references public.feedback(id) on delete set null,
  timing_label       text,
  timing_score       numeric(4,3),
  theme_label        text,
  theme_score        numeric(4,3),
  event_label        text not null,
  event_score        numeric(4,3) not null,
  direction_label    text,
  direction_score    numeric(4,3),
  magnitude_label    text,
  magnitude_score    numeric(4,3),
  overall_score      numeric(4,3) not null,
  evaluation_source  text not null check (evaluation_source in ('user_confirmed', 'ai_estimated', 'ambiguous')),
  rules_version      text not null references public.model_versions(version),
  evaluated_at       timestamptz not null default now()
);
create index prediction_evaluations_item_idx on public.prediction_evaluations(prediction_item_id, evaluated_at desc);
create index prediction_evaluations_user_idx on public.prediction_evaluations(user_id);
create trigger prediction_evaluations_immutable before update on public.prediction_evaluations
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------------
-- 占術別性能 (Phase 4 で集計バッチから書き込む。仕様 18 / 20 / 21 / 48)
-- ---------------------------------------------------------------------------
create table public.method_performance (
  method          text not null,
  theme           text not null,
  horizon         text not null,       -- short / mid / long
  sample_count    int not null default 0,
  timing_score    numeric(4,3),
  theme_score     numeric(4,3),
  event_score     numeric(4,3),
  direction_score numeric(4,3),
  last_updated    timestamptz not null default now(),
  primary key (method, theme, horizon)
);

create table public.user_method_performance (
  user_id         uuid not null references auth.users(id) on delete cascade,
  method          text not null,
  theme           text not null,
  sample_count    int not null default 0,
  timing_score    numeric(4,3),
  theme_score     numeric(4,3),
  event_score     numeric(4,3),
  direction_score numeric(4,3),
  last_updated    timestamptz not null default now(),
  primary key (user_id, method, theme)
);

-- ---------------------------------------------------------------------------
-- 行レベルセキュリティ
-- ---------------------------------------------------------------------------
alter table public.routing_versions        enable row level security;
alter table public.routing_rules           enable row level security;
alter table public.model_versions          enable row level security;
alter table public.prompt_versions         enable row level security;
alter table public.birth_profiles          enable row level security;
alter table public.questions               enable row level security;
alter table public.predictions             enable row level security;
alter table public.prediction_items        enable row level security;
alter table public.prediction_snapshots    enable row level security;
alter table public.check_ins               enable row level security;
alter table public.life_events             enable row level security;
alter table public.outcomes                enable row level security;
alter table public.feedback                enable row level security;
alter table public.prediction_evaluations  enable row level security;
alter table public.method_performance      enable row level security;
alter table public.user_method_performance enable row level security;

-- 参照用マスタは誰でも読める (書き込みはマイグレーションのみ)
create policy "read versions" on public.routing_versions for select using (true);
create policy "read rules"    on public.routing_rules    for select using (true);
create policy "read models"   on public.model_versions   for select using (true);
create policy "read prompts"  on public.prompt_versions  for select using (true);
create policy "read global performance" on public.method_performance for select using (true);

create policy "own birth profile select" on public.birth_profiles for select using (user_id = auth.uid());
create policy "own birth profile insert" on public.birth_profiles for insert with check (user_id = auth.uid());
create policy "own birth profile update" on public.birth_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own questions select" on public.questions for select using (user_id = auth.uid());
create policy "own questions insert" on public.questions for insert with check (user_id = auth.uid());
create policy "own questions update" on public.questions for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own predictions select" on public.predictions for select using (user_id = auth.uid());
create policy "own predictions insert" on public.predictions for insert with check (user_id = auth.uid());
create policy "own predictions update" on public.predictions for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own items select" on public.prediction_items for select using (user_id = auth.uid());
create policy "own items insert" on public.prediction_items for insert with check (user_id = auth.uid());

create policy "own snapshots select" on public.prediction_snapshots for select using (user_id = auth.uid());
create policy "own snapshots insert" on public.prediction_snapshots for insert with check (user_id = auth.uid());

create policy "own check-ins select" on public.check_ins for select using (user_id = auth.uid());
create policy "own check-ins insert" on public.check_ins for insert with check (user_id = auth.uid());
create policy "own check-ins update" on public.check_ins for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own life events select" on public.life_events for select using (user_id = auth.uid());
create policy "own life events insert" on public.life_events for insert with check (user_id = auth.uid());

create policy "own outcomes select" on public.outcomes for select using (user_id = auth.uid());
create policy "own outcomes insert" on public.outcomes for insert with check (user_id = auth.uid());

create policy "own feedback select" on public.feedback for select using (user_id = auth.uid());
create policy "own feedback insert" on public.feedback for insert with check (user_id = auth.uid());

create policy "own evaluations select" on public.prediction_evaluations for select using (user_id = auth.uid());
create policy "own evaluations insert" on public.prediction_evaluations for insert with check (user_id = auth.uid());

create policy "own performance select" on public.user_method_performance for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC: 予測一式をトランザクションで保存する
--   予測・予測項目・スナップショット・リマインドが部分的に保存されることを防ぐ。
--   SECURITY INVOKER なので RLS がそのまま効く。
-- ---------------------------------------------------------------------------
create or replace function public.create_prediction(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  item jsonb;
  ci jsonb;
  pos int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from questions where id = (p->>'question_id')::uuid and user_id = uid) then
    raise exception 'question not found';
  end if;

  insert into predictions (
    user_id, question_id, parent_prediction_id, prediction_period_start, prediction_period_end,
    category, methods, routing_version, prediction_model_version, ai_model, prompt_version,
    divination_engine_versions, summary, report
  ) values (
    uid,
    (p->>'question_id')::uuid,
    nullif(p->>'parent_prediction_id', '')::uuid,
    (p->>'period_start')::date,
    (p->>'period_end')::date,
    p->>'category',
    array(select jsonb_array_elements_text(p->'methods')),
    p->>'routing_version',
    p->>'prediction_model_version',
    p->>'ai_model',
    p->>'prompt_version',
    p->'divination_engine_versions',
    p->>'summary',
    p->'report'
  ) returning id into pid;

  for item in select * from jsonb_array_elements(p->'items') loop
    insert into prediction_items (
      prediction_id, user_id, position, theme, event_type, direction, magnitude, specificity,
      start_date, end_date, description, supporting_methods, independent_group_count,
      signal_strength, rationale
    ) values (
      pid, uid, pos,
      item->>'theme', item->>'event_type', item->>'direction', item->>'magnitude', item->>'specificity',
      (item->>'start_date')::date, (item->>'end_date')::date, item->>'description',
      array(select jsonb_array_elements_text(item->'supporting_methods')),
      (item->>'independent_group_count')::int,
      item->>'signal_strength', item->>'rationale'
    );
    pos := pos + 1;
  end loop;

  insert into prediction_snapshots (prediction_id, user_id, payload, payload_sha256)
  values (pid, uid, p->'snapshot', encode(sha256(convert_to((p->'snapshot')::text, 'UTF8')), 'hex'));

  for ci in select * from jsonb_array_elements(p->'check_ins') loop
    insert into check_ins (user_id, prediction_id, due_on, kind)
    values (uid, pid, (ci->>'due_on')::date, ci->>'kind');
  end loop;

  return pid;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 答え合わせの回答と評価をまとめて保存する
-- ---------------------------------------------------------------------------
create or replace function public.record_check_in(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  entry jsonb;
  fid uuid;
  ev jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  for entry in select * from jsonb_array_elements(p->'entries') loop
    insert into feedback (user_id, prediction_item_id, check_in_id, verdict, note)
    values (uid, (entry->>'prediction_item_id')::uuid, nullif(p->>'check_in_id', '')::uuid,
            entry->>'verdict', nullif(entry->>'note', ''))
    returning id into fid;

    ev := entry->'evaluation';
    if ev is not null and jsonb_typeof(ev) = 'object' then
      insert into prediction_evaluations (
        user_id, prediction_item_id, outcome_id, feedback_id,
        timing_label, timing_score, theme_label, theme_score, event_label, event_score,
        direction_label, direction_score, magnitude_label, magnitude_score, overall_score,
        evaluation_source, rules_version
      ) values (
        uid, (entry->>'prediction_item_id')::uuid, nullif(entry->>'outcome_id', '')::uuid, fid,
        ev->>'timing_label', (ev->>'timing_score')::numeric, ev->>'theme_label', (ev->>'theme_score')::numeric,
        ev->>'event_label', (ev->>'event_score')::numeric,
        ev->>'direction_label', (ev->>'direction_score')::numeric,
        ev->>'magnitude_label', (ev->>'magnitude_score')::numeric,
        (ev->>'overall_score')::numeric,
        ev->>'evaluation_source', ev->>'rules_version'
      );
    end if;
  end loop;

  if nullif(p->>'check_in_id', '') is not null then
    update check_ins set completed_at = now()
    where id = (p->>'check_in_id')::uuid and user_id = uid and completed_at is null;
  end if;

  if (p->>'close_prediction_id') is not null then
    update predictions set status = 'closed'
    where id = (p->>'close_prediction_id')::uuid and user_id = uid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 初期データ: バージョン (src/lib/versions.ts と一致させる)
-- ---------------------------------------------------------------------------
insert into public.routing_versions (version, description) values
  ('routing_v1', '仕様書 v2.0 §6 の専門家ルール。未実装占術はスキップして記録');

insert into public.routing_rules (routing_version, category, primary_methods, secondary_methods) values
  ('routing_v1', 'LIFE',          '{western_astrology,four_pillars,zi_wei_dou_shu}', '{sanmei,numerology}'),
  ('routing_v1', 'CAREER',        '{western_astrology,four_pillars,zi_wei_dou_shu}', '{sanmei}'),
  ('routing_v1', 'MONEY',         '{four_pillars,zi_wei_dou_shu,western_astrology}', '{numerology}'),
  ('routing_v1', 'LOVE',          '{western_astrology,four_pillars,zi_wei_dou_shu}', '{sanmei,numerology}'),
  ('routing_v1', 'MARRIAGE',      '{western_astrology,four_pillars,zi_wei_dou_shu}', '{sanmei}'),
  ('routing_v1', 'RELATIONSHIP',  '{western_astrology,zi_wei_dou_shu,four_pillars}', '{sanmei}'),
  ('routing_v1', 'STUDY',         '{western_astrology,four_pillars}',                '{numerology}'),
  ('routing_v1', 'HEALTH',        '{western_astrology,four_pillars}',                '{}'),
  ('routing_v1', 'MOVE',          '{kyusei,western_astrology,four_pillars}',         '{}'),
  ('routing_v1', 'TRAVEL',        '{kyusei,western_astrology}',                      '{four_pillars}'),
  ('routing_v1', 'DECISION',      '{tarot,western_astrology}',                       '{four_pillars}'),
  ('routing_v1', 'TIMING',        '{western_astrology,four_pillars,kyusei}',         '{numerology}'),
  ('routing_v1', 'CURRENT_STATE', '{palmistry,tarot,western_astrology}',             '{four_pillars}'),
  ('routing_v1', 'OTHER',         '{western_astrology,four_pillars}',                '{}');

insert into public.model_versions (version, kind, description) values
  ('prediction_model_v1',    'prediction_model',  '分類 → ルーティング → 計算 → Claude 解釈 → 構造化保存'),
  ('claude-opus-5-5',        'ai_model',          'Claude Opus 5.5'),
  ('western_engine_v1',      'divination_engine', 'トロピカル / ホールサイン / 外惑星トランジット / 二次進行'),
  ('four_pillars_engine_v1', 'divination_engine', '立春・節入り切替 / 0時日替わり / 大運・流年・流月'),
  ('evaluation_rules_v1',    'evaluation_rules',  '時期・テーマ・イベント・方向・規模のルールベース評価');

insert into public.prompt_versions (version, purpose, description) values
  ('classify_v1',        'question_classification', '質問分類 (14 カテゴリー)'),
  ('interpret_v1',       'interpretation',          '複数占術の解釈と予測項目の構造化'),
  ('structure_event_v1', 'life_event_structuring',  'ライフログの構造化');
