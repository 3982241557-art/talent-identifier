import { useTypewriter } from '../../hooks/useTypewriter'

interface TypewriterLineProps {
  text: string
  speed?: number
  className?: string
  active?: boolean
  showCaret?: boolean
  /** 打印完成时回调 */
  onDone?: () => void
}

/**
 * 打字机文本行 —— 光标为极细的暗金竖线
 */
export function TypewriterLine({
  text,
  speed = 45,
  className = '',
  active = true,
  showCaret = true,
  onDone,
}: TypewriterLineProps) {
  const { shown, done } = useTypewriter(text, speed, active)

  if (done && onDone) {
    // 在渲染后触发一次
    queueMicrotask(onDone)
  }

  return (
    <span className={className}>
      {shown}
      {showCaret && !done && (
        <span
          className="ml-[2px] inline-block h-[1em] w-px translate-y-[2px] bg-gold/60 align-middle"
          style={{ animation: 'blink 1.1s steps(2) infinite' }}
        />
      )}
    </span>
  )
}
