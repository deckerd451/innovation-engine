-- Read-only deployment review; does not inspect member records or secret values.
SELECT jsonb_build_object(
  'columns', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',column_name,'type',data_type,'nullable',is_nullable)), '[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='interaction_edges'),
  'indexes', (SELECT coalesce(jsonb_agg(indexdef),'[]'::jsonb)
    FROM pg_indexes WHERE schemaname='public' AND tablename='interaction_edges'),
  'constraints', (SELECT coalesce(jsonb_agg(pg_get_constraintdef(oid)),'[]'::jsonb)
    FROM pg_constraint WHERE conrelid='public.interaction_edges'::regclass),
  'user_triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid))),'[]'::jsonb)
    FROM pg_trigger WHERE tgrelid='public.interaction_edges'::regclass AND NOT tgisinternal)
) AS evidence_v2_preflight;
