// The Pulse owl: 14×14 pixels on a 16×16 canvas, drawn as 16×8 terminal cells, two pixels a cell (▀ / ▄),
// its eyes swapped per mood and its body moved per pose. Letters name colours; '.' is the terminal's own background.

import type { PulseOwlColor } from '../types'

export type OwlMood = 'look' | 'glanceL' | 'glanceR' | 'blink' | 'sleepy' | 'sleep' | 'curious' | 'alarm' | 'happy'

export type OwlColors = {
  body: string
  wing: string
  face: string
  belly: string
  spots: string
  eye: string
  pupil: string
  /** The line of a closed or smiling eye. */
  lash: string
  beak: string
  feet: string
  alarm: string
}

export const OWL_COLORWAYS: readonly PulseOwlColor[] = ['night', 'barn', 'snowy', 'lilac']

/**
 * Each colourway in Catppuccin, Mocha for a dark background and Latte for a light one: a dark
 * outline and wings, a mid-tone body, a light face and belly, and eyes that stand out.
 */
export const OWLS: Record<PulseOwlColor, { dark: OwlColors; light: OwlColors }> = {
  // Slate grey with amber eyes: the classic owl.
  night: {
    dark: {
      body: '#6c7086', // overlay0
      wing: '#45475a', // surface1
      face: '#a6adc8', // subtext0
      belly: '#bac2de', // subtext1
      spots: '#7f849c', // overlay1
      eye: '#f9e2af', // yellow
      pupil: '#11111b', // crust
      lash: '#11111b',
      beak: '#fab387', // peach
      feet: '#fab387',
      alarm: '#f38ba8', // red
    },
    light: {
      body: '#6c6f85',
      wing: '#4c4f69',
      face: '#9ca0b0',
      belly: '#acb0be',
      spots: '#7c7f93',
      eye: '#df8e1d',
      pupil: '#1e1e2e',
      lash: '#1e1e2e',
      beak: '#fe640b',
      feet: '#fe640b',
      alarm: '#d20f39',
    },
  },
  // Peach and maroon, a pale heart face, black eyes with a glint.
  barn: {
    dark: {
      body: '#fab387', // peach
      wing: '#eba0ac', // maroon
      face: '#f5e0dc', // rosewater
      belly: '#f2cdcd', // flamingo
      spots: '#fab387',
      eye: '#11111b', // crust
      pupil: '#cdd6f4', // text: the glint
      lash: '#11111b',
      beak: '#eba0ac',
      feet: '#f9e2af', // yellow
      alarm: '#f38ba8',
    },
    light: {
      body: '#fe640b',
      wing: '#e64553',
      face: '#dc8a78',
      belly: '#dd7878',
      spots: '#fe640b',
      eye: '#1e1e2e',
      pupil: '#eff1f5',
      lash: '#1e1e2e',
      beak: '#e64553',
      feet: '#df8e1d',
      alarm: '#d20f39',
    },
  },
  // White with dark speckles, amber eyes and a dark beak.
  snowy: {
    dark: {
      body: '#cdd6f4', // text
      wing: '#a6adc8', // subtext0
      face: '#f5e0dc', // rosewater
      belly: '#cdd6f4',
      spots: '#6c7086', // overlay0
      eye: '#f9e2af', // yellow
      pupil: '#11111b',
      lash: '#45475a',
      beak: '#45475a', // surface1
      feet: '#bac2de',
      alarm: '#f38ba8',
    },
    light: {
      body: '#bcc0cc',
      wing: '#9ca0b0',
      face: '#ccd0da',
      belly: '#bcc0cc',
      spots: '#5c5f77',
      eye: '#df8e1d',
      pupil: '#1e1e2e',
      lash: '#4c4f69',
      beak: '#4c4f69',
      feet: '#9ca0b0',
      alarm: '#d20f39',
    },
  },
  // The first owl: mauve and lavender.
  lilac: {
    dark: {
      body: '#cba6f7', // mauve
      wing: '#b4befe', // lavender
      face: '#f2cdcd', // flamingo
      belly: '#f5e0dc', // rosewater
      spots: '#f5c2e7', // pink
      eye: '#cdd6f4', // text
      pupil: '#11111b',
      lash: '#11111b',
      beak: '#fab387',
      feet: '#f9e2af',
      alarm: '#f38ba8',
    },
    light: {
      body: '#8839ef',
      wing: '#7287fd',
      face: '#dd7878',
      belly: '#dc8a78',
      spots: '#ea76cb',
      eye: '#eff1f5',
      pupil: '#4c4f69',
      lash: '#4c4f69',
      beak: '#fe640b',
      feet: '#df8e1d',
      alarm: '#d20f39',
    },
  },
}

// Eyes sit at rows 4-5, columns 3-4 (left) and 9-10 (right); `ee` marks them here.
const SPRITE = [
  '..M........M..',
  '..MM......MM..',
  '..MMMMMMMMMM..',
  '.MFFFFMMFFFFM.',
  '.MFeeFMMFeeFM.',
  '.MFeeFMMFeeFM.',
  '.MFFFFKKFFFFM.',
  '.MMMMMKKMMMMM.',
  'LMMRRRRRRRRMML',
  'LLMRRSRRSRRMLL',
  'LLMRRRRRRRRMLL',
  '..LMRRSSRRML..',
  '...MMMMMMMM...',
  '...YY....YY...',
]

