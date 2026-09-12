'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ICON_WEIGHT, MagnifyingGlass } from '@/components/ui/icons'
import { MUSCLE_GROUPS, matchQuery, type MuscleGroup } from '@/features/body/categories'

/**
 * 3D 해부 모델로 운동 부위를 고른다.
 *
 * 모델은 scripts/build-body-model.mjs 가 굽는다. GLB 의 노드 이름이 곧
 * MUSCLE_GROUPS.id 라 여기서 이름 매핑 테이블을 따로 들지 않는다.
 * 둘이 어긋나면 tests/unit/bodyModel.test.ts 가 잡는다.
 *
 * 접근성: 캔버스는 키보드로 쓸 수 없다. 같은 일을 하는 CategoryChips 를 항상 함께
 * 렌더하고, 이 컴포넌트는 보조 수단으로만 둔다. WebGL 이 없거나 로딩에 실패하면
 * 조용히 사라지고 칩만 남는다 — 부위 선택이 불가능해지는 상황은 만들지 않는다.
 */

const MODEL_URL = '/models/body.glb'
const SHELL_NODE = 'shell'

const GROUP_BY_ID = new Map<string, MuscleGroup>(
  MUSCLE_GROUPS.map((group) => [group.id as string, group]),
)

/**
 * 근육 기본색은 해부 표본의 근조직 톤이다. 차가운 회색으로 두면 시체처럼 보인다.
 * 채도를 26%까지 낮춰서 라임 액센트를 덮지 않게 했다.
 */
const COLOR = {
  muscle: 0x96585e,
  hover: 0x9ec24a,
  selected: 0xc2e85b,
  shell: 0x1b2330,
}

/** 모델은 키 = 1 단위로 구워져 있다. fov 28° 에서 2.45 면 세로를 8할쯤 채운다. */
const DEFAULT_DISTANCE = 2.45
const MIN_DISTANCE = 1.3
const MAX_DISTANCE = 3.4
/** 이만큼 벗어나면 "확대됨"으로 보고 초기화 버튼을 띄운다. */
const ZOOM_EPSILON = 0.03

type Status = 'loading' | 'ready' | 'failed'

function clampDistance(value: number): number {
  return Math.min(Math.max(value, MIN_DISTANCE), MAX_DISTANCE)
}

