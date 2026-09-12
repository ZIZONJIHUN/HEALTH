-- ---------------------------------------------------------------------------
-- 1. 일일 YouTube 호출 예산
--
-- 검색 1회 = 101 units, 일일 무료 쿼터 = 10,000 units → 하루 약 99회가 물리적 상한이다.
-- 캐시에 없는 검색어는 누구나 URL 하나로 만들 수 있으므로, 제동장치가 없으면
-- 100번의 요청으로 그날 서비스 전체의 검색이 죽는다.
-- ---------------------------------------------------------------------------

create table if not exists public.api_budget (
  day   date    primary key,
  calls integer not null default 0
);

-- search_cache 와 같은 이유로 RLS 를 켜고 정책을 만들지 않는다.
-- anon/authenticated 는 접근할 수 없고 service_role 만 RLS 를 우회한다.
alter table public.api_budget enable row level security;

/*
  예산을 1 소비하고 소비 후 횟수를 돌려준다. 상한에 닿았으면 null 을 돌려준다.

  읽고-더하고-쓰는 방식은 쓸 수 없다. 동시 요청 사이에 경쟁이 생겨 상한을 넘긴다.
  ON CONFLICT ... DO UPDATE 의 WHERE 절이 원자적 test-and-increment 를 만든다 —
  상한에 닿으면 갱신되는 행이 없고, RETURNING 은 아무것도 돌려주지 않는다.
*/
create or replace function public.consume_api_budget(max_calls integer)
returns integer
language sql
as $$
  insert into public.api_budget (day, calls)
  values (current_date, 1)
  on conflict (day) do update
    set calls = api_budget.calls + 1
    where api_budget.calls < max_calls
  returning calls;
$$;

-- ---------------------------------------------------------------------------
-- 2. search_cache 위생
--
-- TTL 은 읽기 시점에만 판정하고 만료 행을 지우지 않았다. 테이블이 영원히 자란다.
-- ---------------------------------------------------------------------------

-- 애플리케이션의 MAX_QUERY_LENGTH(40)보다 넉넉하되 무제한은 아니게 잡는다.
-- 상한이 없으면 임의 장문 문자열이 그대로 기본키가 된다.
alter table public.search_cache
  drop constraint if exists search_cache_key_length;
alter table public.search_cache
  add constraint search_cache_key_length check (length(query_key) <= 64);

create index if not exists search_cache_created_at_idx
  on public.search_cache (created_at);

/*
  만료 행 정리. TTL 이 7일인데 14일을 남기는 이유는 쿼터 초과 시의 stale 폴백 때문이다 —
  만료됐어도 빈 화면보다는 낫고, 그 여지를 일주일 더 준다.

  pg_cron 이 있으면 주 1회 스케줄에 걸고, 없으면 가끔 수동으로 실행한다.
*/
create or replace function public.prune_search_cache()
returns integer
language sql
as $$
  with removed as (
    delete from public.search_cache
    where created_at < now() - interval '14 days'
    returning 1
  )
  select count(*)::integer from removed;
$$;
