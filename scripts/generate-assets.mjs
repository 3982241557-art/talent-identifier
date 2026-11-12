// 占位图像生成器：生成纯 Node（无外部依赖）的 PNG 编码器输出
// 用法: node scripts/generate-assets.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PUB = resolve(here, '../public')

/* ---------------- PNG 编码器 (RGB, 8bit) ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- 噪声 / 工具 ---------------- */
function hash2(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}
function fbm(x, y, oct = 5, seed = 1) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 17)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const mix = (a, b, t) => a + (b - a) * t

/* ---------------- bg.png : 宇宙级太阳与月球 ---------------- */
function makeCosmos(w = 1600, h = 900) {
  const buf = Buffer.alloc(w * h * 3)
  const sunX = w * 0.74, sunY = h * 0.30, sunR = Math.min(w, h) * 0.155
  const moonX = w * 0.22, moonY = h * 0.72, moonR = Math.min(w, h) * 0.105

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w, ny = y / h
      // 深邃蓝 -> 纯黑 的宇宙底色
      let r = mix(2, 10, ny)
      let g = mix(4, 14, ny)
      let b = mix(10, 30, 1 - ny * 0.7)
      // 星云雾霭
      const neb = fbm(nx * 4.2, ny * 3.1, 5, 7)
      const nebMask = Math.pow(clamp(neb * 1.25 - 0.42, 0, 1), 1.8)
      r += nebMask * 34; g += nebMask * 38; b += nebMask * 72

      // 远景星点
      const sx = Math.floor(x / 3.2), sy = Math.floor(y / 3.2)
      const sp = hash2(sx, sy, 91)
      if (sp > 0.9958) {
        const px = sx * 3.2 + hash2(sx, sy, 92) * 3.2
        const py = sy * 3.2 + hash2(sx, sy, 93) * 3.2
        const dd = Math.hypot(x - px, y - py)
        const mag = (sp - 0.9958) / 0.0042
        const s = Math.max(0, 1 - dd / (1.1 + mag * 1.6)) * (0.35 + mag * 0.65)
        const tint = hash2(sx, sy, 94)
        r += s * 248; g += s * 250; b += s * (232 + tint * 30)
      }

      // 太阳：暖金色辉光
      const ds = Math.hypot(x - sunX, y - sunY)
      const sunGlow = Math.pow(clamp(1 - ds / (sunR * 7.5), 0, 1), 2.6)
      r += sunGlow * 205; g += sunGlow * 142; b += sunGlow * 52
      const sunCore = Math.pow(clamp(1 - ds / sunR, 0, 1), 0.38)
      r += sunCore * 255; g += sunCore * 196; b += sunCore * 112
      // 日珥 / 表面纹理
      if (ds < sunR * 1.35) {
        const tex = fbm(nx * 42, ny * 42, 4, 33)
        const edge = clamp((sunR * 1.35 - ds) / (sunR * 0.5), 0, 1)
        r += tex * 40 * edge; g += tex * 26 * edge; b += tex * 8 * edge
      }

      // 月球：冷白
      const dm = Math.hypot(x - moonX, y - moonY)
      const moonGlow = Math.pow(clamp(1 - dm / (moonR * 5.2), 0, 1), 3.2)
      r += moonGlow * 74; g += moonGlow * 90; b += moonGlow * 124
      if (dm < moonR) {
        const tex = fbm(nx * 55 + 3, ny * 55, 4, 55)
        const shade = clamp(1 - dm / moonR, 0, 1)
        const craters = 0.72 + tex * 0.5
        r += shade * craters * 225; g += shade * craters * 234; b += shade * craters * 248
      }

      // 底部压暗（40% 黑遮罩在 CSS 层实现，这里保留一点自然衰减）
      const vig = 1 - Math.pow(Math.hypot(nx - 0.5, ny - 0.5) * 1.18, 2.4)
      const v = clamp(vig, 0.52, 1)
      const i = (y * w + x) * 3
      buf[i] = clamp(r * v, 0, 255)
      buf[i + 1] = clamp(g * v, 0, 255)
      buf[i + 2] = clamp(b * v, 0, 255)
    }
  }
  return encodePNG(w, h, buf)
}

