import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { BirthInput, CalendarSystem, Gender } from '../../types'
import { GENDER_CN } from '../../types'
import { Cascader, type PlaceValue } from '../common/Cascader'
import { useApp } from '../../store/AppContext'
import {
  SHICHEN,
  lunarDayName,
  lunarMonthDaysOf,
  lunarMonthOptions,
  lunarToSolar,
  solarToLunar,
} from '../../lib/calendar'

/* ============================================================
 *  P3 · 信息收集
 *
 *  v5.0：
 *  · 单屏锁定 —— 表单区域自己滚动，页面本身不产生滚动条。
 *  · flex + gap 自适应排版，字号改用 clamp() 弹性刻度。
 *  · 纯白底 / 纯黑字 —— 进入主页前不出现任何深色。
 *
 *  v9.0 · 任务 2（历法与时辰）
 *  · 出生日期上方加「公历 / 农历」Toggle。
 *    农历模式使用年 / 月 / 日三段式选择器（原生 date input 无法表达农历）。
 *  · 时辰加「传统时辰」下拉：子丑寅卯…每段两小时，
 *    不知道确切钟点也能选。
 *  · 内部始终归一到**公历**存储与计算，农历只是录入方式。
 * ============================================================ */

interface FormStageProps {
  initial: BirthInput | null
  onComplete: (birth: BirthInput) => void
  onBack: () => void
}

const GENDERS: Gender[] = ['female', 'male', 'other', 'undisclosed']

