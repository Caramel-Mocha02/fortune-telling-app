-- 仕様 56 Secondary KPI「過去予測参照率」のための閲覧記録 (追記のみ)
create table public.prediction_views (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  viewed_at     timestamptz not null default now()
);
create index prediction_views_user_idx on public.prediction_views(user_id, viewed_at desc);
create trigger prediction_views_immutable before update on public.prediction_views
  for each row execute function public.reject_update();

alter table public.prediction_views enable row level security;
create policy "own views select" on public.prediction_views for select using (user_id = auth.uid());
create policy "own views insert" on public.prediction_views for insert
  with check (user_id = auth.uid() and exists (select 1 from public.predictions p where p.id = prediction_id and p.user_id = auth.uid()));
