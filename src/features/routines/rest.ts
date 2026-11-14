/**
 * 운동 사이 휴식 시간. 추천은 영상 제목에서 규칙으로 고른다 — LLM 을 부르면 비용과 키,
 * 남용 방어 경로가 새로 생기고, 이 앱은 이미 쿼터 하나를 지키느라 애쓴다.
 * 추천값은 저장하지 않는다. 규칙을 고치면 "추천" 표시가 따라 바뀌어야 해서 매번 다시 계산한다.
 */

export const REST = { presets: [30, 60, 90], step: 10, min: 10, max: 300 } as const

type Rest = 30 | 60 | 90

/** 제목으로 판단할 수 없을 때의 휴식 시간. */
export const DEFAULT_REST_SECONDS = 60

// 키워드는 공백을 뺀 소문자로 적는다. 비교 쪽도 같은 꼴로 만들기 때문이다.
const LONG_KEYWORDS = [
  '스쿼트', '데드리프트', '벤치프레스', '오버헤드프레스', '밀리터리프레스', '로우', '풀업', '친업',
  '랫풀다운', '레그프레스', '힙쓰러스트', '런지', '딥스',
  'squat', 'deadlift', 'benchpress', 'overheadpress', 'militarypress', 'row', 'pullup',
  'chinup', 'latpulldown', 'legpress', 'hipthrust', 'lunge', 'dips',
]
const MID_KEYWORDS = [
  '컬', '레이즈', '익스텐션', '플라이', '크로스오버', '킥백', '레그컬', '카프',
  'curl', 'raise', 'extension', 'fly', 'crossover', 'kickback', 'legcurl', 'calf',
]
const SHORT_KEYWORDS = [
  '플랭크', '버피', '마운틴클라이머', '크런치', '점핑잭', '줄넘기', '스트레칭',
  'plank', 'burpee', 'mountainclimber', 'crunch', 'jumpingjack', 'jumprope', 'stretching',
]

// 여러 분류에 걸리면 긴 쪽이 이기므로 90 → 60 → 30 순으로 보고 처음 걸린 값을 쓴다.
const RULES: readonly (readonly [Rest, readonly string[]])[] = [
  [90, LONG_KEYWORDS],
  [60, MID_KEYWORDS],
  [30, SHORT_KEYWORDS],
]

/** 영상 제목으로 휴식 시간을 고른다. 판단할 수 없으면 60초. */
export function suggestRestSeconds(title: string): Rest {
  const t = title.toLowerCase().replace(/\s+/g, '')
  for (const [seconds, keywords] of RULES) {
    if (keywords.some((k) => t.includes(k))) return seconds
  }
  return DEFAULT_REST_SECONDS
}

/**
 * index 번째 운동의 휴식 시간. 재생 중 다른 탭·기기에서 루틴이 줄면 index 가 범위를 벗어날 수
 * 있다 — 그때는 기본값으로 대신해 재생 화면을 죽이지 않는다.
 */
export function restAt(items: readonly { restSeconds: number }[], index: number): number {
  return items[index]?.restSeconds ?? DEFAULT_REST_SECONDS
}

/** 사용자 조절값을 10초 단위로 맞추고 허용 범위로 자른다. */
export function clampRest(seconds: number): number {
  const rounded = Math.round(seconds / REST.step) * REST.step
  return Math.min(REST.max, Math.max(REST.min, rounded))
}

/**
 * 저장소에서 읽은 값을 믿을 수 있는 값으로 되돌린다. localStorage 나 서버 jsonb 는
 * 손으로 고쳐졌거나 옛 버전이 쓴 값일 수 있어서, 범위 밖이면 버리고 추천값으로 대신한다.
 */
export function normalizeRest(value: unknown, title: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < REST.min || value > REST.max) {
    return suggestRestSeconds(title)
  }
  return clampRest(value)
}

/** 30 → "30초", 90 → "1분 30초", 120 → "2분". */
export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}초`
  return s === 0 ? `${m}분` : `${m}분 ${s}초`
}
