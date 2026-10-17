-- Card 174 K1: per-IP limit on wrong hand-off codes (the per-hand-off cap is in calendar_handoff.attempts).
create table if not exists calendar_claim_fail (
  ip_hash text not null,
  failed_at timestamptz not null
);
create index if not exists calendar_claim_fail_ip_at on calendar_claim_fail (ip_hash, failed_at);
