import type { ProvinceTuple } from './regions'

/* ============================================================
 *  出生地级联选择 —— 中国省 / 市 / 区县
 *
 *  数据内置于 src/data/regions.ts（离线，无地理 API 依赖）。
 *  已剔除全部海外城市与国家，只保留中国行政区划。
 *
 *  体积优化：省市区数据约 100KB，放在独立 chunk，
 *  由 Cascader 在挂载时按需动态载入，不阻塞首屏。
 *
 *  v9.0 · 数据断流修复
 *  ------------------------------------------------------------
 *  旧实现有一个致命缺陷：
 *
 *      loadRegions().then((r) => setRegions(r))
 *
 *  —— **没有 .catch()**。
 *
 *  一旦动态 import 失败（chunk 404、CDN 缓存未命中、
 *  网络抖动、Service Worker 缓存过期），Promise reject，
 *  `regions` 就永远停在 `null`，
 *  UI 于是永久显示「载入中…」，用户完全无法选择省市。
 *
 *  v9.0 的修法（三重保险）：
 *   1. **超时兜底** —— Promise.race 加超时，避免无限挂起。
 *   2. **自动重试** —— 失败后指数退避重试两次。
 *   3. **可见错误态** —— 彻底失败时显示「重试」按钮，
 *      而不是永远转圈；同时把失败原因透传给调用方。
 * ============================================================ */

/** 尚未载入时的占位（首屏不加载数据） */
let REGION_CACHE: ProvinceTuple[] | null = null

/** 正在进行中的载入 Promise —— 防止并发重复导入 */
let PENDING: Promise<ProvinceTuple[]> | null = null

/** 单次载入的超时时间（毫秒） */
const LOAD_TIMEOUT = 12_000

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
 * 失败时清空缓存，允许后续重试。
 */
