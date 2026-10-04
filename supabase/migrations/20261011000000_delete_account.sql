-- =============================================================================
-- アカウント削除: 本人のデータをすべて削除する
--
-- auth.users を削除すると各テーブルは on delete cascade で消える。
-- outcomes → life_events と prediction_evaluations → outcomes は on delete restrict
-- (評価の根拠を単独で誤って消さないため) なので、連鎖の順序に依存しないよう
-- 参照する側から明示的に消してから、最後にユーザーを削除する。
--
-- 手相画像 (Storage) は SQL から直接は消せないため、呼び出し側で先に Storage API で削除する。
-- =============================================================================
create or replace function public.delete_my_account()
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

  delete from prediction_evaluations where user_id = uid;
  delete from outcomes where user_id = uid;
  delete from life_events where user_id = uid;
  delete from user_method_performance where user_id = uid;

  -- 残りは auth.users からの on delete cascade で消える
  delete from auth.users where id = uid;

  -- 全体集計から本人の分を除く
  perform refresh_method_performance();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
