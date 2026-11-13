// On CI (no GPU, software WebGL) the tests open the app in light mode so the 3D view keeps up.
// E2E_LITE=1 does the same locally.
export const APP = process.env.CI || process.env.E2E_LITE ? '/?lite' : '/'
