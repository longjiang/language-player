-- SPEC-102 follow-up: map Stripe refunds/disputes back to the original payment.
--
-- Checkout session ids are not present on charge.refunded events; the charge
-- and payment_intent identifiers are. Store both on the immutable ledger row.

begin;

alter table public.payment_events
  add column if not exists processor_charge_id text,
  add column if not exists processor_payment_intent_id text;

create index if not exists payment_events_charge_idx
  on public.payment_events (processor, processor_charge_id)
  where processor_charge_id is not null;

create index if not exists payment_events_payment_intent_idx
  on public.payment_events (processor, processor_payment_intent_id)
  where processor_payment_intent_id is not null;

commit;
