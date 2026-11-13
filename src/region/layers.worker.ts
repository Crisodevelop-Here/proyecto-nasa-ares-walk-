// Heavy per-region image work off the main thread, so the page doesn't freeze while a region is
// prepared: the ground bake (optical layer) and the relief and slope maps.
import { bakeGround, type GroundInput } from './groundBake'
import { slopePixels, topoPixels, type HeightGrid } from './mapLayers'

export type LayerJob = { kind: 'bake'; inp: GroundInput } | { kind: 'topo'; inp: HeightGrid } | { kind: 'slope'; inp: HeightGrid }

self.onmessage = (e: MessageEvent<{ id: number; job: LayerJob }>) => {
  const { id, job } = e.data
  try {
    if (job.kind === 'bake') {
      const out = bakeGround(job.inp)
      self.postMessage({ id, out }, { transfer: [out.albedo.buffer, out.normal.buffer] })
    } else {
      const out = job.kind === 'topo' ? topoPixels(job.inp) : slopePixels(job.inp)
      self.postMessage({ id, out }, { transfer: [out.buffer] })
    }
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
