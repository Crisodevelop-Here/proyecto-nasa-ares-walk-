import { describe, expect, it } from 'vitest'
import { cameraName, fromCuriosity, fromPerseverance } from './rawPhotos'

const m20 = (instrument: string, sample_type: string, id = instrument) => ({
  imageid: id,
  sol: 2031,
  date_taken_utc: '2026-11-06T12:16:25.848',
  sample_type,
  camera: { instrument },
  image_files: { small: `${id}_320.jpg`, large: `${id}_1200.jpg` },
  link: `https://mars.nasa.gov/mars2020/multimedia/raw-images/${id}`,
})

const msl = (instrument: string, sample_type: string, id = 1) => ({
  id,
  imageid: `${instrument}-${id}`,
  sol: 5073,
  date_taken: '2026-11-13T15:17:38.000Z',
  instrument,
  url: `https://mars.nasa.gov/msl-raw-images/${id}.jpg`,
  extended: { sample_type },
})

describe('rover raw photos', () => {
  it('keeps full Perseverance frames from the left eye only', () => {
    const out = fromPerseverance([m20('MCZ_LEFT', 'Full'), m20('MCZ_RIGHT', 'Full'), m20('NAVCAM_LEFT', 'Thumbnail'), m20('SUPERCAM_RMI', 'Full')])
    expect(out.map((p) => p.camera)).toEqual(['MCZ_LEFT', 'SUPERCAM_RMI'])
    expect(out[0].thumb).toBe('MCZ_LEFT_320.jpg')
    expect(out[0].full).toBe('MCZ_LEFT_1200.jpg')
  })

  it('keeps full Curiosity frames and links each to its NASA page', () => {
    const out = fromCuriosity([msl('NAV_LEFT_B', 'full', 7), msl('NAV_RIGHT_B', 'full', 8), msl('MAHLI', 'thumbnail', 9), msl('NAV_LEFT_B', 'downsampled', 10)])
    expect(out).toHaveLength(1)
    expect(out[0].link).toBe('https://mars.nasa.gov/raw_images/7/')
  })

  it('names cameras in plain words in both languages', () => {
    expect(cameraName('MCZ_LEFT', 'es')).toMatch(/principal/)
    expect(cameraName('NAV_LEFT_B', 'en')).toBe('Driving camera')
    expect(cameraName('FHAZ_LEFT_B', 'es')).toBe('Cámara de obstáculos')
    expect(cameraName('UNKNOWN_CAM', 'es')).toBe('UNKNOWN_CAM')
  })
})
