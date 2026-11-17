import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  citiesOf,
  getProvinces,
  loadRegionsWithRetry,
  type ProvinceTuple,
} from '../../data/cities'

/* ============================================================
 *  出生地级联选择器 —— 省 / 市（两级）
 *
 *  v3.0：去掉区县级。出生地只需精确到城市即可满足
 *  上升宫位推算所需的经纬度精度，同时消除用户的隐私顾虑。
 *  样式与「纸底黑字」的初始态保持一致：
 *  无边框、无圆角、仅底部一条随主题发光的细线。
 *  数据来自 src/data/regions.ts（离线内置，无地理 API 依赖），
 *  在本组件挂载时按需动态载入，不阻塞首屏。
 *
 *  v9.0 · 数据断流修复
 *  ------------------------------------------------------------
 *  旧版只有 `loading` 一个状态：
 *  动态 import 失败时 Promise reject 且无人 catch，
 *  regions 永远是 null → 下拉框永远显示「载入中…」→ 用户无法选择。
 *
 *  v9.0 引入**四态模型**：
 *    loading  —— 正在载入，显示「载入中…」
 *    error    —— 载入失败，显示可点击的「重试」
 *    ready    —— 载入成功，正常可选
 *    empty    —— 数据为空（理论上不会出现），同样给出重试
 * ============================================================ */

export interface PlaceValue {
  province: string
  city: string
  lat: number
  lon: number
}

interface CascaderProps {
  value: PlaceValue | null
  onChange: (v: PlaceValue) => void
}

/** 载入状态机 */
type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; regions: ProvinceTuple[] }
  | { phase: 'empty' }

export function Cascader({ value, onChange }: CascaderProps) {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [province, setProvince] = useState(value?.province ?? '')
  const [city, setCity] = useState(value?.city ?? '')

  /* ---------- 外部 value 变化时同步内部状态（返回上一页后还原） ---------- */
  useEffect(() => {
    if (!value) return
    if (value.province !== province) setProvince(value.province)
    if (value.city !== city) setCity(value.city)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.province, value?.city])

  /* ---------- 按需载入行政区划数据（带重试） ---------- */
  const loadRegions = useCallback(async () => {
    setLoad({ phase: 'loading' })
    try {
      const regions = await loadRegionsWithRetry()
      if (regions.length === 0) {
        setLoad({ phase: 'empty' })
        return
      }
      setLoad({ phase: 'ready', regions })
      /*
       * 数据到位后，如果外部 value 已经选了省份但之前没渲染出选项，
       * 这里补一次 commit —— 保证「返回上一页再进来」时坐标不丢。
       */
      setProvince((prev) => {
        if (prev && regions.some((r) => r[0] === prev)) {
          queueMicrotask(() => {
            const first = citiesOf(prev, regions)[0]
            if (first) {
              setCity((c) => c || first.name)
              onChange({
                province: prev,
                city: first.name,
                lat: first.lat,
                lon: first.lon,
              })
            }
          })
        }
        return prev
      })
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : '行政区划数据载入失败'
      setLoad({ phase: 'error', message: msg })
    }
  }, [onChange])

  useEffect(() => {
    void loadRegions()
  }, [loadRegions])

  const regions = load.phase === 'ready' ? load.regions : null

  const provinces = useMemo(() => getProvinces(regions), [regions])
  const cities = useMemo(
    () => (province ? citiesOf(province, regions) : []),
    [province, regions],
  )

  /** 提交选择：以选中的城市坐标为准 */
  const commit = (p: string, c: string) => {
    const list = p ? citiesOf(p, regions) : []
    const coord = list.find((x) => x.name === c)
    if (!coord) {
      onChange({ province: p, city: '', lat: 0, lon: 0 })
      return
    }
    onChange({
      province: p,
      city: c,
      lat: coord.lat,
      lon: coord.lon,
    })
  }

  const handleProvince = (p: string) => {
    setProvince(p)
    setCity('')
    if (!p) {
      onChange({ province: '', city: '', lat: 0, lon: 0 })
      return
    }
    const first = citiesOf(p, regions)[0]
    if (!first) return
    setCity(first.name)
    commit(p, first.name)
  }

  const handleCity = (c: string) => {
    setCity(c)
    commit(province, c)
  }

  const loading = load.phase === 'loading'
  const failed = load.phase === 'error' || load.phase === 'empty'

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Select
        label="省份"
        value={province}
        placeholder={loading ? '载入中…' : '请选择省份'}
        disabled={loading || failed}
        onChange={handleProvince}
        options={provinces.map((n) => ({ value: n, label: n }))}
      />
      <Select
        label="城市"
        value={city}
        placeholder={
          loading ? '载入中…' : province ? '请选择城市' : '请先选择省份'
        }
        disabled={loading || failed || !province}
        onChange={handleCity}
        options={cities.map((c) => ({ value: c.name, label: c.name }))}
      />

      {/* ---------- 载入失败：给出可见的重试入口 ---------- */}
      {failed && (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
          <p className="text-[clamp(0.875rem,0.95vw,1.125rem)] font-semibold leading-[1.7] text-ink/70">
            {load.phase === 'empty'
              ? '行政区划数据为空。'
              : `行政区划数据没能载入（${load.phase === 'error' ? load.message : '未知原因'}）。`}
            点一下就能重试。
          </p>
          <button
            type="button"
            onClick={() => void loadRegions()}
            className="btn-photon border-0 rounded-full px-5 py-2 text-[clamp(0.875rem,1vw,1.125rem)] font-semibold tracking-[0.18em] focus:outline-none"
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------- 下拉框 ---------- */
interface SelectProps {
  label: string
  value: string
  placeholder: string
  disabled?: boolean
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}

function Select({
  label,
  value,
  placeholder,
  disabled,
  onChange,
  options,
}: SelectProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[clamp(0.8125rem,0.85vw,1rem)] font-semibold tracking-[0.24em] text-ink-soft">
        {label}
      </span>
      <span className="underline-glow mt-1 block">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent pb-2 text-[clamp(1.125rem,1.3vw,1.6rem)] font-semibold text-ink outline-none disabled:text-ink-mute/50 [color-scheme:dark]"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
