/**
 * 웹 내부 재생용 임베드 URL을 만든다.
 * mute=1 은 선택이 아니다. 모바일 브라우저는 음소거 자동재생만 허용한다.
 * loop=1 은 단일 영상일 때 playlist 에 같은 ID를 넣어야 동작한다.
 */
export function buildEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: videoId,
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
  })
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}
