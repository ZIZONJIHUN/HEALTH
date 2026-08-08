export const BODY_PARTS = [
  { id: 'chest', label: '가슴', query: '가슴 운동' },
  { id: 'back', label: '등', query: '등 운동' },
  { id: 'shoulder', label: '어깨', query: '어깨 운동' },
  { id: 'legs', label: '하체', query: '하체 운동' },
  { id: 'arms', label: '팔', query: '팔 운동' },
  { id: 'core', label: '코어', query: '코어 운동' },
  { id: 'full', label: '전신', query: '전신 운동' },
] as const

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
