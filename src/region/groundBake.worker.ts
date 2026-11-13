// Runs the ground bake off the main thread so the page doesn't freeze while a region is prepared.
import { bakeGround, type GroundInput } from './groundBake'

self.onmessage = (e: MessageEvent<{ id: number; inp: GroundInput }>) => {
  const { id, inp } = e.data
  try {
    const out = bakeGround(inp)
    self.postMessage({ id, out }, { transfer: [out.albedo.buffer, out.normal.buffer] })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}
