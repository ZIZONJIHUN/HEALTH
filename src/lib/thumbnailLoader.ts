'use client'

/**
 * next/image 전역 로더 (next.config.ts 의 images.loaderFile 이 가리킨다).
 *
 * 기본 동작은 이미지마다 서버가 원본을 받아 다시 인코딩해 내보낸다. 그리드 한 화면이
 * 25장이므로 검색할 때마다 25번이다. 그런데 이 앱의 이미지는 **전부** YouTube 썸네일이고
 * `hqdefault.jpg` 는 이미 최적화된 고정 크기 JPEG 라서 재인코딩으로 얻는 것이 없다.
 * 첫 요청 지연과 (Vercel이라면) 변환 과금만 늘어난다.
 *
 * YouTube 는 같은 영상의 크기별 변형을 직접 제공한다. 재인코딩 없이 그중 필요한
 * 크기를 고른다. 루틴 목록의 36px 썸네일이 480px 원본 대신 120px 변형을 받는 것도
 * 여기서 생기는 이득이다.
 *
 * 로더는 전역이지만 YouTube 썸네일이 아닌 URL 은 그대로 통과시킨다. 나중에 로컬
 * 이미지가 추가돼도 조용히 깨지지 않는다.
 */

/**
 * 폭이 작은 것부터. next/image 가 srcset 을 만들 때 요청 폭마다 이 함수를 부른다.
 *
 * sddefault(640)와 maxresdefault(1280)는 **일부러 뺐다.** 모든 영상에 존재하지 않아서 —
 * 오래됐거나 저화질로 업로드된 영상에는 없다 — 404 가 되고 카드가 빈 칸으로 남는다.
 * hqdefault(480)는 모든 영상에 있고 9:16 카드에 충분하다.
 */
const VARIANTS = [
  { name: 'default', width: 120 },
  { name: 'mqdefault', width: 320 },
  { name: 'hqdefault', width: 480 },
] as const

const LARGEST = VARIANTS[VARIANTS.length - 1]

const YOUTUBE_THUMBNAIL = /^https:\/\/i\.ytimg\.com\/vi\/([\w-]+)\/\w+\.jpg$/

export default function thumbnailLoader({ src, width }: { src: string; width: number }): string {
  const match = YOUTUBE_THUMBNAIL.exec(src)
  // 모르는 형식의 URL 을 추측해서 고치면 조용히 깨진다. 손대지 않는다.
  if (!match) return src

  const variant = VARIANTS.find((item) => item.width >= width) ?? LARGEST
  return `https://i.ytimg.com/vi/${match[1]}/${variant.name}.jpg`
}
