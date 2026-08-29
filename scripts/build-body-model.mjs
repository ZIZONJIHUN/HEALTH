/**
 * 부위 선택용 3D 인체 근육 모델(public/models/body.glb)을 만든다.
 *
 * 원본: BodyParts3D, (c) The Database Center for Life Science
 *       licensed under CC Attribution-Share Alike 2.1 Japan
 *       https://lifesciencedb.jp/bp3d/
 *       (여기서는 Kevin-Mattheus-Moerman/BodyParts3D 의 STL 클론을 받는다)
 *
 * 원본은 의료용 고폴리라 근육 59개 합계가 293MB다. 그대로는 웹에서 못 쓰므로
 * 부위별로 묶어 감산하고 좌표계를 바꿔 단일 GLB 로 굽는다.
 *
 * 실행: node --max-old-space-size=8192 scripts/build-body-model.mjs
 * 캐시: .cache/bodyparts3d/*.stl (gitignore 대상, 재실행 시 재사용)
 * 결과: public/models/body.glb
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, quantize, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'

const STL_BASE =
  'https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data/stl'
const CACHE_DIR = path.join('.cache', 'bodyparts3d')
const OUT_PATH = path.join('public', 'models', 'body.glb')
const DOWNLOAD_CONCURRENCY = 6

/**
 * 노드 이름이 곧 앱의 부위 id 다 (src/data/categories.ts 의 BODY_PARTS.id).
 * '전신'은 부위가 아니라 "전체 선택" 상태라 여기에 없다.
 */
const GROUPS = [
  {
    id: 'chest',
    parts: ['FMA34690', 'FMA34691', 'FMA79979', 'FMA79980', 'FMA45874', 'FMA45875'],
  },
  {
    id: 'back',
    parts: [
      'FMA13358', 'FMA13359', // 광배근
      'FMA33581', 'FMA33583', 'FMA33584', 'FMA33585', 'FMA33586', 'FMA33587', // 승모근
      'FMA32547', 'FMA32548', // 극하근
      'FMA32551', 'FMA32552', // 대원근
    ],
  },
  {
    id: 'shoulder',
    parts: ['FMA34680', 'FMA34681', 'FMA34682', 'FMA34683', 'FMA34684', 'FMA34685'],
  },
  {
    id: 'arms',
    parts: [
      'FMA37684', 'FMA37685', 'FMA37686', 'FMA37687', // 이두
      'FMA37695', 'FMA37696', 'FMA37697', 'FMA37698', 'FMA37699', 'FMA37700', // 삼두
      'FMA37705', 'FMA37706', // 주근
      // 전완근. 없으면 팔뚝이 피부만 남아 회색으로 비고 클릭도 안 된다.
      'FMA38486', 'FMA38487', // 상완요골근
      'FMA38560', 'FMA38561', // 원회내근
      'FMA38460', 'FMA38461', // 요측수근굴근
      'FMA38617', 'FMA38618', // 척측수근굴근
      'FMA38638', 'FMA38639', // 천지굴근
      'FMA38495', 'FMA38496', 'FMA38498', 'FMA38499', // 장·단요측수근신근
      'BP44', 'BP45', // 척측수근신근
      // 총지신근(FMA38501/38502)은 뺐다. 손등을 지나 손가락까지 힘줄이 뻗어 있어서
      // 실이 늘어진 것처럼 보인다. 팔뚝 표면은 위 근육들로 이미 덮인다.
    ],
  },
  {
    id: 'core',
    parts: [
      'FMA13377', 'FMA13378', // 복직근
      'FMA13336', 'FMA13337', // 외복사근
      'FMA13398', 'FMA13399', // 전거근
    ],
  },
  {
    id: 'legs',
    parts: [
      'FMA38928', 'FMA38929', 'FMA38930', 'FMA38931', // 대퇴사두
      'FMA38932', 'FMA38933', 'FMA38934', 'FMA38935',
      'FMA45888', 'FMA45889', 'FMA45891', 'FMA45892', // 대퇴이두
      'FMA22358', 'FMA22359', 'FMA22448', 'FMA22449', // 반건양근·반막양근
      'FMA45957', 'FMA45958', 'FMA45960', 'FMA45961', // 비복근
      'FMA22328', 'FMA22329', 'FMA22330', 'FMA22331', // 대둔근·중둔근
      // 허벅지 안쪽. 없으면 다리 사이가 피부만 남아 비어 보인다.
      'FMA22459', 'FMA22460', // 대내전근
      'FMA22456', 'FMA22457', // 장내전근
      'FMA22452', 'FMA22454', // 단내전근
      'FMA43883', 'FMA43884', // 박근
      'FMA22450', 'FMA22451', // 치골근
      'FMA22354', 'FMA22355', // 봉공근
      'FMA22425', 'FMA22426', // 대퇴근막장근
      // 정강이·종아리 바깥
      'FMA22544', 'FMA22545', // 전경골근
      'FMA22558', 'FMA22559', // 가자미근
      'FMA22552', 'FMA22553', // 장비골근
      // 장지신근(FMA22548/22549)도 같은 이유로 뺐다 — 발가락까지 힘줄이 뻗는다.
    ],
  },
]

