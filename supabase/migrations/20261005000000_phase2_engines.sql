-- Phase 2: 紫微斗数・算命学・九星気学・数秘術 のエンジンと予測モデル v2
insert into public.model_versions (version, kind, description) values
  ('prediction_model_v2',     'prediction_model',  'Phase 2: 紫微斗数・算命学・九星気学・数秘術を追加'),
  ('zi_wei_engine_v1',        'divination_engine', '旧暦 (出生地TZ・定気法) / 14主星+補助7星 / 四化 / 大限 / 流年'),
  ('sanmei_engine_v1',        'divination_engine', '陽占 (十大主星・十二大従星) / 天中殺 / 流年・流月。蔵干は本元のみ'),
  ('kyusei_engine_v1',        'divination_engine', '本命星・月命星 / 年盤・月盤 / 五黄殺・暗剣殺・本命殺・的殺・破 / 相生比和の吉方'),
  ('numerology_engine_v1',    'divination_engine', 'ピタゴラス式 / ライフパス / 個人年・個人月 / ピナクル・チャレンジ')
on conflict (version) do nothing;

insert into public.prompt_versions (version, purpose, description) values
  ('interpret_v2', 'interpretation', 'v1 + caveats/null を推測で補わない・方位は移動の質問でのみ使う')
on conflict (version) do nothing;
