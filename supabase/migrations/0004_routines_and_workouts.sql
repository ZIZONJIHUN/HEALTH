-- ---------------------------------------------------------------------------
-- 루틴 동기화와 운동 기록
--
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 붙여 넣고 실행한다.
-- 0003_profiles.sql 이 먼저 실행되어 있어야 한다(같은 auth.users 를 참조한다).
-- 실행 후 `npm run sync:check` 로 표와 RLS 가 서 있는지 확인한다.
--
-- 화면은 localStorage 만 읽고, 이 표들은 기기 사이를 잇는 사본이다. 그래서 서버는
-- "무엇이든 받아 주는 저장소" 가 아니라 상한을 지키는 쪽이어야 한다 — 로그인한 사용자는
-- 누구나 anon 키로 이 표에 직접 쓸 수 있고, 앱 코드의 검사는 우회될 수 있다.
-- ---------------------------------------------------------------------------

/*
  루틴 하나가 행 하나다. 운동 항목을 별도 표로 쪼개지 않는다 — 루틴은 항상 통째로
  읽히고 쓰이며, 순서 변경이 "배열 교체" 로 끝난다. 정규화로 얻는 것이 없다.

  id 는 클라이언트가 만든다. 오프라인에서 만든 루틴도 같은 id 로 올라와야 병합이 된다.
  그래서 기본키가 (user_id, id) 다 — 서로 다른 사용자의 id 가 우연히 겹쳐도 충돌하지 않는다.

  updated_at 은 서버 시각이 아니라 클라이언트가 보낸 updatedAt 이다. 병합이
  "나중에 고친 쪽이 이긴다" 를 기기 사이에서 비교하려면 같은 출처의 시각이어야 한다.

  deleted_at 은 묘비다. 행을 지우면 다른 기기가 "서버에 없는 로컬 루틴" 으로 보고 다시
  올려 되살린다.

  check 제약 이름을 직접 붙인다. 앱(routineSync.ts)이 오류 문구 속 제약 이름으로
  "이름이 길다" 와 "운동이 많다" 를 가려 사용자에게 보여 준다.
*/
create table if not exists public.routines (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  id         text        not null constraint routines_id_check
                         check (char_length(id) between 1 and 64),
  name       text        not null constraint routines_name_check
                         check (char_length(name) between 1 and 60),
  items      jsonb       not null constraint routines_items_check
                         check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100),
  position   int         not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

