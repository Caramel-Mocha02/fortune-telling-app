-- =============================================================================
-- Phase 4 Step 1: 占術別・ユーザー別の性能集計 (仕様 18 / 20 / 21 / 48)
--
--   * 予測項目ごとの最新の評価のうち、本人が出来事を紐付けて確認した評価 (user_confirmed) だけを集計する。
--     「曖昧」(ambiguous) は性能の根拠にしない (仕様 26)。
--   * 項目を支持した占術それぞれに 1 サンプルとして数える。相関グループの扱いは利用側で行う。
--   * 時間軸: 予測期間 100 日以下 = short、400 日以下 = mid、それ以上 = long
--   * 答え合わせを保存するたびに再集計する。
-- =============================================================================

-- 全体集計: 全ユーザーの評価を読むため SECURITY DEFINER。書き込むのは集計値だけ。
create or replace function public.refresh_method_performance()
returns void
language sql
security definer
set search_path = public
as $$
  delete from method_performance where true;
  insert into method_performance (method, theme, horizon, sample_count, timing_score, theme_score, event_score, direction_score, last_updated)
  with latest as (
    select distinct on (e.prediction_item_id) e.*
    from prediction_evaluations e
    order by e.prediction_item_id, e.evaluated_at desc
  ), rows as (
    select
      m.method,
      i.theme,
      case
        when (p.prediction_period_end - p.prediction_period_start) <= 100 then 'short'
        when (p.prediction_period_end - p.prediction_period_start) <= 400 then 'mid'
        else 'long'
      end as horizon,
      l.timing_score, l.theme_score, l.event_score, l.direction_score
    from latest l
    join prediction_items i on i.id = l.prediction_item_id
    join predictions p on p.id = i.prediction_id
    cross join lateral unnest(i.supporting_methods) as m(method)
    where l.evaluation_source = 'user_confirmed'
  )
  select method, theme, horizon, count(*),
         avg(timing_score), avg(theme_score), avg(event_score), avg(direction_score), now()
  from rows
  group by method, theme, horizon;
$$;

-- 本人の集計: 呼び出したユーザー自身の行だけを作り直す (引数で他人を指定できない)
create or replace function public.refresh_user_method_performance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from user_method_performance where user_id = uid;
  insert into user_method_performance (user_id, method, theme, sample_count, timing_score, theme_score, event_score, direction_score, last_updated)
  with latest as (
    select distinct on (e.prediction_item_id) e.*
    from prediction_evaluations e
    where e.user_id = uid
    order by e.prediction_item_id, e.evaluated_at desc
  )
  select uid, m.method, i.theme, count(*),
         avg(l.timing_score), avg(l.theme_score), avg(l.event_score), avg(l.direction_score), now()
  from latest l
  join prediction_items i on i.id = l.prediction_item_id
  cross join lateral unnest(i.supporting_methods) as m(method)
  where l.evaluation_source = 'user_confirmed'
  group by m.method, i.theme;
end;
$$;

revoke execute on function public.refresh_method_performance() from public, anon;
revoke execute on function public.refresh_user_method_performance() from public, anon;
grant execute on function public.refresh_method_performance() to authenticated;
grant execute on function public.refresh_user_method_performance() to authenticated;

-- 全体集計はサンプル 10 件以上のセルだけ公開する (少数ユーザーの実績が推測されるのを避ける)
drop policy if exists "read global performance" on public.method_performance;
create policy "read global performance" on public.method_performance for select using (sample_count >= 10);

-- 答え合わせの保存後に集計を更新する (record_check_in を再定義)
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

  perform refresh_user_method_performance();
  perform refresh_method_performance();
end;
$$;

-- ---------------------------------------------------------------------------
-- Phase 4 Step 2: 個人別ルーティングのバージョン
-- ---------------------------------------------------------------------------
insert into public.routing_versions (version, description) values
  ('routing_v2', 'routing_v1 のルール + 実績による個人補正 (n<10 なし / 10-29 弱 / 30+ 入れ替え可)')
on conflict (version) do nothing;

insert into public.routing_rules (routing_version, category, primary_methods, secondary_methods)
select 'routing_v2', category, primary_methods, secondary_methods
from public.routing_rules where routing_version = 'routing_v1'
on conflict do nothing;

insert into public.model_versions (version, kind, description) values
  ('prediction_model_v4', 'prediction_model', 'Phase 4: 個人別ルーティングと占術の実績重みを解釈に反映')
on conflict (version) do nothing;

insert into public.prompt_versions (version, purpose, description) values
  ('interpret_v4', 'interpretation', 'v3 + 占術の過去実績による重み (global_only は個人傾向として語らない)')
on conflict (version) do nothing;
