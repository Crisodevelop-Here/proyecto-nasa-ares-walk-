// Official NASA 3D models (NASA 3D Resources, github.com/nasa/NASA-3D-Resources: "free and without
// copyright"): the Mars 2020 Perseverance rover (NASA/JPL-Caltech) and the EVA astronaut.
// Both are Draco-compressed GLB files in public/models, decoded with the Draco files in public/draco.
//
// The astronaut model is a single static mesh in a T-pose with no skeleton. To make it walk, it is cut
// once into rigid parts (thighs, shins, arms, forearms) at the hips, knees, shoulders and elbows, the arms
// are lowered to the sides, and each part hangs from a pivot group that the gait animation turns.
import { useGLTF } from '@react-three/drei'
import { Component, useEffect, useMemo, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { AstroParts } from './vehicles'

export const ROVER_URL = '/models/perseverance.glb'
export const ASTRONAUT_URL = '/models/astronaut.glb'
const DRACO = '/draco/'

/** Shows `fallback` if a model fails to load (offline, missing file, no WebGL extension…). */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * The rover's ~260 parts merged into one mesh per material (~45 draw calls instead of ~500), since it
 * travels as one rigid body. The small skinned mast cable is left out (it needs its skeleton).
 */
function mergeByMaterial(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true)
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const src = mesh.geometry
    const parts = Array.isArray(mesh.material) && src.groups.length ? src.groups : [{ start: 0, count: Infinity, materialIndex: 0 }]
    for (const grp of parts) {
      const mat = mats[grp.materialIndex ?? 0]
      let g = src.index ? src.toNonIndexed() : src.clone()
      if (Array.isArray(mesh.material) && src.groups.length) {
        // Keep only this group's triangles (toNonIndexed keeps the draw order, so start/count still apply).
        const sub = new THREE.BufferGeometry()
        for (const [name, a] of Object.entries(g.attributes)) {
          const attr = a as THREE.BufferAttribute
          const end = Math.min(attr.count, grp.start + grp.count)
          sub.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(grp.start * attr.itemSize, end * attr.itemSize), attr.itemSize, attr.normalized))
        }
        g = sub
      }
      g.applyMatrix4(mesh.matrixWorld)
      // Same attribute set everywhere so the pieces merge.
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
      if (!g.attributes.normal) g.computeVertexNormals()
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      g.morphAttributes = {}
      const list = groups.get(mat) ?? []
      list.push(g)
      groups.set(mat, list)
    }
  })
  const root = new THREE.Group()
  for (const [mat, list] of groups) {
    const merged = mergeGeometries(list, false)
    list.forEach((g) => g.dispose())
    if (merged) root.add(new THREE.Mesh(merged, mat))
  }
  return root
}

/** Perseverance at the same scale as the procedural rover: 1/3 of its size in metres, wheels on y = 0, centred. */
export function NasaRover() {
  const { scene } = useGLTF(ROVER_URL, DRACO)
  const model = useMemo(() => {
    const root = mergeByMaterial(scene)
    const box = new THREE.Box3().setFromObject(root)
    const c = box.getCenter(new THREE.Vector3())
    root.position.set(-c.x, -box.min.y, -c.z)
    return root
  }, [scene])
  useEffect(() => () => model.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose()), [model])
  return (
    <group scale={1 / 3}>
      <primitive object={model} />
    </group>
  )
}

// ---------- astronaut: cut the static mesh into posable parts ----------

/** Joint positions as fractions of the height (measured on the NASA mesh; front is +z, feet at 0). */
const J = {
  hipY: 0.43,
  hipX: 0.075,
  kneeY: 0.215,
  /** Shoulder joint (the arm turns about it). */
  shoulderX: 0.17,
  shoulderY: 0.715,
  /** The shoulder bends gradually between these |x| (like a skinned joint), so no flap is left behind. */
  bendIn: 0.12,
  bendOut: 0.22,
  /** Beyond this |x| the arm is a rigid part that swings while walking. */
  armX: 0.22,
  armYmin: 0.58,
  armYmax: 0.88,
  elbowX: 0.33,
  /** How far the T-pose arms are lowered (rad): a bit short of vertical, the suit holds them out. */
  lower: 1.32,
}

