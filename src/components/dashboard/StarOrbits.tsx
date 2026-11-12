import { useId } from 'react'

/* ============================================================
 *  星轨动效 —— 椭圆 / 圆形星轨
 *
 *  v3.0：删除原先两条贯穿画面的直线星链，
 *  替换为浅淡的椭圆轨道，环绕在屏幕四周。
 *  星点沿轨道缓慢流动，暗示星盘的公转与节律。
 * ============================================================ */

interface StarOrbitsProps {
  className?: string
}

export function StarOrbits({ className = '' }: StarOrbitsProps) {
  const uid = useId().replace(/:/g, '')

  /* 三条同心椭圆轨道 —— 分别压扁、加宽，形成环绕感 */
  const orbits = [
    { rx: 880, ry: 470, cx: 800, cy: 560, dur: 46, op: 0.16, color: '#ffffff' },
    { rx: 700, ry: 620, cx: 800, cy: 560, dur: 62, op: 0.11, color: '#bcd6f0' },
    { rx: 1020, ry: 330, cx: 800, cy: 560, dur: 78, op: 0.08, color: '#ffffff' },
  ]

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1600 1120"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {orbits.map((o, i) => {
        const pathId = `${uid}-orbit-${i}`
        return (
          <g key={pathId}>
            {/* 轨道本体 —— 极淡 */}
            <ellipse
              cx={o.cx}
              cy={o.cy}
              rx={o.rx}
              ry={o.ry}
              fill="none"
              stroke={o.color}
              strokeOpacity={o.op}
              strokeWidth="1"
            />
            {/* 隐藏的可引用路径（供 animateMotion 使用） */}
            <path id={pathId} fill="none" stroke="none" d="" />
            {/* 沿轨道流动的星点 */}
            <circle r="2.6" fill={o.color} filter={`url(#${uid}-glow)`}>
              <animateMotion
                dur={`${o.dur}s`}
                repeatCount="indefinite"
                path={`M ${o.cx - o.rx} ${o.cy} A ${o.rx} ${o.ry} 0 0 1 ${o.cx + o.rx} ${o.cy} A ${o.rx} ${o.ry} 0 0 1 ${o.cx - o.rx} ${o.cy}`}
              />
            </circle>
            <circle r="1.9" fill={o.color} fillOpacity="0.8" filter={`url(#${uid}-glow)`}>
              <animateMotion
                dur={`${o.dur}s`}
                begin={`${o.dur / 3}s`}
                repeatCount="indefinite"
                path={`M ${o.cx - o.rx} ${o.cy} A ${o.rx} ${o.ry} 0 0 1 ${o.cx + o.rx} ${o.cy} A ${o.rx} ${o.ry} 0 0 1 ${o.cx - o.rx} ${o.cy}`}
              />
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