/** Per mood: the left eye's two rows, then the right eye's (E eye, P pupil, D lash, F face, M lid, A alarm). */
const EYES: Record<OwlMood, [string, string, string, string]> = {
  look: ['EE', 'EP', 'EE', 'PE'],
  glanceL: ['EE', 'PE', 'EE', 'PE'],
  glanceR: ['EE', 'EP', 'EE', 'EP'],
  blink: ['FF', 'DD', 'FF', 'DD'],
  sleepy: ['MM', 'EP', 'MM', 'PE'],
  sleep: ['FF', 'DD', 'FF', 'DD'],
  curious: ['EP', 'EE', 'PE', 'EE'],
  alarm: ['AA', 'AP', 'AA', 'PA'],
  happy: ['DD', 'FF', 'DD', 'FF'],
}

/** Rows 6-11 with the wings raised, for a flap or a hop. */
const WINGS_UP = [
  'LMFFFFKKFFFFML',
  'LLMMMMKKMMMMLL',
  'LLMRRRRRRRRMLL',
  '.LMRRSRRSRRML.',
  '..MRRRRRRRRM..',
  '...MRRSSRRM...',
]
/** Row 0 with the ear tufts flicked outward. */
const EARS_TWITCH = '.M..........M.'

/** How the owl stands this frame: where in its canvas (1 is centred, 0 and 2 a pixel off), and whether wings and ears are up. */
export type OwlPose = { dx: number; dy: number; isFlap: boolean; isTwitch: boolean }
export const STILL: OwlPose = { dx: 1, dy: 1, isFlap: false, isTwitch: false }

const SPRITE_SIZE = 14
/** The canvas leaves a pixel round the 14×14 sprite, so it can bob, hop and shake without clipping. */
export const OWL_COLUMNS = 16
export const OWL_ROWS = 8

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄

function rgb(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return Number.isNaN(n) ? DEFAULT : n
}

/** The sprite in a mood and pose, placed on the canvas: OWL_ROWS * 2 rows of OWL_COLUMNS pixels. */
function pixels(mood: OwlMood, pose: OwlPose): string[] {
  const [l4, l5, r4, r5] = EYES[mood]
  const sprite = SPRITE.map((row, y) => {
    if (y === 0 && pose.isTwitch) return EARS_TWITCH
    if (pose.isFlap && y >= 6 && y <= 11) return WINGS_UP[y - 6] ?? row
    if (y !== 4 && y !== 5) return row
    const [l, r] = y === 4 ? [l4, r4] : [l5, r5]
    return row.slice(0, 3) + l + row.slice(5, 9) + r + row.slice(11)
  })
  const dx = Math.max(0, Math.min(OWL_COLUMNS - SPRITE_SIZE, pose.dx))
  const dy = Math.max(0, Math.min(OWL_ROWS * 2 - SPRITE_SIZE, pose.dy))
  const blank = '.'.repeat(OWL_COLUMNS)
  return Array.from({ length: OWL_ROWS * 2 }, (_, y) => {
    const row = sprite[y - dy]
    return row === undefined ? blank : '.'.repeat(dx) + row + '.'.repeat(OWL_COLUMNS - SPRITE_SIZE - dx)
  })
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? '=' : B64[(n >> 6) & 63]!) + (c === undefined ? '=' : B64[n & 63]!)
  }
  return out
}

/** Every encoded owl, by colourway, then mood and pose: a handful of poses repeat, so each is built once. */
const built = new WeakMap<OwlColors, Map<string, string>>()

/** The owl in a mood and pose, as a Raster's `cells`. */
export function owlCells(mood: OwlMood, colors: OwlColors, pose: OwlPose = STILL): string {
  let byPose = built.get(colors)
  if (!byPose) built.set(colors, (byPose = new Map()))
  const key = `${mood}|${pose.dx}|${pose.dy}|${pose.isFlap ? 1 : 0}|${pose.isTwitch ? 1 : 0}`
  const hit = byPose.get(key)
  if (hit !== undefined) return hit
  const cells = buildCells(mood, colors, pose)
  byPose.set(key, cells)
  return cells
}

function buildCells(mood: OwlMood, colors: OwlColors, pose: OwlPose): string {
  const palette: Record<string, number> = {
    M: rgb(colors.body),
    L: rgb(colors.wing),
    F: rgb(colors.face),
    R: rgb(colors.belly),
    S: rgb(colors.spots),
    E: rgb(colors.eye),
    P: rgb(colors.pupil),
    D: rgb(colors.lash),
    K: rgb(colors.beak),
    Y: rgb(colors.feet),
    A: rgb(colors.alarm),
  }
  const grid = pixels(mood, pose)
  const view = new DataView(new ArrayBuffer(OWL_COLUMNS * OWL_ROWS * 12))
  for (let row = 0; row < OWL_ROWS; row++) {
    for (let col = 0; col < OWL_COLUMNS; col++) {
      const top = palette[grid[row * 2]?.[col] ?? '.']
      const bottom = palette[grid[row * 2 + 1]?.[col] ?? '.']
      const [glyph, fg, bg] =
        top === undefined && bottom === undefined
          ? [0x20, DEFAULT, DEFAULT]
          : top === undefined
            ? [LOWER, bottom!, DEFAULT]
            : [UPPER, top, bottom ?? DEFAULT]
      const at = (row * OWL_COLUMNS + col) * 12
      view.setUint32(at, glyph, true)
      view.setUint32(at + 4, fg, true)
      view.setUint32(at + 8, bg, true)
    }
  }
  return toBase64(new Uint8Array(view.buffer))
}
