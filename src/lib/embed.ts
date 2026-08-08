/**
 * 웹 내부 재생용 임베드 URL을 만든다.
 * mute=1 은 선택이 아니다. 모바일 브라우저는 음소거 자동재생만 허용한다.
 * loop=1 은 단일 영상일 때 playlist 에 같은 ID를 넣어야 동작한다.
 *
 * autoplay는 필수 옵션이다. ShortsFeed는 마운트 윈도우(±1)만큼 iframe을
 * 미리 그려 플레이어 셸을 준비해 두지만, 현재 보이는 슬라이드가 아니면
 * 스트리밍할 이유가 없다. 기본값을 두면 호출부가 조용히 예전 동작(항상
 * 자동재생)을 유지할 수 있어 일부러 기본값을 두지 않았다.
 */
export function buildEmbedUrl(videoId: string, options: { autoplay: boolean }): string {
  const params = new URLSearchParams({
    autoplay: options.autoplay ? '1' : '0',
    mute: '1',
    loop: '1',
    playlist: videoId,
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
  })
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}
