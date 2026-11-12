/**
 * 真实星历 API 路由
 *
 *  v4.0：
 *  · /api/chart —— 由后端 Swiss Ephemeris 计算真实本命盘（含宫位与上升点）
 *  · /api/transit —— 行运数据，用于日 / 月 / 年运势的周期趋势
 *
 *  经纬度来自用户出生城市，是上升星座与宫位系统的决定性变量。
 *
 *  v9.0 · 时辰兼容
 *  ------------------------------------------------------------
 *  用户可能只知道出生时辰（子丑寅卯…）而不知道确切钟点。
 *  这时传入 `shichen`（时辰 key）与 `timeIsApproximate`：
 *
 *   · 后端按该时辰的**中点**计算星盘（保证结果确定、可复现）。
 *   · 同时返回 `timePrecision` 字段，说明本次计算的时间精度：
 *       'exact'      —— 用户给了确切钟点
 *       'shichen'    —— 两小时区间取中点
 *       'unknown'    —— 用户未提供时间（按正午推算）
 *   · 前端据此在界面上给出「上升宫位可能有偏差」的温和提示。
 */

import {
  computeNatalChart,
  computeTransits,
  computeAspects,
} from '../ephemeris.mjs'

/* ---------------- 十二时辰 ---------------- */

/**
 * 十二时辰定义。
 * 与前端 src/lib/calendar.ts 保持一致：
 * 子时 23:00–00:59，丑时 01:00–02:59，依次顺推，每段两小时。
 */
const SHICHEN = [
  { key: 'zi', name: '子时', startHour: 23, midHour: 0 },
  { key: 'chou', name: '丑时', startHour: 1, midHour: 2 },
  { key: 'yin', name: '寅时', startHour: 3, midHour: 4 },
  { key: 'mao', name: '卯时', startHour: 5, midHour: 6 },
  { key: 'chen', name: '辰时', startHour: 7, midHour: 8 },
  { key: 'si', name: '巳时', startHour: 9, midHour: 10 },
  { key: 'wu', name: '午时', startHour: 11, midHour: 12 },
  { key: 'wei', name: '未时', startHour: 13, midHour: 14 },
  { key: 'shen', name: '申时', startHour: 15, midHour: 16 },
  { key: 'you', name: '酉时', startHour: 17, midHour: 18 },
  { key: 'xu', name: '戌时', startHour: 19, midHour: 20 },
  { key: 'hai', name: '亥时', startHour: 21, midHour: 22 },
]

/** 由时辰 key 查出该时辰 */
function findShichen(key) {
  return SHICHEN.find((s) => s.key === key)
}

/* ---------------- 工具 ---------------- */

/** 从 body 中取出并校验出生信息 */
function readBirth(body = {}) {
  const date = String(body.date ?? '').trim()
  const latitude = Number(body.latitude)
  const longitude = Number(body.longitude)
  const timezone = Number.isFinite(Number(body.timezone))
    ? Number(body.timezone)
    : 8

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw httpError(400, '出生日期格式应为 YYYY-MM-DD。')
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw httpError(400, '缺少出生地的经纬度，无法计算上升点与宫位。')
  }
  if (latitude < -90 || latitude > 90) {
    throw httpError(400, '纬度超出有效范围（-90 ~ 90）。')
  }
  if (longitude < -180 || longitude > 180) {
    throw httpError(400, '经度超出有效范围（-180 ~ 180）。')
  }

  /* ---------- v9.0：时辰输入 ---------- */
  const shichenKey = String(body.shichen ?? '').trim()
  const rawTime = String(body.time ?? '').trim()

  /** 时间精度：exact 精确钟点 / shichen 两小时区间 / unknown 未提供 */
  let time = rawTime
  let precision = 'unknown'
  let shichenName = ''

  if (shichenKey) {
    const s = findShichen(shichenKey)
    if (!s) {
      throw httpError(400, '时辰无效，应为子丑寅卯辰巳午未申酉戌亥之一。')
    }
    /* 取该时辰的中点作为计算基准 */
    time = `${String(s.midHour).padStart(2, '0')}:00`
    precision = 'shichen'
    shichenName = s.name
  } else if (/^\d{2}:\d{2}$/.test(rawTime)) {
    precision = 'exact'
  } else {
    /* 未提供时间 —— 按正午推算 */
    time = '12:00'
    precision = 'unknown'
  }

  return {
    date,
    time,
    latitude,
    longitude,
    timezone,
    timePrecision: precision,
    shichenName,
  }
}

/** 构造带状态码的错误 */
function httpError(status, message) {
  const err = new Error(message)
  err.statusCode = status
  return err
}

/* ---------------- 路由注册 ---------------- */

/**
 * @param {import('express').Express} app
 */
export function registerEphemerisRoutes(app) {
  /* ---------- 真实本命盘 ---------- */
  app.post('/api/chart', (req, res) => {
    try {
      const birth = readBirth(req.body)
      const chart = computeNatalChart(birth)
      const aspects = computeAspects(chart.planets)

      res.json({
        ...chart,
        aspects,
        place: req.body?.place ?? '',
        houseSystem: 'P',
        houseSystemName: 'Placidus 时相宫',
        /* v9.0：时间精度透传给前端 */
        timePrecision: birth.timePrecision,
        shichenName: birth.shichenName,
      })
    } catch (err) {
      res
        .status(err?.statusCode ?? 500)
        .json({ error: err?.message ?? '星历计算失败。' })
    }
  })

  /* ---------- 行运（周期趋势） ---------- */
  app.post('/api/transit', (req, res) => {
    try {
      const body = req.body ?? {}
      const latitude = Number(body.latitude)
      const longitude = Number(body.longitude)
      const transits = computeTransits({
        latitude: Number.isFinite(latitude) ? latitude : 0,
        longitude: Number.isFinite(longitude) ? longitude : 0,
        timezone: Number.isFinite(Number(body.timezone))
          ? Number(body.timezone)
          : 8,
        date: body.date ?? new Date().toISOString().slice(0, 10),
        time: body.time ?? '12:00',
      })
      res.json(transits)
    } catch (err) {
      res
        .status(err?.statusCode ?? 500)
        .json({ error: err?.message ?? '行运计算失败。' })
    }
  })
}