export function FormStage({
  initial,
  onComplete,
  onBack,
}: FormStageProps) {
  const { state, dispatch } = useApp()

  /** 优先使用全局草稿（keep-alive），其次是已提交的存档 */
  const seed = state.birthDraft ?? initial

  /* ---------- 历法模式 ---------- */
  const [calendar, setCalendar] = useState<CalendarSystem>(
    seed?.calendar ?? 'solar',
  )

  /* ---------- 公历日期 ---------- */
  const [date, setDate] = useState(seed?.date ?? '')

  /* ---------- 农历日期（分段选择） ---------- */
  const [lunarY, setLunarY] = useState(() =>
    seed?.date
      ? solarToLunar(
          ...(seed.date.split('-').map(Number) as [number, number, number]),
        )
      : null,
  )

  /* ---------- 时辰 ---------- */
  const [timeMode, setTimeMode] = useState<'clock' | 'shichen'>(
    seed?.shichen ? 'shichen' : 'clock',
  )
  const [time, setTime] = useState(seed?.time ?? '')
  const [shichen, setShichen] = useState(seed?.shichen ?? '')

  const [gender, setGender] = useState<Gender | ''>(seed?.gender ?? '')
  const [error, setError] = useState('')

  /**
   * 出生地：从已填字符串反推（省 / 市 两级）。
   * 组件重新挂载时从 global draft 还原，保证返回后不丢数据。
   */
  const [place, setPlace] = useState<PlaceValue | null>(() => {
    if (!seed?.place) return null
    const parts = seed.place.split(/\s+/).filter(Boolean)
    const province = parts[0] ?? ''
    const city = parts[1] ?? ''
    if (!province || !city) return null
    return { province, city, lat: seed.latitude, lon: seed.longitude }
  })

  /* ---------- 表单变化实时写入草稿 ---------- */
  useEffect(() => {
    const hasAny =
      date || time || shichen || gender || (place && place.province && place.city)
    if (!hasAny) return
    const draft: BirthInput = {
      date,
      time: timeMode === 'clock' ? time : '',
      shichen: timeMode === 'shichen' ? shichen : undefined,
      calendar,
      timeIsApproximate: timeMode === 'shichen' || !time,
      place: place ? `${place.province} ${place.city}` : (seed?.place ?? ''),
      latitude: place?.lat ?? seed?.latitude ?? 0,
      longitude: place?.lon ?? seed?.longitude ?? 0,
      gender: (gender || seed?.gender || 'undisclosed') as Gender,
    }
    dispatch({ type: 'setBirthDraft', birth: draft })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, time, shichen, calendar, timeMode, gender, place, dispatch])

  const submit = () => {
    if (!date) {
      setError('请留下你的出生日期。')
      return
    }
    if (!place || !place.province || !place.city || !place.lat) {
      setError('请选择你的出生地。')
      return
    }
    if (!gender) {
      setError('请选择性别。')
      return
    }
    setError('')
    onComplete({
      date,
      time: timeMode === 'clock' ? time : '',
      shichen: timeMode === 'shichen' ? shichen : undefined,
      calendar,
      timeIsApproximate: timeMode === 'shichen' || !time,
      place: `${place.province} ${place.city}`,
      latitude: place.lat,
      longitude: place.lon,
      gender,
    })
  }

  /* ---------- 切换历法时保持日期语义一致 ---------- */
  const switchCalendar = (next: CalendarSystem) => {
    if (next === calendar) return
    setCalendar(next)
    setError('')
    /*
     * 切换历法时，如果已经有公历日期，
     * 把它换算成农历显示（这样切回公历时日期不变）。
     */
    if (next === 'lunar' && date) {
      const [y, m, d] = date.split('-').map(Number)
      setLunarY(solarToLunar(y, m, d))
    }
    if (next === 'solar' && lunarY) {
      const s = lunarToSolar(
        lunarY.year,
        lunarY.month,
        lunarY.day,
        lunarY.isLeap,
      )
      if (s) {
        setDate(
          `${s.y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`,
        )
      }
    }
  }

  return (
    <div className="screen-col">
      {/* ---------- 滚动内容区 ---------- */}
      <div className="screen-scroll">
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-9 px-6 py-8 sm:px-10 sm:py-12">
          {/* ---------- v16.0 · 深空玻璃壳 ---------- */}
          <div className="glass-panel flex flex-col gap-9 rounded-[28px] px-6 py-8 sm:px-9 sm:py-10">
          {/* 标题 */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="flex flex-col gap-4"
          >
            <p className="eyebrow text-ink-mute">ORIGIN</p>
            <h2 className="serif-title t-page text-ink">你的出生坐标</h2>
            <p className="serif-body t-lead font-medium text-ink-soft">
              天空在你出生的那一刻，就已经写好了。给我三个坐标 ——
              日期、出生地，以及（如果你知道）时刻。
            </p>
          </motion.div>

          <span className="block h-px w-full bg-white/10" />

          {/* 表单 */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.25, ease: 'easeOut' }}
            className="flex flex-col gap-8"
          >
            {/* ---------- 历法 Toggle ---------- */}
            <div className="flex flex-col gap-3">
              <span className="text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.24em] text-ink-soft">
                历法
              </span>
              <div
                className="inline-flex w-fit border-0 p-1"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)' }}
                role="tablist"
                aria-label="历法选择"
              >
                {(
                  [
                    { k: 'solar' as const, label: '公历', sub: 'Gregorian' },
                    { k: 'lunar' as const, label: '农历', sub: 'Lunar' },
                  ]
                ).map((opt) => {
                  const on = calendar === opt.k
                  return (
                    <button
                      key={opt.k}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => switchCalendar(opt.k)}
                      className={`flex flex-col items-center gap-0.5 border-0 px-7 py-2.5 transition-all duration-500 focus:outline-none ${
                        on ? 'btn-photon' : 'btn-pulsar'
                      }`}
                    >
                      <span className="text-[clamp(1.0625rem,1.2vw,1.4rem)] font-semibold tracking-[0.16em]">
                        {opt.label}
                      </span>
                      <span
                        className={`text-[clamp(0.5625rem,0.6vw,0.6875rem)] font-bold tracking-[0.24em] ${
                          on ? 'text-paper/60' : 'text-ink-mute'
                        }`}
                      >
                        {opt.sub}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ---------- 出生日期 ---------- */}
            <Field label="出生日期" required>
              {calendar === 'solar' ? (
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value)
                    setError('')
                  }}
                  className="w-full bg-transparent pb-2 text-[clamp(1.375rem,1.6vw,1.9rem)] font-semibold text-ink outline-none [color-scheme:dark]"
                />
              ) : (
                <LunarDatePicker
                  value={lunarY}
                  onChange={(l) => {
                    setLunarY(l)
                    const s = lunarToSolar(l.year, l.month, l.day, l.isLeap)
                    if (s) {
                      setDate(
                        `${s.y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`,
                      )
                      setError('')
                    }
                  }}
                />
              )}
            </Field>

            {/* ---------- 出生地 ---------- */}
            <Field
              label="出生地"
              required
              hint="精确到城市即可 —— 坐标将据此推算上升宫位，无需更细的地址。"
            >
              <Cascader value={place} onChange={setPlace} />
            </Field>

            {/* ---------- 出生时辰 ---------- */}
            <Field
              label="出生时辰"
              optional
              hint="记得几点就填几点；只记得时辰也行 —— 那就选时辰，我按它的中点算。"
            >
              <TimePicker
                mode={timeMode}
                onModeChange={setTimeMode}
                time={time}
                onTimeChange={(t) => {
                  setTime(t)
                  setError('')
                }}
                shichen={shichen}
                onShichenChange={(s) => {
                  setShichen(s)
                  setError('')
                }}
              />
            </Field>

            {/* ---------- 性别 ---------- */}
            <Field label="性别" required>
              <div className="flex flex-wrap gap-3 pt-1">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`border-0 px-5 py-2 text-[clamp(1.0625rem,1.25vw,1.45rem)] font-semibold tracking-[0.1em] transition-all duration-500 focus:outline-none ${
                      gender === g
                        ? 'bg-ink text-paper'
                        : 'bg-transparent text-ink-soft hover:text-ink'
                    }`}
                    style={
                      gender === g
                        ? undefined
                        : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)' }
                    }
                  >
                    {GENDER_CN[g]}
                  </button>
                ))}
              </div>
            </Field>

            {error && (
              <p className="text-[clamp(1rem,1.15vw,1.35rem)] font-semibold tracking-[0.06em] text-ink-soft">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-6 pt-2">
              <button
                onClick={submit}
                className="btn-photon rounded-full border-0 px-8 py-3.5 text-[clamp(1.0625rem,1.25vw,1.45rem)] font-semibold tracking-[0.2em] focus:outline-none"
              >
                下一步 →
              </button>
              <button
                onClick={onBack}
                className="btn-ghost border-0 pb-1 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.2em] focus:outline-none"
              >
                返回
              </button>
            </div>
          </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 *  农历日期选择器 —— 年 / 月 / 日 三段
 * ============================================================ */
interface LunarDatePickerProps {
  value: { year: number; month: number; day: number; isLeap: boolean } | null
  onChange: (v: {
    year: number
    month: number
    day: number
    isLeap: boolean
  }) => void
}

function LunarDatePicker({ value, onChange }: LunarDatePickerProps) {
  const years = useMemo(
    () => Array.from({ length: 201 }, (_, i) => 1900 + i),
    [],
  )
  const ly = value?.year ?? 1990
  const lm = value?.month ?? 1
  const ld = value?.day ?? 1
  const isLeap = value?.isLeap ?? false

  const months = useMemo(() => lunarMonthOptions(ly), [ly])
  const maxDay = useMemo(() => {
    /* 该农历年该月的实际天数（闰月单独算） */
    const days = lunarMonthDaysOf(ly, lm, isLeap)
    return days > 0 ? days : 29
  }, [ly, lm, isLeap])

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <LunarSelect
        label="年"
        value={String(ly)}
        onChange={(v) => {
          const y = Number(v)
          /* 年份变化时，闰月属性可能失效，需要重置 */
          const next = { year: y, month: lm, day: ld, isLeap }
          onChange(next)
        }}
        options={years.map((y) => ({ value: String(y), label: `${y}` }))}
      />
      <LunarSelect
        label="月"
        value={`${lm}${isLeap ? 'L' : ''}`}
        onChange={(v) => {
          const isL = v.endsWith('L')
          const m = Number(v.replace('L', ''))
          onChange({ year: ly, month: m, day: ld, isLeap: isL })
        }}
        options={months.map((m) => ({
          value: `${m.value}${m.isLeap ? 'L' : ''}`,
          label: m.label,
        }))}
      />
      <LunarSelect
        label="日"
        value={String(ld)}
        onChange={(v) => onChange({ year: ly, month: lm, day: Number(v), isLeap })}
        options={Array.from({ length: maxDay }, (_, i) => ({
          value: String(i + 1),
          label: lunarDayName(i + 1),
        }))}
      />
    </div>
  )
}

function LunarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[clamp(0.6875rem,0.75vw,0.875rem)] font-semibold tracking-[0.24em] text-ink-mute">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent pb-1.5 text-[clamp(1.25rem,1.45vw,1.75rem)] font-semibold text-ink outline-none [color-scheme:dark]"
        style={{ minWidth: '4.5em' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ============================================================
 *  时辰选择器 —— 精确钟点 / 传统时辰 二选一
 * ============================================================ */
function TimePicker({
  mode,
  onModeChange,
  time,
  onTimeChange,
  shichen,
  onShichenChange,
}: {
  mode: 'clock' | 'shichen'
  onModeChange: (m: 'clock' | 'shichen') => void
  time: string
  onTimeChange: (t: string) => void
  shichen: string
  onShichenChange: (s: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* ---- 两种输入方式的切换 ---- */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div
          className="inline-flex border-0 p-1"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)' }}
          role="tablist"
          aria-label="时辰输入方式"
        >
          {(
            [
              { k: 'clock' as const, label: '具体时刻' },
              { k: 'shichen' as const, label: '传统时辰' },
            ]
          ).map((opt) => {
            const on = mode === opt.k
            return (
              <button
                key={opt.k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onModeChange(opt.k)}
                className={`border-0 px-5 py-1.5 text-[clamp(0.9375rem,1.05vw,1.2rem)] font-semibold tracking-[0.16em] transition-all duration-500 focus:outline-none ${
                  on ? 'btn-photon' : 'btn-pulsar'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* ---- 输入区 ---- */}
        {mode === 'clock' ? (
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-full max-w-[200px] bg-transparent pb-2 text-[clamp(1.375rem,1.6vw,1.9rem)] font-semibold text-ink outline-none [color-scheme:dark]"
          />
        ) : (
          <select
            value={shichen}
            onChange={(e) => onShichenChange(e.target.value)}
            className="w-full max-w-[280px] bg-transparent pb-2 text-[clamp(1.375rem,1.6vw,1.9rem)] font-semibold text-ink outline-none [color-scheme:dark]"
          >
            <option value="">请选择时辰</option>
            {SHICHEN.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}　{s.range}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ---- 当前时辰的辅助说明 ---- */}
      {mode === 'shichen' && shichen && (
        <p className="text-[clamp(0.875rem,0.95vw,1.125rem)] font-medium leading-[1.7] text-ink-mute">
          {(() => {
            const s = SHICHEN.find((x) => x.key === shichen)
            if (!s) return ''
            return `「${s.name}」是${s.range}，属${s.zodiac}，方位在${s.direction}。我按${String(s.midHour).padStart(2, '0')}:00 推算 —— 上升星座可能差那么一点，其余基本不变。`
          })()}
        </p>
      )}
      {mode === 'clock' && !time && (
        <p className="text-[clamp(0.875rem,0.95vw,1.125rem)] font-medium leading-[1.7] text-ink-mute">
          记不清具体几点也没关系 —— 换成「传统时辰」选一个就行。
        </p>
      )}
    </div>
  )
}

/* ---------- 字段 ---------- */
function Field({
  label,
  required,
  optional,
  hint,
  children,
}: {
  label: string
  required?: boolean
  optional?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-3 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.24em] text-ink-soft">
        {label}
        {required && (
          <span className="text-[clamp(0.8125rem,0.85vw,1rem)] font-medium tracking-[0.16em] text-ink-mute">
            必填
          </span>
        )}
        {optional && (
          <span className="text-[clamp(0.8125rem,0.85vw,1rem)] font-medium tracking-[0.16em] text-ink-mute">
            选填
          </span>
        )}
      </span>
      {hint && (
        <span className="text-[clamp(0.875rem,0.95vw,1.125rem)] font-medium leading-[1.7] text-ink-mute">
          {hint}
        </span>
      )}
      <span className="underline-glow mt-1 block">{children}</span>
    </label>
  )
}
