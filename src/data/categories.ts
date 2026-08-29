export const BODY_PARTS = [
  { id: 'chest', label: '가슴', query: '가슴 운동' },
  { id: 'back', label: '등', query: '등 운동' },
  { id: 'shoulder', label: '어깨', query: '어깨 운동' },
  { id: 'legs', label: '하체', query: '하체 운동' },
  { id: 'arms', label: '팔', query: '팔 운동' },
  { id: 'core', label: '코어', query: '코어 운동' },
  { id: 'full', label: '전신', query: '전신 운동' },
] as const

export type BodyPart = (typeof BODY_PARTS)[number]
export type BodyPartId = BodyPart['id']

/**
 * 부위 안의 세부 근육 묶음. id 는 3D 모델(public/models/body.glb)의 노드 이름과 같아야 한다.
 * 어긋나면 화면에 있는 부위가 모델에서 회색으로 비거나, 모델에 있는데 클릭이 안 된다.
 * tests/unit/bodyModel.test.ts 가 매번 대조한다.
 *
 * query 는 해부학 용어가 아니라 헬스장에서 실제로 검색하는 말로 잡는다.
 * '대흉근 쇄골지 운동' 은 YouTube 결과가 거의 없고 '윗가슴 운동' 은 많다.
 *
 * '전신'은 세분화가 없다 — 부위가 아니라 훈련 방식이라 대응하는 근육이 없다.
 */
export const MUSCLE_GROUPS = [
  { id: 'chest-upper', parent: 'chest', label: '윗가슴', query: '윗가슴 운동' },
  { id: 'chest-lower', parent: 'chest', label: '아랫가슴', query: '아랫가슴 운동' },

  { id: 'back-lats', parent: 'back', label: '광배근', query: '광배근 운동' },
  { id: 'back-traps', parent: 'back', label: '승모근', query: '승모근 운동' },
  { id: 'back-erectors', parent: 'back', label: '기립근', query: '기립근 운동' },

  { id: 'shoulder-front', parent: 'shoulder', label: '앞어깨', query: '전면 삼각근 운동' },
  { id: 'shoulder-side', parent: 'shoulder', label: '옆어깨', query: '측면 삼각근 운동' },
  // 극하근·대원근은 등이 아니라 여기 붙는다. 후면 삼각근 바로 아래에 있어서
  // 등으로 묶으면 인체도에서 어깨를 눌렀는데 등이 켜지는 것처럼 보인다.
  { id: 'shoulder-rear', parent: 'shoulder', label: '뒤어깨', query: '후면 삼각근 운동' },

  { id: 'arms-biceps', parent: 'arms', label: '이두', query: '이두 운동' },
  { id: 'arms-triceps', parent: 'arms', label: '삼두', query: '삼두 운동' },
  { id: 'arms-forearm', parent: 'arms', label: '전완', query: '전완근 운동' },

  { id: 'core-abs', parent: 'core', label: '복근', query: '복근 운동' },
  { id: 'core-obliques', parent: 'core', label: '옆구리', query: '옆구리 운동' },

  { id: 'legs-quads', parent: 'legs', label: '허벅지 앞', query: '대퇴사두 운동' },
  { id: 'legs-hamstrings', parent: 'legs', label: '허벅지 뒤', query: '햄스트링 운동' },
  { id: 'legs-glutes', parent: 'legs', label: '엉덩이', query: '엉덩이 운동' },
  { id: 'legs-calves', parent: 'legs', label: '종아리', query: '종아리 운동' },
  { id: 'legs-adductors', parent: 'legs', label: '허벅지 안쪽', query: '내전근 운동' },
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]
export type MuscleGroupId = MuscleGroup['id']

/** 부위에 딸린 세부 묶음. 없으면 빈 배열('전신'). */
export function subgroupsOf(parentId: string): readonly MuscleGroup[] {
  return MUSCLE_GROUPS.filter((group) => group.parent === parentId)
}

/**
 * 검색어가 어떤 부위/세부를 가리키는지 알아낸다.
 *
 * 칩의 활성 표시, 세부 줄 펼침, 3D 인체도 하이라이트가 모두 이 하나를 쓴다.
 * 세 곳이 각자 판단하면 조금씩 어긋난다.
 */
export type QueryMatch =
  | { kind: 'group'; group: MuscleGroup; part: BodyPart }
  | { kind: 'part'; part: BodyPart }
  | { kind: 'none' }

export function matchQuery(query: string): QueryMatch {
  const trimmed = query.trim()
  if (!trimmed) return { kind: 'none' }

  const group = MUSCLE_GROUPS.find((item) => item.query === trimmed)
  if (group) {
    const part = BODY_PARTS.find((item) => item.id === group.parent)
    // parent 가 없는 건 데이터 오류다. 단위 테스트가 잡지만, 화면은 죽지 않게 둔다.
    if (part) return { kind: 'group', group, part }
  }

  const part = BODY_PARTS.find((item) => item.query === trimmed)
  if (part) return { kind: 'part', part }

  return { kind: 'none' }
}

/** 캐시 시드와 추천 검색어에 함께 쓴다. */
export const POPULAR_EXERCISES = [
  '스쿼트',
  '벤치프레스',
  '데드리프트',
  '풀업',
  '랫풀다운',
  '오버헤드프레스',
  '바벨로우',
  '덤벨플라이',
  '레그프레스',
  '런지',
  '플랭크',
  '사이드레터럴레이즈',
  '바이셉컬',
  '트라이셉스익스텐션',
  '힙쓰러스트',
  '레그컬',
  '케이블크로스오버',
  '친업',
  '버피',
  '마운틴클라이머',
] as const
