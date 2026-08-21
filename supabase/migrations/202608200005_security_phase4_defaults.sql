-- Security Phase 4: make the secure baseline durable for future objects.
--
-- The migration role is the only role whose default privileges are changed.
-- Runtime access remains explicitly granted by later migrations/policies.

begin;

alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- These are application-owned functions, not public RPC endpoints. Keep
-- trigger/maintenance execution available to the trusted backend role only.
revoke execute on function public.invalidate_subs_ngram_tsv() from public, anon, authenticated;
revoke execute on function public.subs_tsv_config(text) from public, anon, authenticated;
revoke execute on function public.video_embeddings_set_l2() from public, anon, authenticated;
grant execute on function public.invalidate_subs_ngram_tsv() to lp_backend;
grant execute on function public.subs_tsv_config(text) to lp_backend;
grant execute on function public.video_embeddings_set_l2() to lp_backend;

commit;
