/* ============================================================
 *  VersionToggle · 极简版 / 深度剖析版 双版本切换（v16.0）
 * ============================================================
 *
 *  【为什么需要】
 *  用户的需求很直接：解读类内容要能**随时**在两种深度之间来回切，
 *  而且**不能有等待** —— 切换必须是 0 延迟的秒切。
 *
 *  【怎么做到 0 延迟】
 *  后端一次返回双版本结构（minimal / deep），
 *  前端把两份都缓存下来，
 *  切换时只是换一份数据显示 —— 不发请求、不 loading。
 *
 *  【视觉】
 *  Sticky Header 里的胶囊按钮：
 *    · 激活态 = 恒星金渐变底 + 深色粗体字 + 微发光
 *    · 未激活 = 透明底 + 冷灰字，hover 转脉冲星青
 * ============================================================ */

import { motion } from 'framer-motion'

/** 版本标识 */
export type ReportVersion = 'minimal' | 'deep'

interface VersionToggleProps {
  /** 当前版本 */
  value: ReportVersion
  /** 切换回调 */
  onChange: (v: ReportVersion) => void
  /** 极简版是否可用（后端没返回时禁用） */
  minimalAvailable?: boolean
  /** 深度版是否可用 */
  deepAvailable?: boolean
  className?: string
}

/** 两个版本的显示文案 */
const LABELS: Record<ReportVersion, { icon: string; text: string }> = {
  minimal: { icon: '⚡️', text: '极简直给版' },
  deep: { icon: '🔭', text: '深度剖析版' },
}

export function VersionToggle({
  value,
  onChange,
  minimalAvailable = true,
  deepAvailable = true,
  className = '',
}: VersionToggleProps) {
  const versions: ReportVersion[] = ['minimal', 'deep']

  return (
    <div
      data-version-toggle
      className={className}
      role="tablist"
      aria-label="解读深度切换"
    >
      {versions.map((v) => {
        const available = v === 'minimal' ? minimalAvailable : deepAvailable
        const active = value === v
        const { icon, text } = LABELS[v]

        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            data-active={String(active)}
            disabled={!available}
            onClick={() => available && onChange(v)}
            className="px-4 py-2 text-[clamp(0.8125rem,0.92vw,1.05rem)] tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-35"
            style={{ transitionDuration: '0.4s' }}
          >
            <span className="mr-1.5">{icon}</span>
            {text}
            {active && (
              <motion.span
                layoutId="version-pill-glow"
                className="pointer-events-none absolute inset-0 -z-10 rounded-full"
                style={{
                  boxShadow: '0 0 20px rgba(245,194,107,0.4)',
                }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/** 默认版本 —— 极简版 */
export const DEFAULT_VERSION: ReportVersion = 'minimal'
