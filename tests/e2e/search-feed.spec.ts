import { expect, test } from '@playwright/test'

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
