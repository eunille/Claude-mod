// The Pulse owl: 14×14 pixels drawn as 14×7 terminal cells, two pixels a cell (▀ / ▄),
// its eyes swapped per mood. Letters name colours; '.' is the terminal's own background.

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

export const OWL_COLUMNS = 14
export const OWL_ROWS = 7

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄

function rgb(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return Number.isNaN(n) ? DEFAULT : n
}

function pixels(mood: OwlMood): string[] {
  const [l4, l5, r4, r5] = EYES[mood]
  return SPRITE.map((row, y) => {
    if (y !== 4 && y !== 5) return row
    const [l, r] = y === 4 ? [l4, r4] : [l5, r5]
    return row.slice(0, 3) + l + row.slice(5, 9) + r + row.slice(11)
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

/** The owl in a mood, as a Raster's `cells`. */
export function owlCells(mood: OwlMood, colors: OwlColors): string {
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
  const grid = pixels(mood)
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
