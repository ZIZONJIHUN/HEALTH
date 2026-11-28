import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShortVideo } from '@/lib/types'

/** routines.test.ts 와 같은 이유로 history.ts 가 쓰는 것만 흉내 낸다. */
function installBrowserStub() {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  return store
}

async function freshModule() {
  vi.resetModules()
  return import('@/features/history/history')
}

const video = (id: string): ShortVideo => ({
  id,
  title: `${id} 자세`,
  channelTitle: '헬스톡',
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  durationSeconds: 45,
})

let store: Map<string, string>

beforeEach(() => {
  store = installBrowserStub()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('최근 검색어', () => {
  it('처음에는 비어 있다', async () => {
    const { loadHistory } = await freshModule()
    expect(loadHistory().searches).toEqual([])
  })

  it('최근 것이 앞에 온다', async () => {
    const { recordSearch, loadHistory } = await freshModule()
    recordSearch('스쿼트')
    recordSearch('데드리프트')
    expect(loadHistory().searches).toEqual(['데드리프트', '스쿼트'])
  })

  it('같은 검색어는 한 번만 남기고 앞으로 올린다', async () => {
    const { recordSearch, loadHistory } = await freshModule()
    recordSearch('스쿼트')
    recordSearch('데드리프트')
    // 대소문자·공백만 다른 것은 같은 검색이다 — 캐시 키도 같다.
    recordSearch('  스쿼트 ')
    expect(loadHistory().searches).toEqual(['스쿼트', '데드리프트'])
  })

  it('빈 검색어는 남기지 않는다', async () => {
    const { recordSearch, loadHistory } = await freshModule()
    recordSearch('   ')
    expect(loadHistory().searches).toEqual([])
  })

  it('개수에 상한이 있다', async () => {
    const { recordSearch, loadHistory, MAX_SEARCHES } = await freshModule()
    for (let n = 0; n < MAX_SEARCHES + 3; n++) recordSearch(`운동${n}`)
    const { searches } = loadHistory()
    expect(searches).toHaveLength(MAX_SEARCHES)
    expect(searches[0]).toBe(`운동${MAX_SEARCHES + 2}`)
  })

  it('하나만 지우거나 전부 지운다', async () => {
    const { recordSearch, removeSearch, clearSearches, loadHistory } = await freshModule()
    recordSearch('스쿼트')
    recordSearch('런지')
    removeSearch('스쿼트')
    expect(loadHistory().searches).toEqual(['런지'])
    clearSearches()
    expect(loadHistory().searches).toEqual([])
  })
})

describe('최근 본 영상', () => {
  it('최근 것이 앞에 오고 중복은 앞으로 올린다', async () => {
    const { recordView, loadHistory } = await freshModule()
    recordView(video('a'))
    recordView(video('b'))
    recordView(video('a'))
    expect(loadHistory().videos.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('개수에 상한이 있다', async () => {
    const { recordView, loadHistory, MAX_VIDEOS } = await freshModule()
    for (let n = 0; n < MAX_VIDEOS + 2; n++) recordView(video(`v${n}`))
    expect(loadHistory().videos).toHaveLength(MAX_VIDEOS)
  })

  it('전부 지운다', async () => {
    const { recordView, clearVideos, loadHistory } = await freshModule()
    recordView(video('a'))
    clearVideos()
    expect(loadHistory().videos).toEqual([])
  })

  it('이미 맨 앞인 영상을 다시 보면 저장하지 않는다', async () => {
    // 피드에서 같은 슬라이드로 되돌아올 때마다 쓰기와 리렌더가 일어날 이유가 없다.
    const { recordView, loadHistory } = await freshModule()
    recordView(video('a'))
    const before = loadHistory()
    recordView(video('a'))
    expect(loadHistory()).toBe(before)
  })
})

describe('저장소', () => {
  it('바뀌지 않았으면 같은 참조를 돌려준다', async () => {
    const { recordSearch, loadHistory } = await freshModule()
    recordSearch('스쿼트')
    expect(loadHistory()).toBe(loadHistory())
  })

  it('손상된 값은 빈 기록으로 읽는다', async () => {
    store.set('health-shorts:history:v1', '{not json')
    const { loadHistory } = await freshModule()
    expect(loadHistory()).toEqual({ searches: [], videos: [] })
  })

  it('모양이 틀린 항목은 걸러낸다', async () => {
    store.set(
      'health-shorts:history:v1',
      JSON.stringify({ searches: ['스쿼트', 3], videos: [video('a'), { id: 1 }] }),
    )
    const { loadHistory } = await freshModule()
    const history = loadHistory()
    expect(history.searches).toEqual(['스쿼트'])
    expect(history.videos.map((item) => item.id)).toEqual(['a'])
  })
})
