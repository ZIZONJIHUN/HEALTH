import { POPULAR_EXERCISES } from '../src/data/categories'
import { getVideos } from '../src/lib/videoSearch'

/**
 * 인기 운동을 미리 캐시에 채운다.
 * 검색 1회는 101 units 이므로 20개는 약 2,020 units. 일일 10,000 안에 들어간다.
 * 쿼터가 소진되면 즉시 멈춘다. 남은 항목은 다음 날 다시 실행한다.
 */
async function main() {
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
