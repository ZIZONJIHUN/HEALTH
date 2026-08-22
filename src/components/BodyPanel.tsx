import BodyModelPicker from '@/components/BodyModelPicker'

/**
 * 3D 인체도 패널. 출처 표기가 여기 붙어 있는 이유는 라이선스 때문이다 —
 * 모델 원본은 BodyParts3D 이고 CC BY-SA 2.1 JP 라 표기 의무가 있다.
 * 모델을 쓰는 곳과 표기를 같은 컴포넌트에 묶어 둬야 나중에 떨어지지 않는다.
 */
export default function BodyPanel({ activeQuery = '' }: { activeQuery?: string }) {
  return (
    <section
      aria-labelledby="body-panel-heading"
      className="rounded-2xl border border-border bg-surface/60 p-4 lg:sticky lg:top-24"
    >
      <h2
        id="body-panel-heading"
        className="text-xs font-semibold tracking-wide text-muted uppercase"
      >
        부위로 찾기
      </h2>

      <BodyModelPicker activeQuery={activeQuery} />

      <p className="mt-3 border-t border-border pt-3 text-[10px] leading-relaxed text-dim">
        해부 모델:{' '}
        <a
          href="https://lifesciencedb.jp/bp3d/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-border underline-offset-2 hover:text-muted"
        >
          BodyParts3D
        </a>
        , © The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1
        Japan.
      </p>
    </section>
  )
}
