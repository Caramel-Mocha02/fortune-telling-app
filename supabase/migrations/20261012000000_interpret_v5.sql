-- 予測レポートから「占術によって異なること」「時期」「注意点」を除き、AI の出力量を減らす
insert into public.prompt_versions (version, purpose, description) values
  ('interpret_v5', 'interpretation', 'v4 から相違点・時期・注意点の出力を廃止 (表示しない・費用削減)。専門用語を避ける')
on conflict (version) do nothing;
