import { describe, expect, it } from 'vitest'
import { roleFromProfile } from '@/features/account/session'

describe('roleFromProfile', () => {
  it('admin 을 그대로 읽는다', () => {
    expect(roleFromProfile({ role: 'admin' })).toBe('admin')
  })

  it('user 를 그대로 읽는다', () => {
    expect(roleFromProfile({ role: 'user' })).toBe('user')
  })

  it('프로필이 없으면 일반 사용자로 본다', () => {
    // 트리거가 한 번 실패한 사용자가 앱에 영영 못 들어오면 안 된다.
    // 그리고 '없으면 일반 사용자' 가 안전한 방향이다 — 관리자 권한이
    // 실수로 열리는 쪽이 아니다.
    expect(roleFromProfile(null)).toBe('user')
  })

  it('모르는 값은 일반 사용자로 본다', () => {
    expect(roleFromProfile({ role: 'superadmin' })).toBe('user')
    expect(roleFromProfile({ role: '' })).toBe('user')
    expect(roleFromProfile({ role: null })).toBe('user')
    expect(roleFromProfile({})).toBe('user')
  })
})