export default function BodyModelPicker({ activeQuery = '' }: { activeQuery?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)

  const router = useRouter()
  // three 쪽 이벤트 핸들러는 마운트 시점의 클로저 안에 갇힌다. 최신 값은 ref 로 건넨다.
  const routerRef = useRef(router)
  const activeQueryRef = useRef(activeQuery)
  const hoveredIdRef = useRef<string | null>(null)
  const applyHighlightRef = useRef<(() => void) | null>(null)
  const resetZoomRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    routerRef.current = router
    activeQueryRef.current = activeQuery
    hoveredIdRef.current = hoveredId
    applyHighlightRef.current?.()
  }, [router, activeQuery, hoveredId])

  const resetZoom = useCallback(() => resetZoomRef.current?.(), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let cleanup = () => {}

    async function start() {
      // three 는 gzip 170KB 대다. 첫 화면 번들에 넣지 않고 여기서만 불러온다.
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      if (disposed || !container) return

      let renderer: import('three').WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      } catch {
        setStatus('failed')
        return
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      renderer.domElement.setAttribute('aria-hidden', 'true')
      container.append(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(
        28,
        container.clientWidth / container.clientHeight,
        0.01,
        50,
      )
      camera.position.set(0, 0, DEFAULT_DISTANCE)

      scene.add(new THREE.AmbientLight(0xffffff, 0.55))
      const key = new THREE.DirectionalLight(0xffffff, 2.1)
      key.position.set(1.5, 2, 3)
      scene.add(key)
      /*
        림라이트는 어두운 배경에서 실루엣을 떼어내는 역할만 한다.
        여기에 액센트(라임)를 쓰면 안 된다 — 빛을 받는 면이 선택된 부위와 똑같은 색이
        되어서, 아무것도 안 골랐는데 어깨 바깥과 옆구리가 켜져 보인다.
        라임은 오직 hover/선택 상태에만 쓴다.
      */
      const rim = new THREE.DirectionalLight(0x9fb6d4, 1.5)
      rim.position.set(-2.5, 0.8, -2)
      scene.add(rim)

      const pivot = new THREE.Group()
      scene.add(pivot)

      const materialByGroup = new Map<string, import('three').MeshStandardMaterial>()
      const groupByObject = new Map<import('three').Object3D, string>()
      const pickable: import('three').Object3D[] = []

      function applyHighlight() {
        const match = matchQuery(activeQueryRef.current)
        for (const [id, material] of materialByGroup) {
          // 상위 부위로 검색했으면 그 밑 세부를 전부 켠다. '하체 운동' 이면 다리 전체다.
          const selected =
            match.kind === 'group'
              ? match.group.id === id
              : match.kind === 'part'
                ? GROUP_BY_ID.get(id)?.parent === match.part.id
                : false
          const hovered = id === hoveredIdRef.current
          material.color.setHex(selected ? COLOR.selected : hovered ? COLOR.hover : COLOR.muscle)
          material.emissive.setHex(selected ? COLOR.selected : 0x000000)
          material.emissiveIntensity = selected ? 0.22 : 0
        }
      }
      applyHighlightRef.current = applyHighlight

      const gltf = await new GLTFLoader().loadAsync(MODEL_URL).catch(() => null)
      if (disposed) {
        renderer.dispose()
        return
      }
      if (!gltf) {
        setStatus('failed')
        renderer.dispose()
        return
      }

      for (const node of [...gltf.scene.children]) {
        const isShell = node.name === SHELL_NODE
        const material = isShell
          ? new THREE.MeshStandardMaterial({
              color: COLOR.shell,
              roughness: 0.95,
              transparent: true,
              opacity: 0.11,
              depthWrite: false,
              // 안쪽 면만 그려야 근육이 피부에 가리지 않고 실루엣만 남는다.
              side: THREE.BackSide,
            })
          : new THREE.MeshStandardMaterial({
              color: COLOR.muscle,
              roughness: 0.72,
              metalness: 0.04,
            })

        if (!isShell) materialByGroup.set(node.name, material)

        node.traverse((object) => {
          const mesh = object as import('three').Mesh
          if (!mesh.isMesh) return
          // GLB 에 법선을 굽지 않았다. 감산 후 계산해야 매끄럽게 나온다.
          mesh.geometry.computeVertexNormals()
          mesh.material = material
          if (!isShell) {
            groupByObject.set(mesh, node.name)
            pickable.push(mesh)
          }
        })
      }
      pivot.add(gltf.scene)
      applyHighlight()
      setStatus('ready')

      // ── 입력 ────────────────────────────────────────────────────────────
      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      let targetRotation = 0
      let currentRotation = 0
      let targetDistance = DEFAULT_DISTANCE
      let currentDistance = DEFAULT_DISTANCE
      let dragging = false
      let dragMoved = 0
      let lastX = 0
      let pinchStartGap = 0
      let pinchStartDistance = DEFAULT_DISTANCE

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const element = renderer.domElement

      function setDistance(next: number) {
        targetDistance = clampDistance(next)
        setZoomed(Math.abs(targetDistance - DEFAULT_DISTANCE) > ZOOM_EPSILON)
      }

      resetZoomRef.current = () => setDistance(DEFAULT_DISTANCE)

      function pick(event: PointerEvent) {
        const rect = element.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        const hit = raycaster.intersectObjects(pickable, false)[0]
        return hit ? (groupByObject.get(hit.object) ?? null) : null
      }

      function onPointerMove(event: PointerEvent) {
        if (dragging) {
          const delta = event.clientX - lastX
          lastX = event.clientX
          dragMoved += Math.abs(delta)
          targetRotation += delta * 0.008
          return
        }
        const id = pick(event)
        setHoveredId(id)
        element.style.cursor = id ? 'pointer' : 'grab'
      }

      function onPointerDown(event: PointerEvent) {
        dragging = true
        dragMoved = 0
        lastX = event.clientX
        element.setPointerCapture(event.pointerId)
        element.style.cursor = 'grabbing'
      }

      function onPointerUp(event: PointerEvent) {
        dragging = false
        if (element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId)
        }
        // 돌리려고 끈 것과 고르려고 누른 것을 구분한다.
        if (dragMoved < 6) {
          const id = pick(event)
          const group = id ? GROUP_BY_ID.get(id) : null
          if (group) routerRef.current.push(`/?q=${encodeURIComponent(group.query)}`)
        }
        element.style.cursor = 'grab'
      }

      function onPointerLeave() {
        dragging = false
        setHoveredId(null)
      }

      /**
       * 휠 확대. passive: false 로 붙여서 preventDefault 가 먹게 한다.
       * 안 막으면 확대하려다 페이지가 스크롤된다.
       */
      function onWheel(event: WheelEvent) {
        event.preventDefault()
        // deltaMode 0=픽셀, 1=줄, 2=페이지. 줄 단위는 대략 16px 로 환산한다.
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
        setDistance(targetDistance + event.deltaY * scale * 0.0016)
      }

      function gapBetween(touches: TouchList) {
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        return Math.hypot(dx, dy)
      }

      function onTouchStart(event: TouchEvent) {
        if (event.touches.length !== 2) return
        // 두 손가락 동안에는 브라우저에 스크롤을 맡기지 않는다. 끝나면 되돌린다.
        element.style.touchAction = 'none'
        dragging = false
        pinchStartGap = gapBetween(event.touches)
        pinchStartDistance = targetDistance
      }

      function onTouchMove(event: TouchEvent) {
        if (event.touches.length !== 2 || pinchStartGap === 0) return
        event.preventDefault()
        const ratio = gapBetween(event.touches) / pinchStartGap
        // 손가락을 벌리면(ratio > 1) 가까이 간다 = 거리가 줄어든다.
        setDistance(pinchStartDistance / ratio)
      }

      function onTouchEnd(event: TouchEvent) {
        if (event.touches.length >= 2) return
        pinchStartGap = 0
        // 한 손가락 세로 드래그는 페이지 스크롤, 가로 드래그는 회전으로 되돌린다.
        element.style.touchAction = 'pan-y'
      }

      element.style.cursor = 'grab'
      element.style.touchAction = 'pan-y'
      element.addEventListener('pointermove', onPointerMove)
      element.addEventListener('pointerdown', onPointerDown)
      element.addEventListener('pointerup', onPointerUp)
      element.addEventListener('pointerleave', onPointerLeave)
      element.addEventListener('wheel', onWheel, { passive: false })
      element.addEventListener('touchstart', onTouchStart, { passive: false })
      element.addEventListener('touchmove', onTouchMove, { passive: false })
      element.addEventListener('touchend', onTouchEnd)
      element.addEventListener('touchcancel', onTouchEnd)

      const resizeObserver = new ResizeObserver(() => {
        if (!container.clientWidth || !container.clientHeight) return
        camera.aspect = container.clientWidth / container.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(container.clientWidth, container.clientHeight, false)
      })
      resizeObserver.observe(container)

      let frame = 0
      function tick() {
        frame = requestAnimationFrame(tick)
        // 가만히 두면 아주 천천히 돈다. 3D 라는 걸 알려주는 최소한의 신호다.
        if (!dragging && !reduceMotion) targetRotation += 0.0016
        currentRotation += (targetRotation - currentRotation) * 0.12
        currentDistance += (targetDistance - currentDistance) * 0.15
        pivot.rotation.y = currentRotation
        camera.position.z = currentDistance
        renderer.render(scene, camera)
      }
      tick()

      cleanup = () => {
        cancelAnimationFrame(frame)
        resizeObserver.disconnect()
        element.removeEventListener('pointermove', onPointerMove)
        element.removeEventListener('pointerdown', onPointerDown)
        element.removeEventListener('pointerup', onPointerUp)
        element.removeEventListener('pointerleave', onPointerLeave)
        element.removeEventListener('wheel', onWheel)
        element.removeEventListener('touchstart', onTouchStart)
        element.removeEventListener('touchmove', onTouchMove)
        element.removeEventListener('touchend', onTouchEnd)
        element.removeEventListener('touchcancel', onTouchEnd)
        scene.traverse((object) => {
          const mesh = object as import('three').Mesh
          if (mesh.isMesh) mesh.geometry.dispose()
        })
        for (const material of materialByGroup.values()) material.dispose()
        renderer.dispose()
        element.remove()
        applyHighlightRef.current = null
        resetZoomRef.current = null
      }
    }

    /*
      three 와 모델을 합치면 900KB 가까이 된다. 데스크톱에서는 왼쪽 레일이 처음부터
      보이므로 바로 받지만, 모바일에서는 접힌 화면 아래에 있다. 화면에 들어올 때까지
      기다렸다가 받는다.
    */
    const visibility = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        visibility.disconnect()
        start().catch(() => setStatus('failed'))
      },
      { rootMargin: '300px' },
    )
    visibility.observe(container)

    return () => {
      disposed = true
      visibility.disconnect()
      cleanup()
    }
    // 마운트당 한 번만 초기화한다. 값 변화는 ref 로 흘려보낸다.
  }, [])

  if (status === 'failed') return null

  const selection = matchQuery(activeQuery)
  const selectedLabel =
    selection.kind === 'group'
      ? selection.group.label
      : selection.kind === 'part'
        ? selection.part.label
        : null
  const hoveredLabel = hoveredId ? GROUP_BY_ID.get(hoveredId)?.label : null

  return (
    <figure className="relative m-0">
      <div
        ref={containerRef}
        className="h-[320px] w-full sm:h-[380px] lg:h-[440px] xl:h-[500px]"
        // 캔버스는 스크린리더에 의미가 없다. 같은 기능은 아래 부위 버튼이 제공한다.
        aria-hidden
      />

      {status === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="skeleton h-3/5 w-1/4 rounded-full" />
        </div>
      ) : null}

      {/* 확대하고 길을 잃으면 돌아올 길이 없다. 확대했을 때만 띄운다. */}
      {zoomed ? (
        <button
          type="button"
          onClick={resetZoom}
          className="absolute top-2 right-2 flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 text-[11px] font-medium text-muted backdrop-blur-sm hover:border-accent-dim hover:text-text"
        >
          <MagnifyingGlass size={12} weight={ICON_WEIGHT} aria-hidden />
          크기 초기화
        </button>
      ) : null}

      {/*
        라임으로 켜진 부위가 왜 켜져 있는지 여기서만 알 수 있다.
        이 줄이 없으면 "마우스를 대지도 않았는데 형광색"으로 보이고, 끌 방법도 없다.
      */}
      <figcaption className="mt-1 flex min-h-6 flex-wrap items-center justify-center gap-x-2 text-xs">
        {hoveredLabel ? (
          <span className="font-semibold text-accent">{hoveredLabel}</span>
        ) : selectedLabel ? (
          <>
            <span className="text-muted">
              <span className="font-semibold text-accent">{selectedLabel}</span> 보는 중
            </span>
            <Link
              href="/"
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-dim hover:border-border-strong hover:text-text"
            >
              전체 보기
            </Link>
          </>
        ) : (
          <span className="text-dim">드래그해서 돌리고, 휠로 확대하고, 부위를 눌러 보세요</span>
        )}
      </figcaption>
    </figure>
  )
}
