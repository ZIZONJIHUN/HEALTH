import { expect, test } from '@playwright/test'

test('보안 헤더가 응답에 붙는다', async ({ page }) => {
  // 헤더는 화면에 보이지 않아서, 확인하는 테스트가 없으면 설정이 사라져도 아무도 모른다.
  const response = await page.goto('/')
  const headers = response!.headers()

  // iframe 은 자기 자신과 Lectio 모닥불에서만 열린다. 나머지 사이트는 막는다.
  expect(headers['content-security-policy']).toBe(
    "frame-ancestors 'self' https://lectio.kr https://torch.ai.kr https://lectio.co.kr",
  )
  expect(headers['x-frame-options']).toBeUndefined()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')

  // 아직 Report-Only 다. 강제로 올릴 때 이 단정을 함께 바꾼다.
  const csp = headers['content-security-policy-report-only']
  expect(csp).toContain("frame-ancestors 'self' https://lectio.kr https://torch.ai.kr https://lectio.co.kr")
  // 재생이 이 두 출처에 달려 있다. 빠지면 강제 전환 순간 영상과 썸네일이 전부 죽는다.
  expect(csp).toContain('https://www.youtube.com')
  expect(csp).toContain('https://i.ytimg.com')
})

test('검색하면 쇼츠만 그리드에 나온다', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('운동 이름').fill('스쿼트')
  await page.getByRole('button', { name: '검색' }).click()

  // 모의 서버는 10개를 주지만 20분 영상은 걸러진다.
  await expect(page.getByTestId('video-card')).toHaveCount(9)
  await expect(page.getByText('스쿼트 기본 자세')).toBeVisible()
  await expect(page.getByText('스쿼트 20분 완전 강의')).toHaveCount(0)
})

/*
  다른 테스트와 다른 검색어를 쓴다. 캐시는 "최소 N 페이지" 의미라, 여기서 '스쿼트'를
  2페이지로 채워 두면 그 뒤 '스쿼트' 테스트들이 9개가 아니라 11개를 받는다.
  (서버가 한 프로세스라 메모리 캐시를 공유한다.)
*/
test('더 보기를 누르면 결과가 이어붙는다', async ({ page }) => {
  await page.goto('/?q=런지')
  await expect(page.getByTestId('video-card')).toHaveCount(9)

  await page.getByRole('link', { name: '더 보기' }).click()

  // 2페이지 2개가 덧붙는다. 앞의 9개가 사라지면 안 된다.
  await expect(page.getByTestId('video-card')).toHaveCount(11)
  await expect(page.getByText('불가리안 스플릿 스쿼트')).toBeVisible()
  // 상태가 URL 에 남아야 공유·뒤로가기가 동작한다.
  await expect(page).toHaveURL(/pages=2/)
  // 모의 서버는 2페이지에 nextPageToken 을 주지 않는다. 더 받을 것이 없으면 사라져야 한다.
  await expect(page.getByRole('link', { name: '더 보기' })).toHaveCount(0)

  // 피드도 같은 목록이어야 i 가 가리키는 영상이 그리드에서 누른 것과 같다.
  await page.getByTestId('video-card').nth(10).click()
  await expect(page).toHaveURL(/pages=2/)
  await expect(page.getByTestId('feed-slide')).toHaveCount(11)
})

test('카드를 누르면 전면 피드에서 재생된다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('video-card').nth(1).click()

  await expect(page).toHaveURL(/\/feed\?q=.*&i=1/)
  await expect(page.getByTestId('feed-slide')).toHaveCount(9)
  // 슬라이드는 9개지만 마운트 윈도우가 ±1이므로 iframe은 3개만 존재한다.
  await expect(page.locator('iframe')).toHaveCount(3)
  await expect(page.locator('iframe').first()).toHaveAttribute('src', /playsinline=1/)
  // 이 두 파라미터가 '다음으로 해보세요'의 전제다. loop=1 이면 영상이 끝나지 않아
  // 종료를 감지할 시점이 없고, enablejsapi=0 이면 종료 신호 자체가 오지 않는다.
  await expect(page.locator('iframe').first()).toHaveAttribute('src', /loop=0/)
  await expect(page.locator('iframe').first()).toHaveAttribute('src', /enablejsapi=1/)
})