/** 근육만 떠 있으면 사람 형태로 안 읽힌다. 피부를 반투명 실루엣으로 깐다. */
const SHELL = { id: 'shell', parts: ['FMA7163'] }

/**
 * 부위별 삼각형 예산. 원본은 합계 수백만 삼각형이라 비율만으로는 통제가 안 된다.
 * 예산을 정해두고 부위 안에서 원본 밀도에 비례해 나눠 준다.
 *
 * 팔과 다리가 큰 이유는 근육 개수 때문이다. 전완근 10종, 내전근·정강이 14종이
 * 좌우로 들어가 예산을 잘게 나눠 갖는다. 근육 하나가 200 삼각형 밑으로 떨어지면
 * 형태가 무너지므로 개수에 맞춰 예산도 키운다.
 *
 * 합계 약 6.6만 삼각형 — 저가형 모바일에서도 60fps 가 나오는 수준.
 */
const TRIANGLE_BUDGET = {
  chest: 5000,
  back: 9000,
  shoulder: 5000,
  arms: 12000,
  core: 8000,
  legs: 18000,
  shell: 9000,
}

async function fetchStl(id) {
  const file = path.join(CACHE_DIR, `${id}.stl`)
  if (existsSync(file)) return readFileSync(file)

  const response = await fetch(`${STL_BASE}/${id}.stl`)
  if (!response.ok) throw new Error(`${id}.stl: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  writeFileSync(file, bytes)
  return bytes
}

/** 바이너리 STL: 헤더 80B + 삼각형 수 uint32 + 삼각형당 50B(법선 12 + 정점 36 + 속성 2) */
function parseBinaryStl(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const triangles = view.getUint32(80, true)
  const positions = new Float32Array(triangles * 9)

  let offset = 84
  for (let t = 0; t < triangles; t++) {
    offset += 12 // 법선은 버린다. 감산 후 three 가 다시 계산하는 편이 정확하다.
    for (let component = 0; component < 9; component++) {
      positions[t * 9 + component] = view.getFloat32(offset, true)
      offset += 4
    }
    offset += 2
  }
  return positions
}

/**
 * BodyParts3D 는 Z 축이 위(의학 좌표계)이고 단위가 mm 다.
 * glTF 관례(Y-up, 원점 중심)로 맞춰 정점에 직접 구워 넣는다.
 * 앱 쪽에서 회전·스케일 매직넘버를 들고 있지 않게 하려는 것이다.
 */
function toGlSpace(positions) {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]
    positions[i + 1] = positions[i + 2]
    positions[i + 2] = -y
  }
}

function measure(chunks) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const positions of chunks) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[i + axis]
        if (value < min[axis]) min[axis] = value
        if (value > max[axis]) max[axis] = value
      }
    }
  }
  return { min, max }
}

/**
 * 메시(=한 부위) 전체를 삼각형 예산에 맞춰 감산한다.
 * 부위 안에서는 원본 밀도에 비례해 예산을 나눠, 큰 근육이 더 많은 삼각형을 갖게 한다.
 */
function simplifyMeshToBudget(mesh, budget) {
  const primitives = mesh.listPrimitives()
  const counts = primitives.map((primitive) => primitive.getIndices().getCount() / 3)
  const total = counts.reduce((sum, count) => sum + count, 0)

  primitives.forEach((primitive, index) => {
    const indices = primitive.getIndices()
    const position = primitive.getAttribute('POSITION')
    // 근육 하나가 삼각형 200개 밑으로 내려가면 형태가 무너진다.
    const target = Math.max(200, Math.round((counts[index] / total) * budget))
    if (target >= counts[index]) return

    // meshoptimizer WASM 은 인덱스를 uint32 로 읽는다. weld() 는 정점이 65536개
    // 미만이면 Uint16Array 를 주므로, 그대로 넘기면 WASM 이 두 칸을 한 인덱스로
    // 잘못 읽어 결과가 통째로 망가진다.
    const [simplified] = MeshoptSimplifier.simplify(
      new Uint32Array(indices.getArray()),
      position.getArray(),
      3,
      target * 3,
      0.02, // 최대 오차 — 도달 못 해도 이 이상은 뭉개지 않는다
      ['LockBorder'],
    )

    // 감산으로 안 쓰이게 된 정점을 실제로 버려야 파일이 줄어든다.
    // compactMesh 는 넘긴 인덱스 배열을 제자리에서 새 번호로 바꿔 놓는다.
    // 반환된 remap 은 "정점 버퍼를 어떻게 다시 쓸지"에만 쓴다 — 인덱스에 또 적용하면 안 된다.
    const [remap, uniqueVertices] = MeshoptSimplifier.compactMesh(simplified)
    const source = position.getArray()
    const compacted = new Float32Array(uniqueVertices * 3)
    for (let vertex = 0; vertex < remap.length; vertex++) {
      const destination = remap[vertex]
      if (destination === 0xffffffff) continue
      compacted[destination * 3] = source[vertex * 3]
      compacted[destination * 3 + 1] = source[vertex * 3 + 1]
      compacted[destination * 3 + 2] = source[vertex * 3 + 2]
    }

    position.setArray(compacted)
    indices.setArray(new Uint32Array(simplified))
  })
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await worker(items[index], index)
      }
    }),
  )
  return results
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(path.dirname(OUT_PATH), { recursive: true })

  const all = [...GROUPS, SHELL]
  const ids = all.flatMap((group) => group.parts)
  console.log(`STL ${ids.length}개 준비 중...`)

  let downloadedBytes = 0
  const stlById = new Map()
  await mapWithConcurrency(ids, DOWNLOAD_CONCURRENCY, async (id) => {
    const bytes = await fetchStl(id)
    downloadedBytes += bytes.length
    stlById.set(id, parseBinaryStl(bytes))
  })
  console.log(`원본 ${(downloadedBytes / 1048576).toFixed(0)}MB 확보`)

  // 좌표계를 먼저 바꾸고, 전체 바운딩으로 중심·스케일을 한 번에 정한다.
  for (const positions of stlById.values()) toGlSpace(positions)

  const { min, max } = measure([...stlById.values()])
  const height = max[1] - min[1]
  const scale = 1 / height // 키 = 1 단위. 앱에서 카메라 거리를 잡기 쉽다.
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]

  for (const positions of stlById.values()) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (positions[i] - center[0]) * scale
      positions[i + 1] = (positions[i + 1] - center[1]) * scale
      positions[i + 2] = (positions[i + 2] - center[2]) * scale
    }
  }

  const document = new Document()
  document.createExtension(KHRMeshQuantization).setRequired(true)
  const buffer = document.createBuffer()
  const scene = document.createScene('body')

  // 재질은 앱에서 부위별로 갈아끼우므로 여기서는 자리만 잡아준다.
  const muscleMaterial = document.createMaterial('muscle')
  const shellMaterial = document.createMaterial('shell')

  for (const group of all) {
    const isShell = group.id === SHELL.id
    const mesh = document.createMesh(group.id)

    for (const id of group.parts) {
      const positions = stlById.get(id)
      const accessor = document
        .createAccessor(id)
        .setType('VEC3')
        .setArray(positions)
        .setBuffer(buffer)
      mesh.addPrimitive(
        document
          .createPrimitive()
          .setAttribute('POSITION', accessor)
          .setMaterial(isShell ? shellMaterial : muscleMaterial),
      )
    }

    scene.addChild(document.createNode(group.id).setMesh(mesh))
  }

  const io = new NodeIO().registerExtensions([KHRMeshQuantization])
  console.log(`GLB (감산 전): ${((await io.writeBinary(document)).byteLength / 1048576).toFixed(0)}MB`)

  await MeshoptSimplifier.ready
  await document.transform(weld({ tolerance: 0.0001 }), dedup())

  // gltf-transform 의 simplify() 는 씬이 아니라 문서의 모든 메시에 걸린다.
  // 부위마다 예산이 다르므로 프리미티브 단위로 직접 감산한다.
  for (const mesh of document.getRoot().listMeshes()) {
    simplifyMeshToBudget(mesh, TRIANGLE_BUDGET[mesh.getName()])
  }

  await document.transform(quantize({ quantizePosition: 14 }))

  const glb = Buffer.from(await io.writeBinary(document))
  writeFileSync(OUT_PATH, glb)

  console.log('---')
  for (const node of document.getRoot().listNodes()) {
    let triangles = 0
    for (const primitive of node.getMesh().listPrimitives()) {
      const indices = primitive.getIndices()
      triangles += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3
    }
    console.log(`${node.getName().padEnd(9)} ${Math.round(triangles).toLocaleString().padStart(8)} tris`)
  }
  console.log('---')
  console.log(`${OUT_PATH}: ${(glb.length / 1024).toFixed(0)}KB`)
}

await main()
