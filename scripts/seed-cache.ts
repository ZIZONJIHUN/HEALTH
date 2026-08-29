import { BODY_PARTS, MUSCLE_GROUPS, POPULAR_EXERCISES } from '../src/data/categories'
import { getVideos } from '../src/lib/videoSearch'

/**
 * 첫 화면에서 눌리는 것들을 미리 캐시에 채운다.
 *
 * 부위 칩(상위 7 + 세부 18)이 인기 운동보다 먼저다. 첫 화면에 그대로 보이는 버튼이라
 * 가장 많이 눌리는데, 예전에는 시드 대상이 아니어서 누를 때마다 쿼터를 썼다.
 *
 * 검색 1회는 101 units 다. 45건이면 약 4,545 units 로 일일 10,000 의 절반 아래다.
 * 캐시가 7일이므로 주 1회면 된다.
 * 쿼터가 소진되면 즉시 멈춘다. 남은 항목은 다음 날 다시 실행한다.
 */
const SEED_QUERIES = [
  ...BODY_PARTS.map((part) => part.query),
  ...MUSCLE_GROUPS.map((group) => group.query),
  ...POPULAR_EXERCISES,
]

/** 이보다 결과가 적으면 그 검색어는 화면에서 빈 것처럼 보인다. 사람이 봐야 한다. */
const THIN_RESULT_THRESHOLD = 3

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
    console.error(
      'Supabase 없이 시드를 돌리면 getVideos()가 이 스크립트 프로세스의 메모리 캐시에만 쓰고,' +
        ' 그 캐시는 프로세스가 끝나는 순간 사라집니다. 검색' +
        ` ${SEED_QUERIES.length}건(약 ${SEED_QUERIES.length * 101} units)을 쓰고도 아무것도` +
        ' 저장되지 않습니다.',
    )
    process.exitCode = 1
    return
  }

  const thin: Array<{ query: string; count: number }> = []

  for (const query of SEED_QUERIES) {
    try {
      const result = await getVideos(query)
      if (result.quotaExceeded) {
        console.error(`쿼터 소진. ${query} 이후는 건너뜁니다.`)
        process.exitCode = 1
        return
      }
      if (result.videos.length < THIN_RESULT_THRESHOLD) {
        thin.push({ query, count: result.videos.length })
      }
      console.log(`${query}: ${result.videos.length}개 ${result.fromCache ? '(캐시)' : '(신규)'}`)
    } catch (error) {
      console.error(`${query} 실패:`, error instanceof Error ? error.message : error)
      process.exitCode = 1
      return
    }
  }

  if (thin.length > 0) {
    console.warn('')
    console.warn(`결과가 ${THIN_RESULT_THRESHOLD}개 미만인 검색어가 있습니다:`)
    for (const item of thin) console.warn(`  ${item.query} — ${item.count}개`)
    console.warn('이런 검색어는 화면에서 빈 것처럼 보입니다.')
    console.warn('src/data/categories.ts 에서 더 흔한 표현으로 바꾸거나 상위 부위로 되돌리세요.')
  }

  console.log('시드 완료')
}

void main()