/* ---------------- avatar-N.png : 人物剪影占位 ---------------- */
function makeAvatar(w = 640, h = 800, opts = {}) {
  const buf = Buffer.alloc(w * h * 3)
  const { hue = 210, seed = 5, rim = 1 } = opts
  const cx = w * 0.5
  const headY = h * 0.36
  const headR = w * 0.17

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w
      const ny = y / h

      // 背景：深邃蓝 -> 近黑
      let r = mix(3, 9, ny)
      let g = mix(5, 12, ny)
      let b = mix(11, 24, 1 - ny)

      // 星云薄雾
      const neb = fbm(nx * 3.1, ny * 3.1, 5, seed)
      const nebMask = Math.pow(clamp(neb * 1.3 - 0.45, 0, 1), 1.7)
      r += nebMask * 22
      g += nebMask * 28
      b += nebMask * 54

      // 背后冷光晕（人物轮廓后方的天体辉光）
      const dg = Math.hypot((x - cx) / (headR * 2.1), (y - headY) / (headR * 2.1))
      const glow = Math.pow(clamp(1 - dg, 0, 1), 2.2)
      r += glow * 30
      g += glow * 40 * (hue / 210)
      b += glow * 68

      // 头肩剪影几何
      const dHead = Math.hypot((x - cx) / (headR * 0.84), (y - headY) / headR)
      const neckY = headY + headR * 0.9
      const shoulderY = h * 0.84
      const bodyW = w * 0.33
      const inBody =
        y > neckY &&
        y < shoulderY &&
        Math.abs(x - cx) < bodyW * Math.pow((y - neckY) / (shoulderY - neckY), 0.5)

      const sil = dHead < 1 || inBody

      if (sil) {
        // 人物：受背后光源照亮的柔和体积感
        // 光源在左上后方
        const lx = (x - cx) / headR
        const ly = (y - headY) / headR
        const lightDist = Math.hypot(lx + 0.55, ly + 0.62)
        const light = clamp(1 - lightDist / 2.3, 0, 1)
        const edge = clamp((dHead - 0.72) / 0.28, 0, 1)

        const lum =
          0.035 + light * 0.30 * (0.35 + edge * 0.65) +
          fbm(nx * 7, ny * 7, 4, seed + 3) * 0.05

        // 暖侧光 + 冷环境光
        const warm = Math.pow(clamp(1 - lightDist / 1.7, 0, 1), 2.0)
        r = lum * 255 + warm * 96 * rim
        g = lum * 244 + warm * 74 * rim
        b = lum * 238 + warm * 44 * rim

        // 轮廓边缘的暗金细线
        const rimLine =
          dHead > 0.88 && dHead < 1.0
            ? Math.exp(-Math.pow((dHead - 0.95) / 0.045, 2))
            : 0
        r += rimLine * 130 * rim
        g += rimLine * 108 * rim
        b += rimLine * 66 * rim
      }

      const i = (y * w + x) * 3
      buf[i] = clamp(r, 0, 255)
      buf[i + 1] = clamp(g, 0, 255)
      buf[i + 2] = clamp(b, 0, 255)
    }
  }
  return encodePNG(w, h, buf)
}

/* ---------------- 输出 ---------------- */
mkdirSync(PUB, { recursive: true })
writeFileSync(resolve(PUB, 'bg.png'), makeCosmos())
console.log('wrote public/bg.png')

const avatars = [
  { name: 'avatar-1.png', hue: 205, seed: 11 },
  { name: 'avatar-2.png', hue: 225, seed: 29 },
  { name: 'avatar-3.png', hue: 195, seed: 47 },
  { name: 'avatar-4.png', hue: 235, seed: 63 },
]
for (const a of avatars) {
  writeFileSync(resolve(PUB, a.name), makeAvatar(640, 800, a))
  console.log('wrote public/' + a.name)
}
