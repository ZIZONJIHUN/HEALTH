-- ---------------------------------------------------------------------------
-- 루틴: 서버에 있는 것보다 오래된 수정은 받지 않는다
--
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 붙여 넣고 실행한다.
-- 0004_routines_and_workouts.sql 이 먼저 실행되어 있어야 한다.
--
-- 앱은 루틴을 upsert 로 올리고, 병합 규칙은 "나중에 고친 쪽(updated_at)이 이긴다" 다.
-- 그런데 그 비교는 당길 때만 일어난다. 오프라인에서 고친 기기가 다시 연결되어 당기지 않고
-- 밀면(재시도 타이머), 다른 기기가 더 나중에 고친 내용이나 묘비를 덮어쓴다 — 지운 루틴이
-- 되살아나고, 덮인 쪽 기기가 로그아웃해 있으면 그 수정은 영영 사라진다.
--
-- 그래서 비교를 서버에서도 한다. 들어온 updated_at 이 지금 행보다 오래됐으면 그 update 를
-- 조용히 건너뛴다(트리거가 null 을 돌려준다). 오류로 거절하지 않는 이유: 앱은 거절을
-- "사용자가 고칠 문제" 로 보여 주는데, 이건 고칠 것이 없다. 건너뛰면 앱은 올렸다고 보고,
-- 다음 당기기가 더 새로운 서버 행을 받아 와 로컬을 맞춘다.
--
-- 같은 시각(=)은 받는다. 순서(position)만 바로잡는 밀기는 updated_at 을 바꾸지 않고 보낸다.
--
-- update 단계에서는 트리거 이름이 routines_enforce_limits 보다 알파벳순으로 앞이라
-- (drop < enforce) 먼저 돌고, null 을 돌려주면 뒤 트리거는 돌지 않는다. upsert 는 충돌을 알기
-- 전에 insert 단계의 상한 트리거를 이미 한 번 돌리지만, 상한은 지금 쓰는 id 를 빼고 세므로
-- 이미 있는 행의 수정이 그 때문에 거절되지는 않는다.
-- ---------------------------------------------------------------------------

create or replace function public.drop_stale_routine_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists routines_drop_stale on public.routines;
create trigger routines_drop_stale
  before update on public.routines
  for each row execute function public.drop_stale_routine_update();
