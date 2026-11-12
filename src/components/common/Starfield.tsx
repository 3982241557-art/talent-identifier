import type { ReactNode } from 'react'

interface StarfieldProps {
  density?: number
  className?: string
  children?: ReactNode
}

/**
 * 背景星空 —— 纯 CSS 生成的静态星点层（无发光边框、极安静）
 */
export function Starfield({ density = 90, className = '', children }: StarfieldProps) {
  const stars = Array.from({ length: density }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280
    const r = seed / 233280
    const seed2 = (i * 4517 + 12345) % 7919
    const r2 = seed2 / 7919
    const size = r2 > 0.94 ? 2 : r2 > 0.8 ? 1.4 : 1
    const opacity = 0.12 + r * 0.5
    const dur = 6 + r2 * 10
    return {
      left: `${r * 100}%`,
      top: `${((i * 37) % 100) + r2 * 0.6}%`,
      width: size,
      height: size,
      opacity,
      animation: `twinkle ${dur}s ease-in-out ${r2 * 5}s infinite`,
    }
  })

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              opacity: s.opacity,
              animation: s.animation,
            }}
          />
        ))}
      </div>
      {children}
    </div>
  )
}
