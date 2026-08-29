import { describe, expect, it } from 'vitest'
import bodyModelNodes from '@/data/bodyModelNodes.json'
import { BODY_PARTS, MUSCLE_GROUPS, matchQuery, subgroupsOf } from '@/data/categories'

/**
 * 3D 모델과 화면 데이터가 어긋나지 않는지 본다.
 *
 * 빌드 스크립트(scripts/build-body-model.mjs)와 categories.ts 가 각자 목록을 들고 있어서,
 * 어긋나도 화면에는 조용히 회색 구멍이 생길 뿐 아무 오류가 안 난다. 실제로 팔뚝과 허벅지
 * 안쪽에 근육이 없어 회색으로 비고 클릭도 안 되던 결함을 한참 뒤에야 발견했다.
 * 세부 부위가 18개로 늘면서 어긋날 여지가 더 커졌으므로 여기서 막는다.
 */
describe('3D 모델 ↔ 부위 데이터 정합성', () => {
  it('화면이 아는 세부 부위는 모델에도 있다', () => {
    // 없으면 그 부위가 인체도에서 회색으로 비고 눌러도 반응하지 않는다.
    const modelNodes = new Set<string>(bodyModelNodes.groups)
    const missing = MUSCLE_GROUPS.filter((group) => !modelNodes.has(group.id))
    expect(missing.map((group) => group.id)).toEqual([])
  })

  it('모델에 있는 노드는 화면도 안다', () => {
    // 모르면 인체도에서 그 부위를 눌러도 어디로 가야 할지 알 수 없다.
    const known = new Set<string>(MUSCLE_GROUPS.map((group) => group.id))
    const orphans = bodyModelNodes.groups.filter((id) => !known.has(id))
    expect(orphans).toEqual([])
  })

  it('피부 노드 이름이 앱이 기대하는 값과 같다', () => {
    // BodyModelPicker 가 이 이름으로 피부만 반투명 처리하고 클릭 대상에서 뺀다.
    expect(bodyModelNodes.shell).toBe('shell')
  })
})

describe('부위 데이터', () => {
  it('모든 세부 부위의 상위가 실제로 존재한다', () => {
    const partIds = new Set<string>(BODY_PARTS.map((part) => part.id))
    const dangling = MUSCLE_GROUPS.filter((group) => !partIds.has(group.parent))
    expect(dangling.map((group) => `${group.id}→${group.parent}`)).toEqual([])
  })

  it('검색어가 겹치지 않는다', () => {
    // 겹치면 matchQuery 가 한쪽만 돌려줘서 칩 활성 표시와 인체도 하이라이트가 어긋난다.
    const queries = [...BODY_PARTS, ...MUSCLE_GROUPS].map((item) => item.query)
    expect(new Set(queries).size).toBe(queries.length)
  })

  it('id 가 겹치지 않는다', () => {
    const ids = [...BODY_PARTS.map((p) => p.id), ...MUSCLE_GROUPS.map((g) => g.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('전신을 뺀 모든 부위가 세부를 가진다', () => {
    // 세부가 없는 부위는 칩을 눌러도 아래 줄이 안 열려서 고장난 것처럼 보인다.
    const withoutSubgroups = BODY_PARTS.filter(
      (part) => part.id !== 'full' && subgroupsOf(part.id).length === 0,
    )
    expect(withoutSubgroups.map((part) => part.id)).toEqual([])
  })

  it('전신은 세부가 없다', () => {
    // 부위가 아니라 훈련 방식이라 대응하는 근육이 없다.
    expect(subgroupsOf('full')).toEqual([])
  })
})

describe('matchQuery', () => {
  it('세부 검색어는 세부와 그 상위를 함께 돌려준다', () => {
    const match = matchQuery('햄스트링 운동')
    expect(match.kind).toBe('group')
    if (match.kind !== 'group') throw new Error('unreachable')
    expect(match.group.id).toBe('legs-hamstrings')
    expect(match.part.id).toBe('legs')
  })

  it('상위 검색어는 상위만 돌려준다', () => {
    const match = matchQuery('등 운동')
    expect(match.kind).toBe('part')
    if (match.kind !== 'part') throw new Error('unreachable')
    expect(match.part.id).toBe('back')
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(matchQuery('  광배근 운동 ').kind).toBe('group')
  })

  it('부위와 무관한 검색어는 아무것도 가리키지 않는다', () => {
    // '스쿼트' 로 검색했을 때 엉뚱한 칩이 켜지면 안 된다.
    expect(matchQuery('스쿼트').kind).toBe('none')
    expect(matchQuery('').kind).toBe('none')
  })
})
