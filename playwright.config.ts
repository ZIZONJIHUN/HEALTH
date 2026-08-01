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
      // SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 를 빈 문자열로 강제해 getClient() 가
      // 항상 null을 돌려주게 한다. `next start` 는 .env.local 을 읽으므로, README의
      // Supabase 설정을 따라간 개발자의 머신에서는 빈 값으로 덮어쓰지 않으면 E2E가
      // 실제 캐시에 모의 카탈로그(vid1~vid9, 실존하지 않는 썸네일)를 '스쿼트' 키로
      // 7일 TTL로 써버린다 — 실제 사용자가 죽은 썸네일 9개를 일주일 동안 보게 된다.
      // 반대로 실제 캐시에 이미 '스쿼트' 행이 있으면 toHaveCount(9) 가 알 수 없는
      // 이유로 실패한다. 이 env 블록은 E2E가 실제 캐시를 절대 건드리지 않게 만든다.
      env: {
        YOUTUBE_API_KEY: 'test-key',
        YOUTUBE_API_BASE: 'http://127.0.0.1:4010/youtube/v3',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
    },
  ],
})
