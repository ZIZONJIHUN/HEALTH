import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REST_SECONDS,
  REST,
  clampRest,
  formatRest,
  normalizeRest,
  restAt,
  suggestRestSeconds,
} from '@/features/routines/rest'

// 스펙 6.1 표의 키워드마다 한 제목씩. 표를 고치면 여기서 바로 깨진다.
const BIG = [
  '스쿼트', '데드리프트', '벤치프레스', '오버헤드프레스', '밀리터리프레스', '로우', '풀업', '친업',
  '랫풀다운', '레그프레스', '힙쓰러스트', '런지', '딥스',
  'squat', 'deadlift', 'bench press', 'overhead press', 'military press', 'row', 'pull up',
  'chin up', 'lat pulldown', 'leg press', 'hip thrust', 'lunge', 'dips',
]
const ISO = [
  '컬', '레이즈', '익스텐션', '플라이', '크로스오버', '킥백', '레그컬', '카프',
  'curl', 'raise', 'extension', 'fly', 'crossover', 'kickback', 'leg curl', 'calf',
]
const CORE = [
  '플랭크', '버피', '마운틴클라이머', '크런치', '점핑잭', '줄넘기', '스트레칭',
  'plank', 'burpee', 'mountain climber', 'crunch', 'jumping jack', 'jump rope', 'stretching',
]

describe('suggestRestSeconds', () => {
  it.each(BIG)('큰 복합 운동 %s → 90', (k) => expect(suggestRestSeconds(`${k} 가이드`)).toBe(90))
  it.each(ISO)('고립 운동 %s → 60', (k) => expect(suggestRestSeconds(`${k} 가이드`)).toBe(60))
  it.each(CORE)('코어·유산소 %s → 30', (k) => expect(suggestRestSeconds(`${k} 가이드`)).toBe(30))

  it('공백과 대소문자를 무시한다', () => {
    expect(suggestRestSeconds('벤치 프레스 자세 교정')).toBe(90)
    expect(suggestRestSeconds('Romanian Deadlift form')).toBe(90)
  })
  it('여러 분류에 걸리면 긴 쪽', () => {
    expect(suggestRestSeconds('덤벨 컬 + 플랭크 서킷')).toBe(60)
  })
  it('판단 불가면 60', () => {
    expect(suggestRestSeconds('오늘의 브이로그')).toBe(60)
  })
})

describe('clampRest', () => {
  it('10 의 배수로 반올림하고 범위로 자른다', () => {
    expect(clampRest(95)).toBe(100)
    expect(clampRest(0)).toBe(10)
    expect(clampRest(999)).toBe(300)
    expect(REST.min).toBe(10)
  })
})

describe('normalizeRest', () => {
  it('숫자가 아니거나 범위 밖이면 추천값', () => {
    expect(normalizeRest('60', '플랭크')).toBe(30)
    expect(normalizeRest(500, '스쿼트')).toBe(90)
    expect(normalizeRest(NaN, '스쿼트')).toBe(90)
    expect(normalizeRest(5, '컬')).toBe(60)
  })
  it('범위 안이면 10 단위로 맞춘다', () => {
    expect(normalizeRest(45, '스쿼트')).toBe(50)
    expect(normalizeRest(120, '플랭크')).toBe(120)
  })
})

describe('formatRest', () => {
  it('초와 분을 한글로', () => {
    expect(formatRest(30)).toBe('30초')
    expect(formatRest(90)).toBe('1분 30초')
    expect(formatRest(120)).toBe('2분')
    expect(formatRest(300)).toBe('5분')
  })
})

describe('restAt', () => {
  it('index 번째 운동의 휴식 시간을 돌려준다', () => {
    expect(restAt([{ restSeconds: 30 }, { restSeconds: 90 }], 1)).toBe(90)
  })

  it('재생 중 루틴이 줄어 범위를 벗어나면 기본값이다 — 던지지 않는다', () => {
    expect(restAt([{ restSeconds: 30 }], 3)).toBe(DEFAULT_REST_SECONDS)
    expect(restAt([], 0)).toBe(DEFAULT_REST_SECONDS)
    expect(DEFAULT_REST_SECONDS).toBe(suggestRestSeconds('알 수 없는 제목'))
  })
})