type PartId = 'torso' | 'thighL' | 'thighR' | 'shinL' | 'shinR' | 'armL' | 'armR' | 'foreL' | 'foreR'

/** In the arm/shoulder region of the T-pose? (z > −0.11 keeps the sides of the backpack with the torso.) */
const inArmBand = (y: number, z: number) => y > J.armYmin && y < J.armYmax && z > -0.11

/** Part of a triangle from its centroid and its innermost |x| (T-pose coordinates). */
function partOf(x: number, y: number, z: number, inner: number): PartId {
  const side = x < 0 ? 'L' : 'R'
  if (inArmBand(y, z) && inner > J.armX - 0.02 && Math.abs(x) > J.armX) return Math.abs(x) > J.elbowX ? `fore${side}` : `arm${side}`
  // Below the hips, except the bottom of the backpack (behind the body).
  if (y < J.hipY && z > -0.06) return y < J.kneeY ? `shin${side}` : `thigh${side}`
  return 'torso'
}

/** Where each part hangs from, in the normalized (height = 1) T-pose frame. */
function pivotOf(id: PartId): THREE.Vector3 {
  const s = id.endsWith('L') ? -1 : 1
  if (id.startsWith('thigh')) return new THREE.Vector3(s * J.hipX, J.hipY, 0)
  if (id.startsWith('shin')) return new THREE.Vector3(s * J.hipX, J.kneeY, 0)
  if (id.startsWith('arm')) return new THREE.Vector3(s * J.shoulderX, J.shoulderY, 0)
  if (id.startsWith('fore')) return new THREE.Vector3(s * J.elbowX, J.shoulderY, 0)
  return new THREE.Vector3()
}

interface Cut {
  /** Geometry of each part, relative to its own pivot, arms already lowered. */
  geo: Record<PartId, THREE.BufferGeometry[]>
  mat: THREE.Material[]
  /** Pivot offsets from the parent: hip and shoulder from the body, knee from the hip, elbow from the shoulder. */
  at: Record<'hipL' | 'hipR' | 'kneeL' | 'kneeR' | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR', THREE.Vector3>
}

