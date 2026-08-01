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
