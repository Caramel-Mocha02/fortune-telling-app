-- =============================================================================
-- 仕様 17: ベースライン予測との比較
--   Baseline B (history): 本人の過去のライフログのみ
--   Baseline C (prior):   年齢・季節・一般的なライフイベントのみ
-- 本物の予測と同時に作成して固定保存する。採点は比較専用で、占術別の実績には混ぜない。
-- =============================================================================

alter table public.model_versions drop constraint model_versions_kind_check;
alter table public.model_versions add constraint model_versions_kind_check
  check (kind in ('prediction_model', 'ai_model', 'divination_engine', 'evaluation_rules', 'baseline_rules'));

insert into public.model_versions (version, kind, description) values
  ('baseline_rules_v1', 'baseline_rules', 'B: テーマ内で最頻の過去の出来事 / C: 年齢層の典型 + 4月を含む仕事は役割変化')
on conflict (version) do nothing;

create table public.baseline_items (
  id            uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model_item_id uuid not null references public.prediction_items(id) on delete cascade,
  baseline      text not null check (baseline in ('history', 'prior')),
  theme         text not null,
  event_type    text not null,
  direction     text not null,
  magnitude     text not null,
  start_date    date not null,
  end_date      date not null check (end_date >= start_date),
  basis         text not null,
  rules_version text not null references public.model_versions(version),
  unique (model_item_id, baseline)
);
create index baseline_items_user_idx on public.baseline_items(user_id);
create trigger baseline_items_immutable before update on public.baseline_items
  for each row execute function public.reject_update();

alter table public.baseline_items enable row level security;
create policy "own baselines select" on public.baseline_items for select using (user_id = auth.uid());
create policy "own baselines insert" on public.baseline_items for insert with check (user_id = auth.uid());

-- create_prediction を再定義してベースラインも保存する
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
  bl jsonb;
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

  -- ベースライン予測 (仕様 17): 同じトランザクションで固定保存し、後から追加・変更できないようにする
  for bl in select * from jsonb_array_elements(coalesce(p->'baseline_items', '[]'::jsonb)) loop
    insert into baseline_items (
      prediction_id, user_id, model_item_id, baseline, theme, event_type, direction, magnitude,
      start_date, end_date, basis, rules_version
    ) values (
      pid, uid,
      (select id from prediction_items where prediction_id = pid and position = (bl->>'position')::int),
      bl->>'baseline', bl->>'theme', bl->>'event_type', bl->>'direction', bl->>'magnitude',
      (bl->>'start_date')::date, (bl->>'end_date')::date, bl->>'basis', p->>'baseline_rules_version'
    );
  end loop;

  for ci in select * from jsonb_array_elements(p->'check_ins') loop
    insert into check_ins (user_id, prediction_id, due_on, kind)
    values (uid, pid, (ci->>'due_on')::date, ci->>'kind');
  end loop;

  return pid;
end;
$$;
