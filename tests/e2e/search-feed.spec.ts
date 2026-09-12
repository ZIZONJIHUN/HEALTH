import { expect, test } from '@playwright/test'

test('보안 헤더가 응답에 붙는다', async ({ page }) => {
  // 헤더는 화면에 보이지 않아서, 확인하는 테스트가 없으면 설정이 사라져도 아무도 모른다.
  const response = await page.goto('/')
  const headers = response!.headers()

  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')

  // 아직 Report-Only 다. 강제로 올릴 때 이 단정을 함께 바꾼다.
  const csp = headers['content-security-policy-report-only']
  expect(csp).toContain("frame-ancestors 'none'")
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
