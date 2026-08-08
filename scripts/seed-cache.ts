import { POPULAR_EXERCISES } from '../src/data/categories'
import { getVideos } from '../src/lib/videoSearch'

/**
 * 인기 운동을 미리 캐시에 채운다.
 * 검색 1회는 101 units 이므로 20개는 약 2,020 units. 일일 10,000 안에 들어간다.
 * 쿼터가 소진되면 즉시 멈춘다. 남은 항목은 다음 날 다시 실행한다.
 */
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
    console.error(
      'Supabase 없이 시드를 돌리면 getVideos()가 이 스크립트 프로세스의 메모리 캐시에만 쓰고,' +
        ' 그 캐시는 프로세스가 끝나는 순간 사라집니다. 검색 20건(약 2,020 units, 일일 쿼터의' +
        ' 5분의 1)을 쓰고도 아무것도 저장되지 않습니다.',
    )
    process.exitCode = 1
    return
  }

  for (const exercise of POPULAR_EXERCISES) {
    try {
      const result = await getVideos(exercise)
      if (result.quotaExceeded) {
        console.error(`쿼터 소진. ${exercise} 이후는 건너뜁니다.`)
        process.exitCode = 1
        return
      }
      console.log(`${exercise}: ${result.videos.length}개 ${result.fromCache ? '(캐시)' : '(신규)'}`)
    } catch (error) {
      console.error(`${exercise} 실패:`, error instanceof Error ? error.message : error)
      process.exitCode = 1
      return
    }
  }
  console.log('시드 완료')
}

void main()
