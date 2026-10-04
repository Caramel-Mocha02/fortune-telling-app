-- Phase 3: タロット・手相・自動照合

-- ---------------------------------------------------------------------------
-- 手相の登録 (仕様 4.8: 定期的に手相画像を登録)
--   画像からの観察 (observation) は登録時に 1 回だけ行って固定保存する。
--   手相画像は個人の身体情報なので、本人は削除できる。過去の予測は Snapshot に
--   観察結果を保持しているため、削除しても予測の記録は変わらない。
-- ---------------------------------------------------------------------------
create table public.palm_readings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hand           text not null check (hand in ('left', 'right')),
  captured_on    date not null,
  image_path     text not null,
  observation    jsonb not null,
  observe_model  text not null,
  prompt_version text not null references public.prompt_versions(version),
  created_at     timestamptz not null default now()
);
create index palm_readings_user_idx on public.palm_readings(user_id, captured_on desc);
create trigger palm_readings_immutable before update on public.palm_readings
  for each row execute function public.reject_update();

alter table public.palm_readings enable row level security;
create policy "own palm select" on public.palm_readings for select using (user_id = auth.uid());
create policy "own palm insert" on public.palm_readings for insert with check (user_id = auth.uid());
create policy "own palm delete" on public.palm_readings for delete using (user_id = auth.uid());

-- 非公開バケット。パスは <user_id>/<uuid>.<ext> とし、本人のフォルダだけ読み書きできる
insert into storage.buckets (id, name, public)
values ('palm-images', 'palm-images', false)
on conflict (id) do nothing;

create policy "palm images select own" on storage.objects for select to authenticated
  using (bucket_id = 'palm-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "palm images insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'palm-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "palm images delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'palm-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- バージョン
-- ---------------------------------------------------------------------------
insert into public.model_versions (version, kind, description) values
  ('prediction_model_v3',     'prediction_model',  'Phase 3: タロット・手相を追加'),
  ('tarot_engine_v1',         'divination_engine', 'RWS 78 枚 / 逆位置あり / シード固定の引き / 3 枚または意思決定 5 枚'),
  ('palmistry_engine_v1',     'divination_engine', '登録済み観察結果の手ごとの最新状態と前回比較')
on conflict (version) do nothing;

insert into public.prompt_versions (version, purpose, description) values
  ('interpret_v3',    'interpretation',   'v2 + タロットは近未来、手相は現在の状態と変化に限定'),
  ('observe_palm_v1', 'palm_observation', '手相画像から線・形の観察のみを構造化 (解釈しない)')
on conflict (version) do nothing;
