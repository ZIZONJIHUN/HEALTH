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

// "더 보기" 로만 닿는 2페이지. 1페이지 응답이 nextPageToken 을 줄 때만 요청된다.
const PAGE_TWO = [
  { id: 'vid11', title: '스쿼트 점프 응용', channelTitle: '짐랫', duration: 'PT35S' },
  { id: 'vid12', title: '불가리안 스플릿 스쿼트', channelTitle: '홈트왕', duration: 'PT55S' },
]

const NEXT_PAGE_TOKEN = 'PAGE2'

/** 두 페이지 어디에 있든 id 로 찾는다. */
const ALL = [...CATALOG, ...PAGE_TWO]

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

// '일시오류' 는 첫 /search 요청만 500 을 반환하고, 이후에는 정상 응답한다.
// unstable_retry() 가 실제로 재요청해서 복구되는지 검증하기 위한 마커.
// 서버가 뜰 때마다 초기화되어 실행 간 독립적이다.
let transientFailureUsed = false

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const query = url.searchParams.get('q') ?? ''
  res.setHeader('content-type', 'application/json')

  if (query.includes('서버오류')) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: { message: 'internal error' } }))
    return
  }

  if (query.includes('일시오류') && url.pathname.endsWith('/search') && !transientFailureUsed) {
    transientFailureUsed = true
    res.statusCode = 500
    res.end(JSON.stringify({ error: { message: 'internal error' } }))
    return
  }

  if (query.includes('쿼터초과')) {
    res.statusCode = 403
    res.end(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }))
    return
  }

  if (url.pathname.endsWith('/search')) {
    if (query.includes('없는운동')) {
      res.end(JSON.stringify({ items: [] }))
      return
    }

    // pageToken 이 있으면 2페이지다. 2페이지에는 nextPageToken 을 주지 않아
    // "더 보기"가 사라지는 것까지 검증할 수 있다.
    const onPageTwo = url.searchParams.get('pageToken') === NEXT_PAGE_TOKEN
    const entries = onPageTwo ? PAGE_TWO : CATALOG

    res.end(
      JSON.stringify({
        items: entries.map((entry) => ({ id: { videoId: entry.id } })),
        ...(onPageTwo ? {} : { nextPageToken: NEXT_PAGE_TOKEN }),
      }),
    )
    return
  }

  if (url.pathname.endsWith('/videos')) {
    const ids = (url.searchParams.get('id') ?? '').split(',')
    res.end(JSON.stringify({ items: ALL.filter((e) => ids.includes(e.id)).map(videoItem) }))
    return
  }

  res.statusCode = 404
  res.end('{}')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock youtube listening on ${PORT}`)
})
