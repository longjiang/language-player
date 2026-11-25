-- SPEC-112 — a sale is a featured coupon.
--
-- There is no starts_at: a coupon is usable from creation and featuring it
-- starts the sale. The sale ends at expires_at, evaluated as a UTC instant.
-- expires_timezone records the IANA zone the admin entered so the form
-- round-trips; the instant itself is always stored in UTC.

alter table public.coupons
  add column featured boolean not null default false,
  add column public_title text,
  add column public_title_i18n jsonb not null default '{}'::jsonb,
  add column expires_timezone text not null default 'UTC';

alter table public.coupons
  add constraint coupons_featured_requires_public_title
    check (not featured or (public_title is not null and btrim(public_title) <> '')),
  add constraint coupons_featured_requires_expiry
    check (not featured or expires_at is not null);

-- One public sale at a time.
create unique index coupons_single_featured_idx
  on public.coupons ((featured)) where featured;

create index coupons_featured_idx
  on public.coupons (featured, active, expires_at)
  where featured;
