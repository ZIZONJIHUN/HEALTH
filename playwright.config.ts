import { defineConfig, devices } from '@playwright/test'

// 3000번은 이 머신에서 다른(무관한) 서비스가 이미 점유하고 있을 수 있다.
// reuseExistingServer 가 그 프로세스를 "이미 뜬 서버"로 오인해 재사용하면서
// 테스트가 완전히 다른 앱(!)을 상대로 실행되는 사고가 실제로 있었다.
// 그래서 앱을 3100번으로 옮겨 충돌을 피한다.
const BASE_URL = 'http://127.0.0.1:3100'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: BASE_URL, ...devices['Pixel 5'] },
  webServer: [
    {
      command: 'node tests/e2e/mock-youtube.mjs',
      port: 4010,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build && npm run start -- -p 3100',
      url: BASE_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      // SUPABASE_* 를 주지 않으므로 캐시 없이 매번 모의 서버를 호출한다.
      env: {
        YOUTUBE_API_KEY: 'test-key',
        YOUTUBE_API_BASE: 'http://127.0.0.1:4010/youtube/v3',
      },
    },
  ],
})
