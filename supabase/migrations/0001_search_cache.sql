create table if not exists public.search_cache (
  query_key  text        primary key,
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);

-- RLS를 켜고 정책을 만들지 않는다.
-- anon/authenticated 는 접근할 수 없고, 서버가 쓰는 service_role 만 RLS를 우회한다.
alter table public.search_cache enable row level security;