export async function loadRegions(): Promise<ProvinceTuple[]> {
  if (REGION_CACHE) return REGION_CACHE
  if (PENDING) return PENDING

  PENDING = (async () => {
    /* ---- 1. 超时兜底：绝不让 UI 无限等待 ---- */
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new RegionLoadError('行政区划数据载入超时')),
        LOAD_TIMEOUT,
      ),
    )

    try {
      /*
       * 注意：这里 **不能** 加 `@vite-ignore`。
       *
       * `vite-ignore` 会让 Vite 跳过动态 import 的重写，
       * 浏览器在运行时按模块 URL 解析 `./regions`，
       * 结果请求 `/assets/regions` → 404。
       * 保留它反而是"数据断流"的真凶。
       */
      const mod = await Promise.race([
        import('./regions'),
        timeout,
      ])
      const list = (mod as { REGIONS: ProvinceTuple[] }).REGIONS
      if (!Array.isArray(list) || list.length === 0) {
        throw new RegionLoadError('行政区划数据为空')
      }
      REGION_CACHE = list
      return list
    } catch (err) {
      /*
       * v9.2 · 破除「ESM 失败记录毒化」
       * ------------------------------------------------------------
       *  【致命症状】
       *  线上偶发 `net::ERR_QUIC_PROTOCOL_ERROR`（或 ERR_CONNECTION_RESET
       *  / ERR_EMPTY_RESPONSE）导致 regions chunk 第一次拉取失败，
       *  表单永远卡在「载入中…」，用户完全走不下去 —— 整条链路断头。
       *
       *  【为什么原来的重试完全没用】
       *  浏览器对 ES 模块有**按 specifier 缓存**的语义：
       *  某个 specifier 一旦加载失败，浏览器会把这个失败**记进模块图**，
       *  之后用**同一个 specifier** 再 import，
       *  会**直接复用那条失败记录**，连网络请求都不会再发。
       *
       *  所以 `loadRegionsWithRetry()` 里三次同 specifier 的重试
       *  全都是「瞬间失败」，重试逻辑形同虚设。
       *
       *  【解法：换 specifier —— 用 cache-buster 重试】
       *  失败后拼一个 `?bust=N` 的**全新 specifier** 再 import。
       *  浏览器没有这个 specifier 的模块记录，
       *  于是会真正发起一次新的网络请求。
       */
      const recovered = await loadRegionsWithCacheBust()
      if (recovered) {
        REGION_CACHE = recovered
        return recovered
      }
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
 * ============================================================ */

/** cache-buster 计数 —— 每次重试换一个全新 specifier */
let bustCounter = 0

/**
 * 找出刚才失败的那个 chunk 的真实 URL。
 *
 * 为什么需要它：
 *   构建后 chunk 文件名带哈希（`regions-B6EnGjnX.js`），
 *   源码里写不出来，只能运行时从 Resource Timing 里捞 ——
 *   实测**失败的请求也会被记录进 Resource Timing**，
 *   所以失败后仍能定位到确切 URL。
 *
 * 匹配方式：文件名以 `regions-` 开头且以 `.js` 结尾。
 */
function findRegionsChunkUrl(): string | null {
  if (typeof performance === 'undefined') return null
  try {
    const entries = performance.getEntriesByType(
      'resource',
    ) as PerformanceResourceTiming[]
    for (let i = entries.length - 1; i >= 0; i--) {
      const name = entries[i].name
      const file = name.split('/').pop() ?? ''
      if (/^regions-[A-Za-z0-9_-]+\.js$/.test(file)) return name
    }
  } catch {
    /* Performance API 不可用（老浏览器 / 隐私模式） */
  }
  return null
}

/**
 * 用**全新 specifier** 再试一次（绕过 ESM 的失败记录缓存）。
 *
 * 返回成功则给出数据；全部失败则返回 null，交由上层报错。
 */
async function loadRegionsWithCacheBust(): Promise<ProvinceTuple[] | null> {
  const base = findRegionsChunkUrl()
  if (!base) return null

  /* 依次尝试 2 个不同的 cache-buster */
  for (let i = 0; i < 2; i++) {
    const sep = base.includes('?') ? '&' : '?'
    const spec = `${base}${sep}bust=${++bustCounter}`
    try {
      /*
       * `@vite-ignore` 在这里是**必须的**：
       * 这个 specifier 是运行时拼出来的，Vite 无法在构建期重写它。
       * 我们已经拿到了构建产物的真实 URL，
       * 浏览器会直接按这个绝对地址去取 —— 正是我们要的。
       */
      const mod = await import(/* @vite-ignore */ spec)
      const list = (mod as { REGIONS?: ProvinceTuple[] }).REGIONS
      if (Array.isArray(list) && list.length > 0) return list
    } catch {
      /* 试下一个 specifier */
    }
  }
  return null
}

/**
 * 带重试的载入。
 *
 * 指数退避：第 1 次等 400ms，第 2 次等 900ms。
 * 网络类错误（chunk 加载失败）在缓存预热后重试成功率很高。
 *
 * ⚠️ 注意：同 specifier 的重试会被浏览器的 ESM 失败记录缓存「毒化」，
 *    所以真正的兜底在 `loadRegions()` 内部的
 *    `loadRegionsWithCacheBust()` —— 那里会换一个全新 specifier。
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

/** 取某市下的区县 */
export function districtsOf(
  province: string,
  city: string,
  regions = REGION_CACHE,
): Array<{ name: string; lon: number; lat: number }> {
  const p = regions?.find((x) => x[0] === province)
  const c = p?.[3].find((x) => x[0] === city)
  if (!c) return []
  return c[3].map((d) => ({ name: d[0], lon: d[1], lat: d[2] }))
}

/**
 * 扁平化全部可选地点，键为「省_市_区」，值为坐标。
 * 用于校验前端传入的出生地是否合法。
 */
export function buildPlaceIndex(
  regions: ProvinceTuple[],
): Record<string, CityEntry> {
  const map: Record<string, CityEntry> = {}
  for (const p of regions) {
    for (const c of p[3]) {
      for (const d of c[3]) {
        const key = `${p[0]}_${c[0]}_${d[0]}`
        map[key] = {
          name: `${p[0]} ${c[0]} ${d[0]}`,
          lat: d[2],
          lon: d[1],
          province: p[0],
          city: c[0],
          district: d[0],
        }
      }
      // 少数直辖县级市（东莞、中山、儋州等）无下级区县
      if (c[3].length === 0) {
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
  }
  return map
}

/** 依据「省 / 市 / 区县」三元组查找坐标 */
export function lookupPlace(
  province: string,
  city: string,
  district: string,
  index?: Record<string, CityEntry>,
): CityEntry | null {
  const map = index ?? (REGION_CACHE ? buildPlaceIndex(REGION_CACHE) : null)
  if (!map) return null
  if (district) {
    return map[`${province}_${city}_${district}`] ?? null
  }
  return map[`${province}_${city}`] ?? null
}

export type { ProvinceTuple }