function cutAstronaut(scene: THREE.Object3D): Cut {
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const H = box.max.y - box.min.y
  const c = box.getCenter(new THREE.Vector3())
  // World → normalized: feet at 0, centred, height 1.
  const norm = new THREE.Matrix4().makeScale(1 / H, 1 / H, 1 / H).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z))
  const ids: PartId[] = ['torso', 'thighL', 'thighR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR']
  const geo = Object.fromEntries(ids.map((id) => [id, [] as THREE.BufferGeometry[]])) as Cut['geo']
  const mat: THREE.Material[] = []
  // Lowering the arms: rotate about the shoulder (left arm +, right arm −, around z).
  const lowerL = new THREE.Matrix4().makeRotationZ(J.lower)
  const lowerR = new THREE.Matrix4().makeRotationZ(-J.lower)
  const v = new THREE.Vector3()

  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    src.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, mesh.matrixWorld))
    const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const mi = mat.push(m) - 1
    const pos = src.attributes.position
    const orig = (pos.array as Float32Array).slice()
    // Triangles of each part (by centroid, in the T-pose), so every triangle moves with exactly one part.
    const tris = Object.fromEntries(ids.map((id) => [id, [] as number[]])) as Record<PartId, number[]>
    for (let t = 0; t < pos.count; t += 3) {
      const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3
      const y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3
      const z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
      const inner = Math.min(Math.abs(pos.getX(t)), Math.abs(pos.getX(t + 1)), Math.abs(pos.getX(t + 2)))
      tris[partOf(x, y, z, inner)].push(t)
    }
    // Lower the arms: each vertex turns about its shoulder by an amount that grows from 0 (torso) to the
    // full angle (arm) across the shoulder, like a skinned joint.
    const nrm = src.attributes.normal
    const rot = new THREE.Matrix4()
    for (let i = 0; i < pos.count; i++) {
      const x = orig[i * 3]
      const y = orig[i * 3 + 1]
      const z = orig[i * 3 + 2]
      if (!inArmBand(y, z) || Math.abs(x) <= J.bendIn) continue
      const w = THREE.MathUtils.smoothstep(Math.abs(x), J.bendIn, J.bendOut)
      const left = x < 0
      rot.makeRotationZ((left ? 1 : -1) * J.lower * w)
      const sh = pivotOf(left ? 'armL' : 'armR')
      v.set(x, y, z).sub(sh).applyMatrix4(rot).add(sh)
      pos.setXYZ(i, v.x, v.y, v.z)
      if (nrm) {
        v.fromBufferAttribute(nrm, i).applyMatrix4(rot)
        nrm.setXYZ(i, v.x, v.y, v.z)
      }
    }
    for (const id of ids) {
      const list = tris[id]
      if (!list.length) continue
      const g = new THREE.BufferGeometry()
      for (const [name, attr] of Object.entries(src.attributes)) {
        const a = attr as THREE.BufferAttribute
        const arr = new (a.array.constructor as Float32ArrayConstructor)(list.length * 3 * a.itemSize)
        list.forEach((t, k) => {
          for (let j = 0; j < 3; j++) for (let e = 0; e < a.itemSize; e++) arr[(k * 3 + j) * a.itemSize + e] = a.getComponent(t + j, e)
        })
        g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized))
      }
      // Express each part relative to its pivot (the arms are already lowered).
      const left = id.endsWith('L')
      const shoulder = pivotOf(left ? 'armL' : 'armR')
      const pivot = pivotOf(id)
      // Pivot of a forearm moves with the lowered arm.
      const p = id.startsWith('fore')
        ? pivot
            .clone()
            .sub(shoulder)
            .applyMatrix4(left ? lowerL : lowerR)
            .add(shoulder)
        : pivot
      g.translate(-p.x, -p.y, -p.z)
      g.computeBoundingSphere()
      g.userData.mat = mi
      geo[id].push(g)
    }
  })

  const elbow = (left: boolean) =>
    pivotOf(left ? 'foreL' : 'foreR')
      .clone()
      .sub(pivotOf(left ? 'armL' : 'armR'))
      .applyMatrix4(left ? lowerL : lowerR)
  return {
    geo,
    mat,
    at: {
      hipL: pivotOf('thighL'),
      hipR: pivotOf('thighR'),
      kneeL: new THREE.Vector3(0, J.kneeY - J.hipY, 0),
      kneeR: new THREE.Vector3(0, J.kneeY - J.hipY, 0),
      shoulderL: pivotOf('armL'),
      shoulderR: pivotOf('armR'),
      elbowL: elbow(true),
      elbowR: elbow(false),
    },
  }
}

function Parts({ list, mat }: { list: THREE.BufferGeometry[]; mat: THREE.Material[] }) {
  return list.map((g, i) => <mesh key={i} geometry={g} material={mat[g.userData.mat as number]} />)
}

/** The NASA astronaut, cut into parts; same moving parts (refs) as the procedural one. 1 unit = height. */
export function NasaAstronaut({ body, legL, legR, kneeL, kneeR, armL, armR }: AstroParts) {
  const { scene } = useGLTF(ASTRONAUT_URL, DRACO)
  const cut = useMemo(() => cutAstronaut(scene.clone(true)), [scene])
  const { geo, mat, at } = cut
  const leg = (hip: RefObject<THREE.Group | null>, knee: RefObject<THREE.Group | null>, s: 'L' | 'R') => (
    <group ref={hip} position={at[`hip${s}`]}>
      <Parts list={geo[`thigh${s}`]} mat={mat} />
      <group ref={knee} position={at[`knee${s}`]}>
        <Parts list={geo[`shin${s}`]} mat={mat} />
      </group>
    </group>
  )
  const arm = (shoulder: RefObject<THREE.Group | null>, s: 'L' | 'R') => (
    <group ref={shoulder} position={at[`shoulder${s}`]}>
      <Parts list={geo[`arm${s}`]} mat={mat} />
      {/* Elbow slightly bent forward, as the pressurized suit holds it. */}
      <group position={at[`elbow${s}`]} rotation={[-0.35, 0, 0]}>
        <Parts list={geo[`fore${s}`]} mat={mat} />
      </group>
    </group>
  )
  return (
    <group ref={body}>
      <Parts list={geo.torso} mat={mat} />
      {leg(legL, kneeL, 'L')}
      {leg(legR, kneeR, 'R')}
      {arm(armL, 'L')}
      {arm(armR, 'R')}
    </group>
  )
}