test('뒤로가기로 그리드의 스크롤 위치가 복원된다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.evaluate(() => window.scrollTo(0, 400))
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(0)

  await page.getByTestId('video-card').first().click()
  await expect(page).toHaveURL(/\/feed/)

  await page.getByTestId('back-button').click()
  await expect(page).toHaveURL(/\/\?q=/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('영상을 몇 개 넘긴 뒤에도 뒤로 버튼 한 번에 그리드로 돌아간다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('video-card').first().click()
  await expect(page).toHaveURL(/\/feed/)
  const before = await page.evaluate(() => history.length)

  // 슬라이드가 바뀔 때 이미 뜬 iframe 의 src 를 바꾸면 iframe 안에서 내비게이션이
  // 일어나 세션 히스토리가 쌓이고, 뒤로가 페이지 대신 iframe 을 되돌린다.
  // 다 뜨기 전에 src 가 바뀌면 브라우저가 히스토리를 쌓지 않고 대체한다. 실제
  // 사용자처럼 영상이 뜰 시간을 두고 넘겨야 재현된다.
  for (const n of [2, 3, 4]) {
    await page.waitForTimeout(2000)
    await page.keyboard.press('ArrowDown')
    await expect(page.getByText(`${n} / 9`)).toBeVisible()
  }
  await expect(page.getByTestId('feed-slide').nth(3).locator('iframe')).toHaveAttribute(
    'src',
    /autoplay=1/,
  )
  // iframe 내비게이션은 비동기로 히스토리에 반영된다. 잠깐 기다렸다 센다.
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => history.length)).toBe(before)

  await page.getByTestId('back-button').click()
  await expect(page).toHaveURL(/\/\?q=/)
})

test('결과가 없으면 추천 검색어를 보여준다', async ({ page }) => {
  await page.goto('/?q=없는운동')

  await expect(page.getByTestId('empty-state')).toBeVisible()
  await expect(page.getByRole('link', { name: '스쿼트' })).toBeVisible()
})

test('쿼터가 초과되면 배너를 보여주고 화면은 유지된다', async ({ page }) => {
  await page.goto('/?q=쿼터초과')

  await expect(page.getByTestId('quota-banner')).toBeVisible()
  await expect(page.getByLabel('운동 이름')).toBeVisible()
})

test('쿼터 외의 오류는 재시도 화면을 보여준다', async ({ page }) => {
  await page.goto('/?q=서버오류')

  await expect(page.getByTestId('error-state')).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
})

test('다시 시도를 누르면 실제로 재요청해서 복구된다', async ({ page }) => {
  // 모의 서버는 '일시오류' 쿼리의 첫 /search 요청만 500을 준다.
  await page.goto('/?q=일시오류')

  await expect(page.getByTestId('error-state')).toBeVisible()
  await page.getByRole('button', { name: '다시 시도' }).click()

  await expect(page.getByTestId('error-state')).toHaveCount(0)
  await expect(page.getByTestId('video-card').first()).toBeVisible()
})

