/* ============================================================
 *  塔罗卡背纹样（v7.0 · 任务 5）
 *
 *  三种神秘学图腾，全部用纯 SVG 手绘：
 *   · serpent —— 咬住自己尾巴的蛇（永恒循环）
 *   · moon    —— 月相与眼（夜的感知）
 *   · moth    —— 飞蛾与星尘（趋光的趋近）
 *
 *  绘制规范：
 *   · 使用 currentColor 描边，方便跟随主题色
 *   · 线条带轻微辉光（filter: drop-shadow）
 *   · 细节密度控制在「精致但不糊」的级别
 * ============================================================ */

interface CardBackProps {
  /** 图腾类型 */
  totem: 'serpent' | 'moon' | 'moth'
  /** 主色 */
  color: string
  /** 尺寸（viewBox 固定 100×140，按比例缩放） */
  className?: string
}

export function CardBack({ totem, color, className = '' }: CardBackProps) {
  return (
    <svg
      viewBox="0 0 100 140"
      className={className}
      aria-hidden
      style={{
        filter: `drop-shadow(0 0 8px ${color}66)`,
      }}
    >
      {/* ---- 外框：双线 + 四角星芒 ---- */}
      <defs>
        <linearGradient id={`cb-frame-${totem}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.85" />
          <stop offset="50%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect
        x="4"
        y="4"
        width="92"
        height="132"
        rx="4"
        fill="none"
        stroke={`url(#cb-frame-${totem})`}
        strokeWidth="1.4"
      />
      <rect
        x="9"
        y="9"
        width="82"
        height="122"
        rx="2"
        fill="none"
        stroke={color}
        strokeOpacity="0.32"
        strokeWidth="0.6"
      />

      {/* 四角小星 */}
      {[
        [13, 18],
        [87, 18],
        [13, 122],
        [87, 122],
      ].map(([cx, cy]) => (
        <path
          key={`${cx}-${cy}`}
          d={`M ${cx} ${cy - 3.4} L ${cx + 1.1} ${cy - 1.1} L ${cx + 3.4} ${cy} L ${cx + 1.1} ${cy + 1.1} L ${cx} ${cy + 3.4} L ${cx - 1.1} ${cy + 1.1} L ${cx - 3.4} ${cy} L ${cx - 1.1} ${cy - 1.1} Z`}
          fill={color}
          fillOpacity="0.75"
        />
      ))}

      {/* ---- 图腾本体 ---- */}
      {totem === 'serpent' && (
        <g stroke={color} fill="none" strokeLinecap="round">
          {/* 咬尾的环形蛇 */}
          <path
            d="M 50 26
               C 72 34, 78 58, 70 80
               C 62 102, 40 108, 30 96
               C 20 84, 24 64, 36 60
               C 46 57, 54 64, 54 72"
            strokeWidth="2.1"
            strokeOpacity="0.9"
          />
          <path
            d="M 50 26
               C 72 34, 78 58, 70 80
               C 62 102, 40 108, 30 96
               C 20 84, 24 64, 36 60
               C 46 57, 54 64, 54 72"
            strokeWidth="4.6"
            strokeOpacity="0.14"
          />
          {/* 蛇头 */}
          <path
            d="M 54 72 C 54 66, 58 62, 63 62 C 68 62, 71 65, 71 68 C 71 71, 68 73, 65 72.6"
            strokeWidth="1.9"
            strokeOpacity="0.95"
          />
          <circle cx="65.6" cy="66.4" r="1.15" fill={color} stroke="none" />
          {/* 蛇鳞纹 */}
          {[
            [58, 36],
            [70, 50],
            [71, 70],
            [56, 94],
            [36, 86],
            [29, 72],
            [40, 62],
          ].map(([x, y]) => (
            <path
              key={`${x}-${y}`}
              d={`M ${x} ${y - 2.6} Q ${x + 2.6} ${y} ${x} ${y + 2.6} Q ${x - 2.6} ${y} ${x} ${y - 2.6} Z`}
              strokeWidth="0.8"
              strokeOpacity="0.55"
            />
          ))}
          {/* 中央眼 */}
          <path
            d="M 36 70 Q 50 60, 64 70 Q 50 80, 36 70 Z"
            strokeWidth="1"
            strokeOpacity="0.5"
          />
          <circle cx="50" cy="70" r="4" strokeWidth="1.2" strokeOpacity="0.75" />
          <circle cx="50" cy="70" r="1.5" fill={color} stroke="none" />
        </g>
      )}

      {totem === 'moon' && (
        <g stroke={color} fill="none" strokeLinecap="round">
          {/* 月牙 */}
          <path
            d="M 62 22 A 30 30 0 1 0 62 118 A 24 24 0 1 1 62 22 Z"
            strokeWidth="1.7"
            strokeOpacity="0.85"
          />
          <path
            d="M 62 22 A 30 30 0 1 0 62 118 A 24 24 0 1 1 62 22 Z"
            strokeWidth="5"
            strokeOpacity="0.12"
          />
          {/* 月相三连 */}
          <circle cx="50" cy="46" r="5.5" strokeWidth="1" strokeOpacity="0.6" />
          <path
            d="M 50 40.5 A 5.5 5.5 0 0 0 50 51.5 A 5.5 5.5 0 0 0 50 40.5"
            strokeWidth="0.8"
            strokeOpacity="0.45"
          />
          <circle cx="50" cy="94" r="5.5" strokeWidth="1" strokeOpacity="0.6" />
          <path d="M 50 88.5 A 5.5 5.5 0 0 1 50 99.5" strokeWidth="0.8" strokeOpacity="0.45" />
          {/* 星屑 */}
          {[
            [30, 34],
            [72, 40],
            [26, 96],
            [74, 104],
            [50, 66],
          ].map(([x, y]) => (
            <path
              key={`${x}-${y}`}
              d={`M ${x} ${y - 3} L ${x + 0.9} ${y - 0.9} L ${x + 3} ${y} L ${x + 0.9} ${y + 0.9} L ${x} ${y + 3} L ${x - 0.9} ${y + 0.9} L ${x - 3} ${y} L ${x - 0.9} ${y - 0.9} Z`}
              fill={color}
              fillOpacity="0.7"
              stroke="none"
            />
          ))}
          {/* 底线 */}
          <path d="M 26 112 Q 50 106, 74 112" strokeWidth="0.8" strokeOpacity="0.4" />
        </g>
      )}

      {totem === 'moth' && (
        <g stroke={color} fill="none" strokeLinecap="round">
          {/* 左翼 */}
          <path
            d="M 50 46 C 34 28, 16 34, 18 52 C 19 66, 34 72, 48 68"
            strokeWidth="1.7"
            strokeOpacity="0.85"
          />
          <path
            d="M 50 46 C 34 28, 16 34, 18 52 C 19 66, 34 72, 48 68"
            strokeWidth="5"
            strokeOpacity="0.11"
          />
          {/* 右翼 */}
          <path
            d="M 50 46 C 66 28, 84 34, 82 52 C 81 66, 66 72, 52 68"
            strokeWidth="1.7"
            strokeOpacity="0.85"
          />
          <path
            d="M 50 46 C 66 28, 84 34, 82 52 C 81 66, 66 72, 52 68"
            strokeWidth="5"
            strokeOpacity="0.11"
          />
          {/* 身体 */}
          <path
            d="M 50 44 L 50 86"
            strokeWidth="2"
            strokeOpacity="0.9"
          />
          <ellipse cx="50" cy="42" rx="3.4" ry="4" strokeWidth="1.3" strokeOpacity="0.9" />
          {/* 触角 */}
          <path d="M 48.4 39 Q 43 30, 38 28" strokeWidth="0.9" strokeOpacity="0.6" />
          <path d="M 51.6 39 Q 57 30, 62 28" strokeWidth="0.9" strokeOpacity="0.6" />
          {/* 翅上眼斑 */}
          <circle cx="31" cy="49" r="3.6" strokeWidth="0.9" strokeOpacity="0.6" />
          <circle cx="31" cy="49" r="1.3" fill={color} fillOpacity="0.6" stroke="none" />
          <circle cx="69" cy="49" r="3.6" strokeWidth="0.9" strokeOpacity="0.6" />
          <circle cx="69" cy="49" r="1.3" fill={color} fillOpacity="0.6" stroke="none" />
          {/* 尾须 */}
          <path d="M 50 86 Q 44 96, 47 108" strokeWidth="0.9" strokeOpacity="0.55" />
          <path d="M 50 86 Q 56 96, 53 108" strokeWidth="0.9" strokeOpacity="0.55" />
        </g>
      )}

      {/* ---- 底部装饰条 ---- */}
      <path
        d="M 24 128 L 38 128 M 46 128 L 54 128 M 62 128 L 76 128"
        stroke={color}
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  )
}
