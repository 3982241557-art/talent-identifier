import { REGIONS, type ProvinceTuple } from './regions'

/* ============================================================
 *  出生地级联选择 —— 中国省 / 市 / 区县
 *
 *  数据内置于 src/data/regions.ts（离线，无地理 API 依赖）。
 *  已剔除全部海外城市与国家，只保留中国行政区划。
 *
 *  v10.0 · 彻底消灭「数据断流」—— 改为**静态内联**
 *  ------------------------------------------------------------
 *  【历史事故】
 *  这份数据曾经被拆成独立 lazy chunk（`regions-*.js`），
 *  由 Cascader 挂载时动态 import。
 *
 *  线上实测（Cloudflare Workers + Chrome）反复出现：
 *
 *      REQ /assets/regions-xxxx.js   ← 发起了
 *      （无 response / 无 failed）      ← 永远不落地
 *
 *  浏览器对**同一 specifier** 的模块记录会缓存「失败 / 挂起」状态，
 *  于是重试全部无效，表单永远停在「载入中…」，
 *  用户在**第一步就断头**，根本走不到星盘。
 *
 *  【为什么不能只靠重试救回来】
 *  · 同 specifier 重试 → 复用挂起的模块记录 → 必然继续挂起
 *  · `?bust=N` 换 specifier → 需要先知道真实 chunk URL，
 *    而挂起的请求**不会**被写进 Resource Timing，兜底逻辑直接失效
 *  · 超时重试 3 轮 × 12s = 36s 白等，UI 全程「载入中…」
 *
 *  【终极解法：不发这个请求】
 *  省市区数据只有 ~100KB，且是**紧凑元组**格式，
 *  gzip 后仅 ~28KB。把它**静态内联进主 bundle**，
 *  换来的确定性远大于那 28KB：
 *
 *    · 首屏不再有第二个网络往返
 *    · 不存在 chunk 404 / QUIC 断流 / ESM 失败记录毒化
 *    · 离线、Safari 隐私模式、CDN 冷启动全部免疫
 *
 *  下面的 `loadRegions()` 保留 **async 签名**（调用方无需改动），
 *  但内部已是同步命中 —— 永远不会 reject、永远不会超时。
 * ============================================================ */

/** 静态内联的数据（构建期直接打进主 bundle） */
const INLINE_REGIONS: ProvinceTuple[] = REGIONS

/** 尚未载入时的占位（首帧同步可用） */
let REGION_CACHE: ProvinceTuple[] | null = INLINE_REGIONS

/** 正在进行中的载入 Promise —— 防止并发重复导入 */
let PENDING: Promise<ProvinceTuple[]> | null = null

/** 单次载入的超时时间（毫秒）—— 保留以兼容既有签名 */
const LOAD_TIMEOUT = 12_000
void LOAD_TIMEOUT

/** 超时后构造一个带标记的错误 */
class RegionLoadError extends Error {
  readonly reason: string
  constructor(message: string, reason?: unknown) {
    super(message)
    this.name = 'RegionLoadError'
    this.reason = message
    void reason
  }
}

/**
 * 载入省市区数据。
 *
 * 幂等：并发调用共享同一个 Promise；
 * 数据已静态内联，因此**永远成功**，不会再出现「载入中…」。
 */
export async function loadRegions(): Promise<ProvinceTuple[]> {
  if (REGION_CACHE) return REGION_CACHE
  if (PENDING) return PENDING

  PENDING = (async () => {
    try {
      if (!Array.isArray(INLINE_REGIONS) || INLINE_REGIONS.length === 0) {
        throw new RegionLoadError('行政区划数据为空')
      }
      REGION_CACHE = INLINE_REGIONS
      return INLINE_REGIONS
    } catch (err) {
      /* 失败不缓存，允许重试 */
      REGION_CACHE = null
      throw err instanceof Error
        ? err
        : new RegionLoadError('行政区划数据载入失败', err)
    } finally {
      PENDING = null
    }
  })()

  return PENDING
}

/* ============================================================
 *  破除 ESM 失败记录毒化的兜底载入
 *  ------------------------------------------------------------
 *  v10.0：数据已静态内联，**不再需要任何运行时网络兜底**。
 *  下面这一整套「cache-buster 重试」逻辑已彻底移除 ——
 *  它依赖 Resource Timing 定位真实 chunk URL，
 *  而挂起（而非失败）的请求根本不会被写进 Resource Timing，
 *  在最需要它的场景下反而是失效的。
 * ============================================================ */

/**
 * 带重试的载入。
 *
 * 数据已静态内联，重试只是形式上的保险；
 * 保留该函数是为了兼容既有调用方。
 */
export async function loadRegionsWithRetry(
  attempts = 3,
): Promise<ProvinceTuple[]> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await loadRegions()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        const wait = 400 * Math.pow(2, i) // 400ms → 800ms
        await new Promise((r) => setTimeout(r, wait))
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new RegionLoadError('行政区划数据载入失败', lastErr)
}

/** 当前是否已有缓存（供 UI 判断能否立即渲染） */
export function hasRegionsCache(): boolean {
  return REGION_CACHE !== null
}

export interface CityEntry {
  /** 完整地名，如「浙江省 杭州市 西湖区」 */
  name: string
  lat: number
  lon: number
  /** 所属省份 */
  province: string
  /** 所属城市 */
  city: string
  /** 所属区县（无则为空） */
  district: string
}

/** 省级列表（需要先 await loadRegions()） */
export function getProvinces(regions = REGION_CACHE): string[] {
  return (regions ?? []).map((p) => p[0])
}

/** 取某省下的城市 */
export function citiesOf(
  province: string,
  regions = REGION_CACHE,
): Array<{ name: string; lon: number; lat: number }> {
  const p = regions?.find((x) => x[0] === province)
  if (!p) return []
  return p[3].map((c) => ({ name: c[0], lon: c[1], lat: c[2] }))
}

/** 取某市下的区县 —— v10.0 起数据只到「市」一级，此处保留兼容 */
export function districtsOf(
  province: string,
  city: string,
  regions = REGION_CACHE,
): Array<{ name: string; lon: number; lat: number }> {
  void province
  void city
  void regions
  return []
}

/**
 * 扁平化全部可选地点，键为「省_市」，值为坐标。
 * 用于校验前端传入的出生地是否合法。
 */
export function buildPlaceIndex(
  regions: ProvinceTuple[],
): Record<string, CityEntry> {
  const map: Record<string, CityEntry> = {}
  for (const p of regions) {
    for (const c of p[3]) {
      const key = `${p[0]}_${c[0]}`
      map[key] = {
        name: `${p[0]} ${c[0]}`,
        lat: c[2],
        lon: c[1],
        province: p[0],
        city: c[0],
        district: '',
      }
    }
  }
  return map
}

/** 依据「省 / 市」查找坐标（district 参数保留兼容，已不再细分） */
export function lookupPlace(
  province: string,
  city: string,
  district: string,
  index?: Record<string, CityEntry>,
): CityEntry | null {
  void district
  const map = index ?? (REGION_CACHE ? buildPlaceIndex(REGION_CACHE) : null)
  if (!map) return null
  return map[`${province}_${city}`] ?? null
}

export type { ProvinceTuple }
