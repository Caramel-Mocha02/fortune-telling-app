-- 仕様 8「ユーザーへの質問」: 曖昧な質問には予測の前に 1 回だけ確認する
insert into public.prompt_versions (version, purpose, description) values
  ('classify_v2', 'question_classification', 'classify_v1 + 対象が特定できない質問への確認の質問 (clarification)')
on conflict (version) do nothing;