/*
  운동 기록은 추가만 된다(편집·삭제 없음). 병합은 id 합집합이다.

  local_date 를 따로 저장한다. completed_at 만 두면 "그날" 을 서버 시간대로 자르게 되는데,
  사용자가 운동한 날은 그 사람의 달력 기준이다. 하루 상한도 이 날짜로 센다.

  routine_name 을 함께 남긴다. 루틴을 지우거나 이름을 바꿔도 지난 기록은 그때 이름으로
  보여야 한다. routine_id 는 참조 제약을 걸지 않는다 — 지운 루틴의 기록도 남아야 한다.
*/
create table if not exists public.workout_logs (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  id           text        not null constraint workout_logs_id_check
                           check (char_length(id) between 1 and 64),
  routine_id   text        not null,
  routine_name text        not null constraint workout_logs_routine_name_check
                           check (char_length(routine_name) <= 60),
  completed_at timestamptz not null,
  local_date   date        not null,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- 상한 트리거
--
-- security definer 가 필요하다 — 묘비 정리는 delete 인데, 아래에서 delete 정책을 일부러
-- 열지 않으므로 사용자 권한으로는 지울 수 없다. 개수 세기도 RLS 에 기대지 않고 정확해야
-- 한다. 대신 search_path 를 비우고 모든 이름을 스키마까지 적는다. 이 둘을 빠뜨리는 것이
-- Postgres 의 전형적인 권한 상승 경로다(0003 과 같은 이유).
--
-- 동시에 여러 요청이 들어오면 상한을 몇 개 넘길 수 있다. 목적은 "무제한으로 쌓는 길" 을
-- 닫는 것이지 정확히 200 에서 끊는 것이 아니므로 잠금을 두지 않는다.
-- ---------------------------------------------------------------------------

/*
  ① 30일 지난 묘비를 지운다. cron 을 두지 않고 같은 사용자의 다음 쓰기 때 정리한다.
     30일 넘게 켜지 않은 기기가 지운 루틴을 되살릴 수 있지만, 그 기기에서는 그 루틴이
     살아 있었으므로 사용자가 보기에 이상하지 않다.
     지금 쓰는 행은 정리에서 뺀다 — BEFORE 트리거 안에서 자기 행을 지우면 Postgres 가
     그 쓰기를 오류로 끝낸다.
  ② 살아 있는 루틴 200개 상한. 묘비는 세지 않는다 — 세면 만들고 지우기를 200번 한
     사용자가 영영 새 루틴을 못 올린다. 지금 쓰는 행도 뺀다 — 200번째 루틴을 고치는
     update 가 "201번째" 로 세어져 거절되면 안 된다.
     raise 의 문구는 앱이 그대로 사용자에게 보여 준다(P0001).
*/
create or replace function public.enforce_routine_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.routines
   where user_id = new.user_id
     and id <> new.id
     and deleted_at < now() - interval '30 days';

  if new.deleted_at is null and (
    select count(*)
      from public.routines
     where user_id = new.user_id
       and id <> new.id
       and deleted_at is null
  ) >= 200 then
    raise exception '루틴은 200개까지 저장할 수 있어요';
  end if;

  return new;
end;
$$;

drop trigger if exists routines_enforce_limits on public.routines;
create trigger routines_enforce_limits
  before insert or update on public.routines
  for each row execute function public.enforce_routine_limits();

/*
  하루 20건 상한. 하루 20번 넘게 루틴을 끝내는 것은 사람이 아니다 — 스크립트가 기록을
  무제한으로 쌓는 길만 닫는다. 기록은 추가만 되므로 insert 에만 건다.
*/
create or replace function public.enforce_workout_log_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
      from public.workout_logs
     where user_id = new.user_id
       and local_date = new.local_date
  ) >= 20 then
    raise exception '운동 기록은 하루 20건까지 저장할 수 있어요';
  end if;

  return new;
end;
$$;

drop trigger if exists workout_logs_enforce_limits on public.workout_logs;
create trigger workout_logs_enforce_limits
  before insert on public.workout_logs
  for each row execute function public.enforce_workout_log_limits();

-- ---------------------------------------------------------------------------
-- RLS — 본인 행만.
--
-- insert/update 에 with check 를 건다. using 만 있으면 자기 행을 골라 user_id 를 남의
-- 것으로 바꿔 쓰는 update 가 통과한다.
--
-- delete 정책은 두 표 모두 열지 않는다. 루틴은 묘비로 지우고(실제 삭제는 위 트리거만),
-- 운동 기록은 지우는 기능이 없다. 열어 두면 쓸 데 없는 권한이다.
-- 운동 기록은 고치는 기능도 없으므로 update 정책도 없다.
-- ---------------------------------------------------------------------------

alter table public.routines enable row level security;

drop policy if exists "본인 루틴 읽기" on public.routines;
create policy "본인 루틴 읽기" on public.routines
  for select using (user_id = auth.uid());

drop policy if exists "본인 루틴 추가" on public.routines;
create policy "본인 루틴 추가" on public.routines
  for insert with check (user_id = auth.uid());

drop policy if exists "본인 루틴 수정" on public.routines;
create policy "본인 루틴 수정" on public.routines
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.workout_logs enable row level security;

drop policy if exists "본인 운동 기록 읽기" on public.workout_logs;
create policy "본인 운동 기록 읽기" on public.workout_logs
  for select using (user_id = auth.uid());

drop policy if exists "본인 운동 기록 추가" on public.workout_logs;
create policy "본인 운동 기록 추가" on public.workout_logs
  for insert with check (user_id = auth.uid());
