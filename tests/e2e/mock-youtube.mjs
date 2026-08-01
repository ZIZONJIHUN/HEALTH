import { createServer } from 'node:http'

const PORT = 4010

// 쇼츠 9개 + 걸러져야 하는 20분 영상 1개.
// 그리드가 화면보다 길어야 스크롤 복원 테스트가 의미를 갖고,
// 슬라이드가 마운트 윈도우(±1)보다 많아야 iframe 개수로 윈도우를 검증할 수 있다.
const CATALOG = [
  { id: 'vid1', title: '스쿼트 기본 자세', channelTitle: '헬스톡', duration: 'PT45S' },
  { id: 'vid2', title: '무릎 안 아픈 스쿼트', channelTitle: '김코치', duration: 'PT58S' },
  { id: 'vid3', title: '하체 루틴 30초', channelTitle: '짐랫', duration: 'PT30S' },
  { id: 'vid4', title: '스쿼트 발 너비', channelTitle: '헬스톡', duration: 'PT52S' },
  { id: 'vid5', title: '스쿼트 호흡법', channelTitle: '김코치', duration: 'PT40S' },
  { id: 'vid6', title: '스쿼트 흔한 실수 3가지', channelTitle: '짐랫', duration: 'PT1M10S' },
  { id: 'vid7', title: '맨몸 스쿼트 100개', channelTitle: '홈트왕', duration: 'PT2M30S' },
  { id: 'vid8', title: '스미스머신 스쿼트', channelTitle: '헬스톡', duration: 'PT1M45S' },
  { id: 'vid9', title: '스쿼트 무게 늘리기', channelTitle: '김코치', duration: 'PT3M' },
  { id: 'vid10', title: '스쿼트 20분 완전 강의', channelTitle: '헬스톡', duration: 'PT20M' },
]

function videoItem(entry) {
  return {
    id: entry.id,
    snippet: {
      title: entry.title,
      channelTitle: entry.channelTitle,
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg` } },
    },
    contentDetails: { duration: entry.duration },
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const query = url.searchParams.get('q') ?? ''
  res.setHeader('content-type', 'application/json')

  if (query.includes('쿼터초과')) {
    res.statusCode = 403
    res.end(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }))
    return
  }

  if (url.pathname.endsWith('/search')) {
    const items = query.includes('없는운동')
      ? []
      : CATALOG.map((entry) => ({ id: { videoId: entry.id } }))
    res.end(JSON.stringify({ items }))
    return
  }

  if (url.pathname.endsWith('/videos')) {
    const ids = (url.searchParams.get('id') ?? '').split(',')
    res.end(JSON.stringify({ items: CATALOG.filter((e) => ids.includes(e.id)).map(videoItem) }))
    return
  }

  res.statusCode = 404
  res.end('{}')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock youtube listening on ${PORT}`)
})
