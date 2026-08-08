/**
 * Pretendard Variable 을 자가호스팅용으로 내려받는다.
 *
 * 왜 npm 의존성이 아니라 스크립트인가: `pretendard` 패키지는 압축 해제 시 97MB다.
 * 실제로 필요한 건 variable dynamic subset 92조각(2.8MB)뿐이라 그것만 받아 커밋한다.
 *
 * 왜 dynamic subset 인가: 단일 variable 파일은 2.06MB를 전량 내려받는다. dynamic subset 은
 * unicode-range 로 나뉘어 있어 페이지에 실제로 쓰인 글자 범위만 받는다(대개 150KB 안팎).
 *
 * 실행: node scripts/fetch-pretendard.mjs
 * 결과: public/fonts/pretendard/*.woff2 , src/app/pretendard.css
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const VERSION = 'v1.3.9'
const REPO = `https://raw.githubusercontent.com/orioncactus/pretendard/${VERSION}/packages/pretendard/dist/web/variable`
const SUBSET_COUNT = 92
const CONCURRENCY = 12

const FONT_DIR = path.join('public', 'fonts', 'pretendard')
const CSS_PATH = path.join('src', 'app', 'pretendard.css')

const HEADER = `/*
 * Pretendard Variable (dynamic subset) — SIL Open Font License 1.1
 * Copyright (c) 2021 Kil Hyung-jin, with Reserved Font Name Pretendard.
 * https://github.com/orioncactus/pretendard (${VERSION})
 *
 * 자동 생성 파일. 직접 수정하지 않는다. 갱신은 scripts/fetch-pretendard.mjs 로 한다.
 * woff2 조각은 public/fonts/pretendard/ 에 있고 unicode-range 로 나뉘어 있어
 * 페이지에 실제로 쓰인 글자 범위만 내려받는다.
 */
`

async function fetchOrThrow(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response
}

async function fetchSubset(index) {
  const name = `PretendardVariable.subset.${index}.woff2`
  const response = await fetchOrThrow(`${REPO}/woff2-dynamic-subset/${name}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(path.join(FONT_DIR, name), bytes)
  return bytes.length
}

async function main() {
  await mkdir(FONT_DIR, { recursive: true })

  let total = 0
  for (let start = 0; start < SUBSET_COUNT; start += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, SUBSET_COUNT - start) },
      (_, offset) => start + offset,
    )
    const sizes = await Promise.all(batch.map(fetchSubset))
    total += sizes.reduce((sum, size) => sum + size, 0)
  }

  const upstream = await (await fetchOrThrow(`${REPO}/pretendardvariable-dynamic-subset.css`)).text()
  const css = upstream
    // 폰트 조각은 public/ 아래에 있으므로 절대 경로여야 한다.
    // CSS 자체는 src/app 에서 번들되므로 상대 경로는 어긋난다.
    .replace(/url\(\.\/woff2-dynamic-subset\//g, 'url(/fonts/pretendard/')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    // 업스트림 라이선스 주석은 위 HEADER 로 대체한다.
    .replace(/^\/\*[\s\S]*?\*\/\n/, '')

  await writeFile(CSS_PATH, HEADER + css)
  console.log(`${SUBSET_COUNT}개 조각 ${(total / 1024 / 1024).toFixed(2)}MB, ${CSS_PATH} 생성`)
}

await main()
