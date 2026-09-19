-- ---------------------------------------------------------------------------
-- 사용자 프로필과 역할
--
-- auth.users 에 직접 열을 붙일 수 없어서 1:1 테이블을 따로 둔다.
-- 지금 필요한 것은 role 하나뿐이지만, 나중에 추가하면 이미 가입한 사람들 몫을
-- 백필해야 한다. 백필을 빠뜨리면 "관리자인데 관리자 화면이 안 보임" 으로 나타나
-- 원인 찾기가 번거롭다.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid        primary key references auth.users(id) on delete cascade,
  role       text        not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

/*
  가입 시 자동 생성.

  앱 코드에서 만들면 언젠가 빠뜨린다. OAuth 콜백에서만 만들면 다른 경로로 가입한
  사용자가 프로필 없이 남고, 그 사용자는 role 조회가 null 이라 관리자 판정에서
  이상하게 동작한다.

  security definer 가 필요하다 — 트리거는 가입하는 사용자 권한으로 돌아서
  public.profiles 에 쓸 권한이 없다. 대신 search_path 를 비우고 모든 이름을
  스키마까지 적는다. 이 둘을 빠뜨리는 것이 Postgres 의 전형적인 권한 상승 경로다.
*/
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS — 읽기는 본인만, 쓰기는 아무도 못 한다.
--
-- insert/update/delete 정책을 일부러 만들지 않는다. 정책이 없으면 anon 과
-- authenticated 는 아무것도 못 한다. 생성은 위 트리거(security definer)가,
-- 역할 변경은 service_role 이나 Supabase 콘솔이 한다.
--
-- 프로필에 본인이 고칠 필드가 지금 하나도 없다. 닉네임 같은 것이 생기면 그때
-- 그 열에 한정한 update 정책을 연다. 지금 여는 것은 쓸 데 없는 권한이다.
--
-- 관리자 승격 UI 는 만들지 않는다. 관리자가 한둘인 규모에서 승격 UI 는
-- 권한 상승 취약점 표면만 만든다:
--   update public.profiles set role = 'admin' where id = '<uuid>';
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "본인 프로필 읽기" on public.profiles;
create policy "본인 프로필 읽기" on public.profiles
  for select using (auth.uid() = id);
