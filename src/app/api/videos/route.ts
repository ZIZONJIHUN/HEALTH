// 다음 단계(외부 클라이언트/네이티브 앱 연동)를 위해 미리 열어 둔 공개 엔드포인트.
// 현재 src/ 안 어디에서도 이 라우트를 호출하지 않는다.
import { NextResponse } from 'next/server'
import { getVideos } from '@/lib/videoSearch'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? ''
  if (!query.trim()) {
    return NextResponse.json({ error: 'q 파라미터가 필요합니다' }, { status: 400 })
  }

  const result = await getVideos(query)
  return NextResponse.json(result)
}
