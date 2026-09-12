/**
 * 글자 있는 버튼의 공통 모양.
 *
 * 에러 화면, 404, 루틴 카드, 빈 화면이 같은 버튼을 쓴다. 클래스 문자열을 복붙해두면
 * 한쪽만 고쳐지면서 금방 서로 어긋난다.
 *
 * 크기 변형(sm/md/lg)을 미리 만들어 두지 않는다. 지금 다른 크기를 쓰는 곳은 두 군데
 * 뿐이고, 쓰지 않을 변형을 갖춰 두면 나중에 "있으니까" 잘못 고르게 된다.
 * 같은 모양이 셋 이상 생기면 그때 올린다.
 *
 * 컴포넌트가 아니라 클래스 문자열인 이유는 이 프로젝트가 버튼을 `<button>` 과
 * `<Link>` 양쪽으로 쓰기 때문이다. 둘을 한 컴포넌트로 덮으면 props 를 중계하는 층만
 * 늘고 얻는 것이 없다.
 */

const SHAPE = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-5 text-sm'

export const BUTTON_PRIMARY = `${SHAPE} bg-accent font-semibold text-accent-fg hover:bg-accent-hover`

export const BUTTON_SECONDARY = `${SHAPE} border border-border bg-surface2 font-medium text-muted hover:border-border-strong hover:bg-surface3 hover:text-text`
