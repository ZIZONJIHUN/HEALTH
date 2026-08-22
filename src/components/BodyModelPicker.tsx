'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BODY_PARTS } from '@/data/categories'

/**
 * 3D 해부 모델로 운동 부위를 고른다.
 *
 * 모델은 scripts/build-body-model.mjs 가 굽는다. GLB 의 노드 이름이 곧 BODY_PARTS.id 라
 * 여기서 이름 매핑 테이블을 따로 들지 않는다.
 *
 * 접근성: 캔버스는 키보드로 쓸 수 없다. 같은 일을 하는 CategoryChips 를 항상 함께
 * 렌더하고, 이 컴포넌트는 보조 수단으로만 둔다. WebGL 이 없거나 로딩에 실패하면
 * 조용히 사라지고 칩만 남는다 — 부위 선택이 불가능해지는 상황은 만들지 않는다.
 */

const MODEL_URL = '/models/body.glb'
const SHELL_NODE = 'shell'

/** 부위 id → 검색어. '전신'은 모델에 대응하는 근육이 없어 빠진다. */
const PART_BY_ID = new Map(BODY_PARTS.map((part) => [part.id as string, part]))

const COLOR = {
  muscle: 0x59647a,
  hover: 0x9ec24a,
  selected: 0xc2e85b,
  shell: 0x1b2330,
}

type Status = 'loading' | 'ready' | 'failed'

export default function BodyModelPicker({ activeQuery = '' }: { activeQuery?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const router = useRouter()
  // three 쪽 이벤트 핸들러는 마운트 시점의 클로저 안에 갇힌다. 최신 값은 ref 로 건넨다.
  const routerRef = useRef(router)
  const activeQueryRef = useRef(activeQuery)
  const hoveredIdRef = useRef<string | null>(null)
  const applyHighlightRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    routerRef.current = router
    activeQueryRef.current = activeQuery
    hoveredIdRef.current = hoveredId
    applyHighlightRef.current?.()
  }, [router, activeQuery, hoveredId])

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
      // 모델은 키 = 1 단위로 구워져 있다. fov 28° 에서 2.45 면 세로를 8할쯤 채운다.
      camera.position.set(0, 0, 2.45)

      scene.add(new THREE.AmbientLight(0xffffff, 0.55))
      const key = new THREE.DirectionalLight(0xffffff, 2.1)
      key.position.set(1.5, 2, 3)
      scene.add(key)
      // 라임 림라이트가 실루엣을 잡아준다. 액센트는 이 하나로 고정한다.
      const rim = new THREE.DirectionalLight(0xc2e85b, 1.7)
      rim.position.set(-2.5, 0.8, -2)
      scene.add(rim)

      const pivot = new THREE.Group()
      scene.add(pivot)

      const materialByPart = new Map<string, import('three').MeshStandardMaterial>()
      const partByObject = new Map<import('three').Object3D, string>()
      const pickable: import('three').Object3D[] = []

      function applyHighlight() {
        for (const [id, material] of materialByPart) {
          const part = PART_BY_ID.get(id)
          const selected = part != null && part.query === activeQueryRef.current
          const hovered = id === hoveredIdRef.current
          material.color.setHex(
            selected ? COLOR.selected : hovered ? COLOR.hover : COLOR.muscle,
          )
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

        if (!isShell) materialByPart.set(node.name, material)

        node.traverse((object) => {
          const mesh = object as import('three').Mesh
          if (!mesh.isMesh) return
          // GLB 에 법선을 굽지 않았다. 감산 후 계산해야 매끄럽게 나온다.
          mesh.geometry.computeVertexNormals()
          mesh.material = material
          if (!isShell) {
            partByObject.set(mesh, node.name)
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
      let dragging = false
      let dragMoved = 0
      let lastX = 0

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      function pick(event: PointerEvent) {
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(pickable, false)[0]
        return hit ? (partByObject.get(hit.object) ?? null) : null
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
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      }

      function onPointerDown(event: PointerEvent) {
        dragging = true
        dragMoved = 0
        lastX = event.clientX
        renderer.domElement.setPointerCapture(event.pointerId)
        renderer.domElement.style.cursor = 'grabbing'
      }

      function onPointerUp(event: PointerEvent) {
        dragging = false
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId)
        }
        // 돌리려고 끈 것과 고르려고 누른 것을 구분한다.
        if (dragMoved < 6) {
          const id = pick(event)
          const part = id ? PART_BY_ID.get(id) : null
          if (part) routerRef.current.push(`/?q=${encodeURIComponent(part.query)}`)
        }
        renderer.domElement.style.cursor = 'grab'
      }

      function onPointerLeave() {
        dragging = false
        setHoveredId(null)
      }

      const element = renderer.domElement
      element.style.cursor = 'grab'
      element.style.touchAction = 'pan-y' // 세로 스크롤은 페이지에 양보한다
      element.addEventListener('pointermove', onPointerMove)
      element.addEventListener('pointerdown', onPointerDown)
      element.addEventListener('pointerup', onPointerUp)
      element.addEventListener('pointerleave', onPointerLeave)

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
        pivot.rotation.y = currentRotation
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
        scene.traverse((object) => {
          const mesh = object as import('three').Mesh
          if (mesh.isMesh) mesh.geometry.dispose()
        })
        for (const material of materialByPart.values()) material.dispose()
        renderer.dispose()
        element.remove()
        applyHighlightRef.current = null
      }
    }

    /*
      three 와 모델을 합치면 700KB 가까이 된다. 데스크톱에서는 왼쪽 레일이 처음부터
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

  const hoveredLabel = hoveredId ? PART_BY_ID.get(hoveredId)?.label : null

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

      <figcaption className="mt-1 flex min-h-6 items-center justify-center gap-2 text-xs">
        {hoveredLabel ? (
          <span className="font-semibold text-accent">{hoveredLabel}</span>
        ) : (
          <span className="text-dim">드래그해서 돌리고, 부위를 눌러 보세요</span>
        )}
      </figcaption>
    </figure>
  )
}
