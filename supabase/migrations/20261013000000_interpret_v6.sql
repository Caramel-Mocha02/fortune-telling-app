-- 予測の文章から占いの専門用語をなくし、誰が読んでも分かる言葉で書かせる
insert into public.prompt_versions (version, purpose, description) values
  ('interpret_v6', 'interpretation', 'v5 + ユーザー向けの文章 (根拠を含む) で占いの専門用語を使わず日常の言葉で書く')
on conflict (version) do nothing;