test('영상을 루틴에 담아 이어서 볼 수 있다', async ({ page }) => {
  await page.goto('/?q=스쿼트')

  // 첫 영상을 담으면서 루틴을 새로 만든다.
  await page.getByTestId('add-to-routine').first().click()
  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('가슴 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()

  // 두 번째 영상은 이미 있는 루틴에 담는다.
  await page.getByTestId('add-to-routine').nth(1).click()
  await page.getByRole('button', { name: /가슴 루틴/ }).click()

  await page.goto('/routines')
  await expect(page.getByRole('heading', { name: '가슴 루틴' })).toBeVisible()
  await expect(page.getByTestId('routine-item')).toHaveCount(2)

  // 루틴 재생은 localStorage 의 메타데이터만 쓴다. YouTube 를 다시 부르지 않는다.
  await page.getByTestId('start-routine').click()
  await expect(page).toHaveURL(/\/feed\?routine=.+&i=0/)
  await expect(page.getByTestId('feed-slide')).toHaveCount(2)
})

test('담은 운동의 순서를 바꾸고 뺄 수 있다', async ({ page }) => {
  await page.goto('/?q=스쿼트')

  await page.getByTestId('add-to-routine').first().click()
  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('등 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()

  await page.getByTestId('add-to-routine').nth(1).click()
  await page.getByRole('button', { name: /등 루틴/ }).click()

  await page.goto('/routines')
  const first = page.getByTestId('routine-item').first()
  await expect(first).toContainText('스쿼트 기본 자세')

  await page.getByRole('button', { name: /무릎 안 아픈 스쿼트 위로/ }).click()
  await expect(page.getByTestId('routine-item').first()).toContainText('무릎 안 아픈')

  await page.getByRole('button', { name: /스쿼트 기본 자세 빼기/ }).click()
  await expect(page.getByTestId('routine-item')).toHaveCount(1)
})

test('루틴을 실수로 지워도 되돌릴 수 있다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('add-to-routine').first().click()
  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('지울 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()

  await page.goto('/routines')
  await page.getByTestId('delete-routine').click()
  await expect(page.getByTestId('routine-card')).toHaveCount(0)

  // 로그인이 없어 저장 위치가 이 브라우저뿐이다. 되돌릴 길이 없으면 영구 손실이다.
  await page.getByRole('button', { name: '실행 취소' }).click()
  await expect(page.getByRole('heading', { name: '지울 루틴' })).toBeVisible()
  await expect(page.getByTestId('routine-item')).toHaveCount(1)

  // 새로고침해도 살아 있어야 실제로 저장된 것이다.
  await page.reload()
  await expect(page.getByRole('heading', { name: '지울 루틴' })).toBeVisible()
})

test('부위 칩을 누르면 세부 근육이 펼쳐지고 새로고침해도 유지된다', async ({ page }) => {
  await page.goto('/')
  // 처음에는 세부 줄이 없다.
  await expect(page.getByRole('link', { name: '광배근' })).toHaveCount(0)

  await page.getByRole('link', { name: '등', exact: true }).click()
  await expect(page.getByRole('link', { name: '등 전체' })).toBeVisible()
  await expect(page.getByRole('link', { name: '광배근' })).toBeVisible()

  await page.getByRole('link', { name: '광배근' }).click()
  await expect(page.getByRole('link', { name: '광배근' })).toHaveAttribute('aria-current', 'true')
  // 상위 칩도 함께 켜져 있어야 지금 어느 부위에 있는지 알 수 있다.
  await expect(page.getByRole('link', { name: '등', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  )

  // 펼침 상태를 URL 에서 유도하므로 새로고침해도 풀리지 않는다.
  await page.reload()
  await expect(page.getByRole('link', { name: '광배근' })).toBeVisible()
})

test('설정 화면은 Supabase 없이도 동작한다', async ({ page }) => {
  // E2E 환경에는 NEXT_PUBLIC_SUPABASE_* 가 빈 값이다 (playwright.config.ts).
  // 그 상태에서 화면이 깨지지 않고 이유를 알려주는지 본다.
  await page.goto('/account')

  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
  await expect(page.getByTestId('sign-in')).toBeDisabled()
  await expect(page.getByText('Supabase 설정이 없어')).toBeVisible()
})

test('로그인 실패는 에러 화면 대신 안내로 끝난다', async ({ page }) => {
  await page.goto('/account?auth=failed')

  await expect(page.getByTestId('account-notice')).toBeVisible()
  // 앱이 죽지 않고 화면이 그대로 있어야 한다.
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
})

test('OAuth 콜백이 외부 주소로 보내지 않는다', async ({ page }) => {
  // code 가 없으므로 실패 경로를 탄다. next 가 외부여도 우리 도메인에 남아야 한다.
  await page.goto('/auth/callback?next=https://example.com')

  await expect(page).toHaveURL(/\/account\?auth=failed/)
})

test('탭바에서 설정으로 들어가 로그인 화면에 닿는다', async ({ page }) => {
  // 진입점이 없으면 로그인 기능이 있어도 쓸 수가 없다.
  await page.goto('/')

  await page.getByRole('link', { name: '설정' }).click()

  await expect(page).toHaveURL(/\/account/)
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
  await expect(page.getByTestId('sign-in')).toBeVisible()
})

test('영상을 보면서 루틴에 담을 수 있다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('video-card').first().click()
  await expect(page).toHaveURL(/\/feed/)

  // 현재 슬라이드의 담기 버튼. 마운트 윈도우(±1) 때문에 여러 개가 존재한다.
  const slide = page.getByTestId('feed-slide').first()
  await slide.getByTestId('add-to-routine').click()

  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('피드에서 담은 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()

  // 피드를 떠나지 않는다 — 보던 자리에서 담는 것이 이 기능의 요점이다.
  await expect(page).toHaveURL(/\/feed/)

  await page.goto('/routines')
  await expect(page.getByRole('heading', { name: '피드에서 담은 루틴' })).toBeVisible()
  await expect(page.getByTestId('routine-item')).toHaveCount(1)
})

test('검색한 운동이 홈에 최근 검색어로 남는다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await expect(page.getByTestId('video-card').first()).toBeVisible()
  // 카드는 서버 HTML 로 먼저 보인다. 기록은 하이드레이션 뒤에 남으니 그때까지 기다린다.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('health-shorts:history:v1')))
    .toContain('스쿼트')

  await page.goto('/')
  const recent = page.getByTestId('recent-search')
  await expect(recent).toHaveCount(1)
  await expect(recent).toHaveText('스쿼트')

  await recent.click()
  await expect(page).toHaveURL(/\/\?q=%EC%8A%A4%EC%BF%BC%ED%8A%B8/)

  await page.goto('/')
  await page.getByRole('button', { name: '스쿼트 검색 기록 지우기' }).click()
  await expect(page.getByTestId('recent-search')).toHaveCount(0)
})

test('본 영상이 홈에 남고 누르면 다시 재생된다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('video-card').nth(2).click()
  await expect(page).toHaveURL(/\/feed/)
  await expect(page.getByText('3 / 9')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('health-shorts:history:v1')))
    .toContain('"videos":[{')

  await page.goto('/')
  const recent = page.getByTestId('recent-video')
  await expect(recent).toHaveCount(1)

  // 다시 틀 때 YouTube 를 부르지 않는다. 저장해 둔 메타데이터로 피드를 만든다.
  await recent.first().click()
  await expect(page).toHaveURL(/\/feed\?recent=1&i=0/)
  await expect(page.getByTestId('feed-slide')).toHaveCount(1)
})

test('루틴 화면이 로그인 안내를 보여준다', async ({ page }) => {
  // E2E 는 Supabase 가 꺼져 있어 상태가 늘 local 이다. 비로그인 사용자에게 저장 위치와 다음 행동을 알려야 한다.
  await page.goto('/routines')
  const line = page.getByTestId('sync-status')
  await expect(line).toContainText('이 브라우저에만 저장돼요')
  await expect(line.getByRole('link', { name: /로그인하면/ })).toHaveAttribute('href', '/account')
})

test('루틴을 끝내면 이번 주 기록에 남는다', async ({ page }) => {
  await page.goto('/?q=스쿼트')

  // 영상 하나를 담은 루틴을 만든다. 하나뿐이라 첫 슬라이드가 곧 마지막 슬라이드다.
  await page.getByTestId('add-to-routine').first().click()
  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('하체 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()

  await page.goto('/routines')
  await page.getByTestId('start-routine').click()
  await expect(page).toHaveURL(/\/feed\?routine=.+&i=0/)

  await page.getByTestId('finish-workout').click()
  await expect(page.getByTestId('workout-recorded')).toBeVisible()
  // 한 재생에서 두 번 기록되지 않는다 — 버튼이 결과 문구로 바뀐다.
  await expect(page.getByTestId('finish-workout')).toHaveCount(0)

  await page.goto('/routines')
  await expect(page.getByTestId('workout-summary')).toContainText('연속 1일')
  await expect(page.getByTestId('workout-summary')).toContainText('이번 달 1회')
})

test('기록이 없으면 안내 한 줄만 보인다', async ({ page }) => {
  await page.goto('/routines')
  await expect(page.getByText('루틴을 끝까지 하면 여기에 기록돼요.')).toBeVisible()
  await expect(page.getByTestId('workout-summary')).toHaveCount(0)
})

test('검색 피드에는 운동 완료 버튼이 없다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('video-card').nth(8).click()
  await expect(page.getByText('9 / 9')).toBeVisible()
  // 검색 피드는 운동이 아니다. 마지막 슬라이드여도 기록할 것이 없다.
  await expect(page.getByTestId('finish-workout')).toHaveCount(0)
})

test('루틴의 운동마다 휴식 시간을 정하고 재생 중 타이머를 쓴다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  // 첫 카드는 모의 서버의 '스쿼트 기본 자세' — 큰 근육 운동이라 추천은 90초다.
  await page.getByTestId('add-to-routine').first().click()
  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('하체 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()

  await page.goto('/routines')
  const picker = page.getByTestId('rest-picker').first()
  // 추천 표시는 추천값 칩 안에 있다. 담을 때 추천값으로 정해져 그 칩이 켜져 있다.
  const recommended = picker.getByRole('button', { name: '1분 30초' })
  await expect(recommended).toContainText('추천')
  await expect(recommended).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.getByRole('button', { name: '60초', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  await picker.getByRole('button', { name: '60초', exact: true }).click()
  await expect(picker.getByRole('button', { name: '60초', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await picker.getByRole('button', { name: '1분 30초' }).click()
  await picker.getByRole('button', { name: '휴식 10초 늘리기' }).click()
  await expect(picker).toContainText('1분 40초')
  // 프리셋이 아닌 값이면 켜진 칩이 없다.
  await expect(picker.getByRole('button', { name: '1분 30초' })).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByTestId('rest-picker').first()).toContainText('1분 40초') // 저장됨

  await page.getByTestId('start-routine').click()
  await expect(page.getByTestId('start-rest')).toContainText('1분 40초')
  await page.getByTestId('start-rest').click()
  await expect(page.getByTestId('rest-panel')).toContainText(/1:(40|39|38)/)
  await page.getByRole('button', { name: '+10초' }).click()
  await expect(page.getByTestId('rest-panel')).toContainText(/1:(50|49|48|47)/)
  await page.getByRole('button', { name: '건너뛰기' }).click()
  await expect(page.getByTestId('rest-panel')).toHaveCount(0)
  // 재생 중 조절은 저장하지 않는다.
  await expect(page.getByTestId('start-rest')).toContainText('1분 40초')
})

test('휴식이 끝나면 휴식 끝을 잠깐 보여주고 닫힌다', async ({ page }) => {
  await page.clock.install()
  await page.goto('/?q=스쿼트')
  await page.getByTestId('add-to-routine').first().click()
  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('하체 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()

  await page.goto('/routines')
  const picker = page.getByTestId('rest-picker').first()
  await picker.getByRole('button', { name: '30초', exact: true }).click()
  await page.getByTestId('start-routine').click()
  await page.getByTestId('start-rest').click()
  await expect(page.getByTestId('rest-panel')).toContainText('0:30')

  await page.clock.runFor(31_000)
  await expect(page.getByTestId('rest-panel')).toContainText('휴식 끝')
  await page.clock.runFor(2_500)
  await expect(page.getByTestId('rest-panel')).toHaveCount(0)
})

test('검색 피드에는 휴식 버튼이 없다', async ({ page }) => {
  await page.goto('/feed?q=스쿼트')
  await expect(page.getByTestId('feed-slide').first()).toBeVisible()
  await expect(page.getByTestId('start-rest')).toHaveCount(0)
})

test('재생 중 다른 탭에서 루틴이 줄어도 재생 화면이 살아 있다', async ({ page }) => {
  await page.goto('/?q=스쿼트')
  await page.getByTestId('add-to-routine').nth(0).click()
  await page.getByRole('button', { name: '새 루틴 만들기' }).click()
  await page.getByLabel('새 루틴 이름').fill('줄어드는 루틴')
  await page.getByRole('button', { name: '만들고 담기' }).click()
  await page.getByTestId('add-to-routine').nth(1).click()
  await page.getByRole('button', { name: /^줄어드는 루틴/ }).click()

  // 마지막 운동에서 재생을 시작한다.
  const routineId = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('health-shorts:routines:v2')!)[0].id as string,
  )
  await page.goto(`/feed?routine=${routineId}&i=1`)
  await expect(page.getByText('2 / 2')).toBeVisible()

  // 다른 탭이 마지막 운동을 뺐다. storage 이벤트는 다른 탭에서만 오므로 직접 쏜다.
  await page.evaluate(() => {
    const key = 'health-shorts:routines:v2'
    const routines = JSON.parse(window.localStorage.getItem(key)!)
    routines[0].items = routines[0].items.slice(0, 1)
    window.localStorage.setItem(key, JSON.stringify(routines))
    window.dispatchEvent(new StorageEvent('storage', { key }))
  })

  await expect(page.getByText('1 / 1')).toBeVisible()
  await expect(page.getByTestId('start-rest')).toBeVisible()
  await expect(page.getByTestId('finish-workout')).toBeVisible()
})
