/**
 * TANYA SDA — Cloudflare Worker AI-Agent Backend
 * Portal WebGIS Sebaran DI Kewenangan Provinsi Jawa Timur (Dinas PU SDA Jatim)
 *
 * Architecture:
 * - Primary Model   : gemini-3.8-flash (fast fail-over if unavailable/503/timeout)
 * - Fallback Model  : gemini-4-hydrogen (per user specification)
 * - Resilience Net  : gemini-3.5-flash (ONLY on transient 503/timeout outage; never bypasses 429 quota lock)
 * - Daily Quota     : Durable Object SQLite (QuotaGuard) keyed by WIB date (Asia/Jakarta, UTC+7)
 *                     Hard daily cap + automatic 429 daily circuit breaker -> 0 risk of unexpected Gemini billing.
 */

const ALLOWED_ORIGINS = [
  'https://i-shen.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'null'
];

const SYSTEM_PROMPT = `Anda adalah "Tanya SDA", Asisten AI Geospasial resmi untuk Portal WebGIS "Sebaran Daerah Irigasi (DI) Kewenangan Provinsi Jawa Timur" milik Dinas Pekerjaan Umum Sumber Daya Air (PU SDA) Provinsi Jawa Timur (Update Skema 2025/2026).

ATURAN KETAT (WAJIB DIPATUHI):
1. AKURASI & ANTI-HALUSINASI:
   - Inventaris resmi sistem: 188 Daerah Irigasi (DI), 10 UPT / Korwil, 47.853 fitur spasial (setelah deduplikasi), 6 Wilayah Sungai (WS), dan 1.800 poligon Aset Tanah [Data Simulasi].
   - HANYA sebutkan nama DI, nama sungai, kode/nama aset tanah, UPT, Wilayah Sungai, jarak (km/m), luas (ha/m²), panjang (km), jumlah objek, dan koordinat yang ADA DI DALAM JSON "spatialContext" yang diberikan pada pesan ini.
   - DILARANG KERAS mengarang nama DI, angka jarak, angka luas, atau status sertifikat di luar data sumber. Jika data tidak tersedia pada konteks, nyatakan secara jujur dan arahkan pengguna memilih titik di peta atau menanyakan nama DI/UPT yang tersedia.
2. LABEL DATA SIMULASI:
   - Setiap kali Anda menyebut data layer Aset Tanah & Sempadan (aset_tanah.json), WAJIB sertakan label "[Data Simulasi]" dan jelaskan bahwa data tersebut adalah data simulasi uji coba (bukan sertifikat BPN final).
3. GAYA BAHASA & TARGET PENGGUNA:
   - 90% pengguna adalah petugas lapangan (O&P) di smartphone, 10% adalah pimpinan/staf di kantor.
   - Gunakan Bahasa Indonesia yang jelas, ringkas, taktis, sopan, dan mudah dipindai cepat di layar HP.
   - Gunakan format angka koma desimal gaya Indonesia untuk jarak pada teks (contoh: "0,82 km" atau "450 m"), namun pada field numerik JSON tetap gunakan angka standar (misal 0.82).
4. FORMAT OUTPUT WAJIB JSON VALID (tanpa markdown fence) dengan skema persis berikut:
{
  "answer": "Ringkasan jawaban jelas 1-3 kalimat sesuai pertanyaan pengguna. Jangan ulangi daftar panjang jika sudah masuk ke array cards.",
  "cards": [
    {
      "rank": 1,
      "type": "di" | "river" | "aset" | "upt" | "ws",
      "id": 123,
      "name": "Nama DI / Sungai / Aset / UPT",
      "meta": "Info ringkas (UPT / DAS / Kategori [Data Simulasi] / jumlah DI)",
      "distance_km": 0.82,
      "distance_label": "0,82 km",
      "lat": -7.75,
      "lon": 113.21,
      "is_simulated": false
    }
  ],
  "location_label": "Nama wilayah/kabupaten/UPT/WS referensi (contoh: Kab. Probolinggo, Jatim atau Provinsi Jawa Timur)",
  "assumption": "Penjelasan singkat asumsi lokasi/sumber data (contoh: Lokasi referensi menggunakan titik target peta saat ini / pusat layar peta / nama wilayah yang disebut).",
  "map_action": {
    "type": "none" | "pinpoint_nearest" | "highlight_di" | "highlight_multiple_di" | "filter_upt" | "focus_ws" | "show_rivers" | "show_aset" | "fly_to",
    "di_id": null,
    "di_ids": [],
    "lat": null,
    "lon": null,
    "upt": null,
    "ws_slug": null,
    "aset_category": null,
    "label": null
  },
  "follow_ups": ["Pertanyaan lanjutan singkat 1", "Pertanyaan lanjutan singkat 2", "Pertanyaan lanjutan singkat 3"]
}

PANDUAN PEMILIHAN map_action:
- Jika pengguna bertanya "DI terdekat", "5 DI terdekat", "DI di sekitar lokasi ini / koordinat X / kota Y": isi "cards" dengan hingga 5 DI terdekat dari spatialContext.nearestDis, dan set map_action.type = "pinpoint_nearest" dengan lat, lon dari spatialContext.referencePoint dan di_ids berisi id 5 DI terdekat.
- Jika pengguna menanyakan detail / ringkasan 1 DI spesifik (misal "DI Sumber Tekik" atau "Ringkas DI ini"): set map_action.type = "highlight_di" dengan di_id sesuai id DI pada spatialContext.
- Jika pengguna bertanya tentang daftar DI pada UPT/Korwil tertentu (misal "DI di Korwil Malang" atau "UPT Pasuruan"): set map_action.type = "filter_upt" dengan upt persis seperti nama resmi di spatialContext.uptSummary.
- Jika pengguna bertanya tentang sungai terdekat / DAS / Wilayah Sungai: isi cards dari spatialContext.nearestRivers atau spatialContext.wsList, dan set map_action.type = "show_rivers" atau "focus_ws" dengan ws_slug terkait.
- Jika pengguna bertanya tentang aset tanah / sempadan: isi cards dari spatialContext.nearestAset (set is_simulated: true, meta wajib memuat "[Data Simulasi]"), dan set map_action.type = "show_aset" dengan lat, lon dan aset_category (atau "ALL").
- Jika hanya pertanyaan umum/statistik: map_action.type = "none".
- Pastikan "follow_ups" selalu berisi 3 chip singkat (maks 4 kata per chip) yang relevan dengan konteks WebGIS.`;

function getWibDateInfo(now = new Date()) {
  // WIB is always UTC+7 (no DST)
  const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const year = wib.getUTCFullYear();
  const month = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wib.getUTCDate()).padStart(2, '0');
  const dateWib = `${year}-${month}-${day}`;

  // Next midnight WIB in UTC
  const nextMidnightWibUtcMs = Date.UTC(year, wib.getUTCMonth(), wib.getUTCDate() + 1, 0, 0, 0) - 7 * 60 * 60 * 1000;
  const nextResetIso = new Date(nextMidnightWibUtcMs).toISOString();
  const msUntilReset = Math.max(0, nextMidnightWibUtcMs - now.getTime());
  const hoursLeft = Math.floor(msUntilReset / 3600000);
  const minsLeft = Math.floor((msUntilReset % 3600000) / 60000);

  return {
    dateWib,
    resetAtWib: '00:00 WIB',
    nextResetIso,
    timeUntilResetLabel: `${hoursLeft} jam ${minsLeft} menit`
  };
}

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  let allowOrigin = 'https://i-shen.github.io';
  if (!origin) {
    allowOrigin = '*';
  } else if (
    ALLOWED_ORIGINS.some((prefix) => origin === prefix || origin.startsWith(prefix + ':')) ||
    origin.endsWith('.github.io') ||
    origin.endsWith('.workers.dev')
  ) {
    allowOrigin = origin;
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-App',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(payload, status = 200, request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...getCorsHeaders(request)
    }
  });
}

/**
 * Durable Object: Strictly enforces daily free-tier quota & RPM guard
 * Uses SQLite storage (free-tier eligible on Cloudflare Workers) for atomic persistence.
 */
export class QuotaGuard {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.recentGlobalHits = [];
    this.recentIpHits = new Map();
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS daily_quota (
          date_wib TEXT PRIMARY KEY,
          used_count INTEGER NOT NULL DEFAULT 0,
          daily_limit INTEGER NOT NULL DEFAULT 150,
          locked INTEGER NOT NULL DEFAULT 0,
          lock_reason TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );
      `);
    });
  }

  getDailyLimit() {
    const parsed = parseInt(this.env.DAILY_LIMIT || '150', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 150;
  }

  getRpmLimit() {
    const parsed = parseInt(this.env.RPM_LIMIT || '10', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  }

  ensureTodayRow(dateWib) {
    const limit = this.getDailyLimit();
    const nowIso = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO daily_quota (date_wib, used_count, daily_limit, locked, lock_reason, updated_at)
       VALUES (?, 0, ?, 0, '', ?)`,
      dateWib,
      limit,
      nowIso
    );
    const rows = this.ctx.storage.sql
      .exec(`SELECT date_wib, used_count, daily_limit, locked, lock_reason, updated_at FROM daily_quota WHERE date_wib = ?`, dateWib)
      .toArray();
    const row = rows[0] || {
      date_wib: dateWib,
      used_count: 0,
      daily_limit: limit,
      locked: 0,
      lock_reason: ''
    };
    // Always honor latest configured DAILY_LIMIT env var
    const effectiveLimit = limit;
    const used = Number(row.used_count || 0);
    const locked = Number(row.locked || 0) === 1 || used >= effectiveLimit;
    const remaining = locked ? 0 : Math.max(0, effectiveLimit - used);
    const info = getWibDateInfo();
    return {
      dateWib,
      used,
      limit: effectiveLimit,
      remaining,
      exhausted: locked,
      lockReason: row.lock_reason || (used >= effectiveLimit ? 'Batas aman kuota harian (free tier) telah tercapai.' : ''),
      resetAtWib: info.resetAtWib,
      nextResetIso: info.nextResetIso,
      timeUntilResetLabel: info.timeUntilResetLabel
    };
  }

  pruneSlidingWindows(nowMs) {
    const cutoff = nowMs - 60000;
    this.recentGlobalHits = this.recentGlobalHits.filter((t) => t > cutoff);
    for (const [ip, hits] of this.recentIpHits.entries()) {
      const kept = hits.filter((t) => t > cutoff);
      if (kept.length === 0) this.recentIpHits.delete(ip);
      else this.recentIpHits.set(ip, kept);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const { dateWib } = getWibDateInfo();

    if (url.pathname === '/status') {
      const quota = this.ensureTodayRow(dateWib);
      return Response.json(quota);
    }

    if (url.pathname === '/consume' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const ipKey = String(body.ipKey || 'anon');
      const quota = this.ensureTodayRow(dateWib);

      if (quota.exhausted) {
        return Response.json({ allowed: false, code: 'QUOTA_EXHAUSTED', quota }, { status: 429 });
      }

      const nowMs = Date.now();
      this.pruneSlidingWindows(nowMs);
      const rpmLimit = this.getRpmLimit();
      const ipHits = this.recentIpHits.get(ipKey) || [];

      if (this.recentGlobalHits.length >= rpmLimit || ipHits.length >= Math.min(6, rpmLimit)) {
        return Response.json(
          {
            allowed: false,
            code: 'RATE_LIMITED',
            retryAfterSec: 15,
            quota
          },
          { status: 429 }
        );
      }

      const nextUsed = quota.used + 1;
      const shouldLock = nextUsed >= quota.limit ? 1 : 0;
      const lockReason = shouldLock ? 'Batas aman kuota harian (free tier) telah tercapai.' : '';
      this.ctx.storage.sql.exec(
        `UPDATE daily_quota
         SET used_count = ?, daily_limit = ?, locked = CASE WHEN locked = 1 THEN 1 ELSE ? END,
             lock_reason = CASE WHEN lock_reason != '' THEN lock_reason ELSE ? END,
             updated_at = ?
         WHERE date_wib = ?`,
        nextUsed,
        quota.limit,
        shouldLock,
        lockReason,
        new Date().toISOString(),
        dateWib
      );

      this.recentGlobalHits.push(nowMs);
      ipHits.push(nowMs);
      this.recentIpHits.set(ipKey, ipHits);

      const updated = this.ensureTodayRow(dateWib);
      return Response.json({ allowed: true, quota: updated });
    }

    if (url.pathname === '/refund' && request.method === 'POST') {
      this.ensureTodayRow(dateWib);
      this.ctx.storage.sql.exec(
        `UPDATE daily_quota
         SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END,
             updated_at = ?
         WHERE date_wib = ? AND locked = 0`,
        new Date().toISOString(),
        dateWib
      );
      return Response.json(this.ensureTodayRow(dateWib));
    }

    if (url.pathname === '/lock' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const reason = String(body.reason || 'Kuota harian Gemini API free tier terdeteksi habis (HTTP 429).').slice(0, 240);
      this.ensureTodayRow(dateWib);
      this.ctx.storage.sql.exec(
        `UPDATE daily_quota
         SET locked = 1, lock_reason = ?, updated_at = ?
         WHERE date_wib = ?`,
        reason,
        new Date().toISOString(),
        dateWib
      );
      return Response.json(this.ensureTodayRow(dateWib));
    }

    return new Response('Not Found', { status: 404 });
  }
}

function getQuotaStub(env) {
  const id = env.QUOTA_GUARD.idFromName('global-daily-quota-v1');
  return env.QUOTA_GUARD.get(id);
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-6)
    .filter((item) => item && (item.role === 'user' || item.role === 'model') && typeof item.text === 'string' && item.text.trim())
    .map((item) => ({
      role: item.role,
      parts: [{ text: item.text.trim().slice(0, 600) }]
    }));
}

function parseJsonSafe(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  let cleaned = rawText.trim();
  // Strip accidental markdown fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeAgentResponse(parsed, rawFallbackText) {
  if (!parsed || typeof parsed !== 'object') {
    return {
      answer: (rawFallbackText || 'Maaf, saya belum bisa memproses jawaban terstruktur. Silakan coba lagi.').slice(0, 1200),
      cards: [],
      location_label: 'Provinsi Jawa Timur',
      assumption: 'Jawaban dihasilkan dari data spasial WebGIS Dinas PU SDA Provinsi Jawa Timur.',
      map_action: { type: 'none' },
      follow_ups: ['5 DI Terdekat', 'Sungai Terdekat', 'Aset Tanah']
    };
  }

  const cards = Array.isArray(parsed.cards)
    ? parsed.cards.slice(0, 8).map((c, idx) => ({
        rank: Number(c.rank) || idx + 1,
        type: ['di', 'river', 'aset', 'upt', 'ws'].includes(c.type) ? c.type : 'di',
        id: c.id ?? null,
        name: String(c.name || '-').slice(0, 120),
        meta: String(c.meta || '').slice(0, 180),
        distance_km: typeof c.distance_km === 'number' && Number.isFinite(c.distance_km) ? Number(c.distance_km.toFixed(2)) : null,
        distance_label: c.distance_label ? String(c.distance_label).slice(0, 40) : null,
        lat: typeof c.lat === 'number' && Number.isFinite(c.lat) ? c.lat : null,
        lon: typeof c.lon === 'number' && Number.isFinite(c.lon) ? c.lon : null,
        is_simulated: Boolean(c.is_simulated || c.type === 'aset')
      }))
    : [];

  const validActions = [
    'none',
    'pinpoint_nearest',
    'highlight_di',
    'highlight_multiple_di',
    'filter_upt',
    'focus_ws',
    'show_rivers',
    'show_aset',
    'fly_to'
  ];
  const rawAction = parsed.map_action && typeof parsed.map_action === 'object' ? parsed.map_action : {};
  const map_action = {
    type: validActions.includes(rawAction.type) ? rawAction.type : 'none',
    di_id: Number.isFinite(Number(rawAction.di_id)) && rawAction.di_id !== null ? Number(rawAction.di_id) : null,
    di_ids: Array.isArray(rawAction.di_ids)
      ? rawAction.di_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n)).slice(0, 5)
      : [],
    lat: typeof rawAction.lat === 'number' && Number.isFinite(rawAction.lat) ? rawAction.lat : null,
    lon: typeof rawAction.lon === 'number' && Number.isFinite(rawAction.lon) ? rawAction.lon : null,
    upt: rawAction.upt ? String(rawAction.upt).slice(0, 80) : null,
    ws_slug: rawAction.ws_slug ? String(rawAction.ws_slug).slice(0, 40) : null,
    aset_category: rawAction.aset_category ? String(rawAction.aset_category).slice(0, 60) : null,
    label: rawAction.label ? String(rawAction.label).slice(0, 100) : null
  };

  const follow_ups = Array.isArray(parsed.follow_ups) && parsed.follow_ups.length > 0
    ? parsed.follow_ups.slice(0, 3).map((s) => String(s).slice(0, 45))
    : ['5 DI Terdekat', 'Sungai Terdekat', 'Aset Tanah'];

  return {
    answer: String(parsed.answer || 'Berikut informasi spasial yang ditemukan berdasarkan data Dinas PU SDA Jawa Timur.').slice(0, 1800),
    cards,
    location_label: String(parsed.location_label || 'Provinsi Jawa Timur').slice(0, 120),
    assumption: String(parsed.assumption || 'Berdasarkan data spasial resmi Dinas PU SDA Prov. Jawa Timur.').slice(0, 260),
    map_action,
    follow_ups
  };
}

async function callGeminiModel({ apiKey, model, contents, timeoutMs }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);

  const generationConfig = {
    temperature: 0.2,
    topP: 0.9,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json'
  };
  // Disable excessive thinking tokens on Gemini 3.8 / 4 models so JSON stays fast & never truncates
  if (/gemini-(3\.8|4)/i.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents,
        generationConfig
      })
    });

    const bodyText = await res.text();
    let json = null;
    try {
      json = JSON.parse(bodyText);
    } catch {
      json = null;
    }

    if (!res.ok) {
      const errMsg = json?.error?.message || bodyText.slice(0, 240);
      const isQuota = res.status === 429 || /quota|resource_exhausted|exceeded/i.test(errMsg);
      return {
        ok: false,
        status: res.status,
        isQuota,
        isUnavailable: res.status === 404 || res.status === 503 || res.status === 500 || res.status === 504,
        error: errMsg
      };
    }

    const parts = json?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    const finishReason = json?.candidates?.[0]?.finishReason || 'STOP';
    if (!text) {
      return {
        ok: false,
        status: 502,
        isQuota: false,
        isUnavailable: true,
        error: `Empty candidate text (finishReason=${finishReason})`
      };
    }

    if (finishReason === 'MAX_TOKENS' && !parseJsonSafe(text)) {
      return {
        ok: false,
        status: 502,
        isQuota: false,
        isUnavailable: true,
        error: `Truncated JSON output (finishReason=MAX_TOKENS)`
      };
    }

    return {
      ok: true,
      model,
      text,
      usage: json?.usageMetadata || null
    };
  } catch (err) {
    const isTimeout = err?.name === 'AbortError' || String(err).includes('timeout');
    return {
      ok: false,
      status: isTimeout ? 504 : 502,
      isQuota: false,
      isUnavailable: true,
      error: isTimeout ? `Timeout after ${timeoutMs}ms` : String(err?.message || err)
    };
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    const url = new URL(request.url);
    const primaryModel = env.PRIMARY_MODEL || 'gemini-3.8-flash';
    const fallbackModel = env.FALLBACK_MODEL || 'gemini-4-hydrogen';
    const resilienceModel = env.RESILIENCE_MODEL || 'gemini-3.5-flash';

    try {
      const quotaStub = getQuotaStub(env);

      // GET /health
      if (url.pathname === '/health' || url.pathname === '/') {
        const qRes = await quotaStub.fetch('https://quota/status');
        const quota = await qRes.json();
        return jsonResponse(
          {
            ok: true,
            service: 'Tanya SDA AI-Agent Worker',
            region: 'Jawa Timur - Dinas PU SDA',
            models: {
              primary: primaryModel,
              fallback: fallbackModel,
              resilience503Only: resilienceModel
            },
            apiKeyConfigured: Boolean(env.GEMINI_API_KEY),
            quota
          },
          200,
          request
        );
      }

      // GET /api/quota
      if (url.pathname === '/api/quota' && request.method === 'GET') {
        const qRes = await quotaStub.fetch('https://quota/status');
        const quota = await qRes.json();
        return jsonResponse({ ok: true, quota }, 200, request);
      }

      // POST /api/chat
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        if (!env.GEMINI_API_KEY) {
          return jsonResponse(
            {
              ok: false,
              code: 'CONFIG_ERROR',
              message: 'GEMINI_API_KEY belum dikonfigurasi pada Cloudflare Worker Secret.'
            },
            500,
            request
          );
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body.message !== 'string' || !body.message.trim()) {
          return jsonResponse(
            { ok: false, code: 'BAD_REQUEST', message: 'Pertanyaan tidak boleh kosong.' },
            400,
            request
          );
        }

        const userMessage = body.message.trim().slice(0, 800);
        const rawContext = body.spatialContext && typeof body.spatialContext === 'object' ? body.spatialContext : {};
        let contextJson = JSON.stringify(rawContext);
        if (contextJson.length > 26000) {
          contextJson = contextJson.slice(0, 26000) + '..."}';
        }

        // 1. Atomic quota & rate-limit reservation BEFORE calling Gemini
        const ipKey = request.headers.get('CF-Connecting-IP') || 'anon';
        const consumeRes = await quotaStub.fetch('https://quota/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ipKey })
        });
        const consumeData = await consumeRes.json();

        if (!consumeData.allowed) {
          if (consumeData.code === 'QUOTA_EXHAUSTED') {
            return jsonResponse(
              {
                ok: false,
                code: 'QUOTA_EXHAUSTED',
                message: `Kuota harian AI-Agent (Free Tier) telah habis (${consumeData.quota.used}/${consumeData.quota.limit}). Pertanyaan AI dinonaktifkan sementara hingga reset harian pukul ${consumeData.quota.resetAtWib} (${consumeData.quota.timeUntilResetLabel} lagi) untuk mencegah biaya tambahan.`,
                quota: consumeData.quota
              },
              429,
              request
            );
          }
          return jsonResponse(
            {
              ok: false,
              code: 'RATE_LIMITED',
              message: 'Permintaan terlalu cepat (perlindungan limit per menit Free Tier). Mohon tunggu ~15 detik lalu coba lagi.',
              retryAfterSec: consumeData.retryAfterSec || 15,
              quota: consumeData.quota
            },
            429,
            request
          );
        }

        // 2. Build Gemini conversation contents with grounded spatialContext
        const history = sanitizeHistory(body.history);
        const groundedUserTurn = `PERTANYAAN PENGGUNA:\n${userMessage}\n\nDATA SPASIAL SUMBER (spatialContext JSON — gunakan HANYA fakta & angka dari sini):\n${contextJson}`;
        const contents = [...history, { role: 'user', parts: [{ text: groundedUserTurn }] }];

        // 3. Model Orchestration:
        //    Step A: Try Primary (gemini-3.8-flash)
        //    Step B: Fallback to Secondary (gemini-4-hydrogen)
        //    Step C: Transient 503/timeout resilience net (gemini-3.5-flash) — NEVER on daily quota exhaustion
        const attempts = [];
        let result = await callGeminiModel({
          apiKey: env.GEMINI_API_KEY,
          model: primaryModel,
          contents,
          timeoutMs: 6500
        });
        attempts.push({ model: primaryModel, ok: result.ok, status: result.status || 200, error: result.error || null });

        if (!result.ok) {
          result = await callGeminiModel({
            apiKey: env.GEMINI_API_KEY,
            model: fallbackModel,
            contents,
            timeoutMs: 12000
          });
          attempts.push({ model: fallbackModel, ok: result.ok, status: result.status || 200, error: result.error || null });

          // Single quick retry on transient 503 high-demand spike for fallback model
          if (!result.ok && result.status === 503) {
            await new Promise((r) => setTimeout(r, 600));
            result = await callGeminiModel({
              apiKey: env.GEMINI_API_KEY,
              model: fallbackModel,
              contents,
              timeoutMs: 12000
            });
            attempts.push({ model: `${fallbackModel}:retry`, ok: result.ok, status: result.status || 200, error: result.error || null });
          }
        }

        // Only try resilience model if BOTH primary & fallback failed with non-quota transient 503/504/timeout
        const bothQuota = attempts.every((a) => a.status === 429);
        if (!result.ok && !bothQuota && !result.isQuota && resilienceModel) {
          result = await callGeminiModel({
            apiKey: env.GEMINI_API_KEY,
            model: resilienceModel,
            contents,
            timeoutMs: 12000
          });
          attempts.push({ model: resilienceModel, ok: result.ok, status: result.status || 200, error: result.error || null });
        }

        // 4. Handle upstream failures safely
        if (!result.ok) {
          const hitQuota = result.isQuota || attempts.some((a) => a.status === 429);
          if (hitQuota) {
            // Lock today's quota immediately to guarantee zero billing risk!
            const lockRes = await quotaStub.fetch('https://quota/lock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reason: 'Gemini API mengembalikan HTTP 429 (Limit Free Tier tercapai). AI dikunci hingga reset 00:00 WIB.'
              })
            });
            const lockedQuota = await lockRes.json();
            return jsonResponse(
              {
                ok: false,
                code: 'QUOTA_EXHAUSTED',
                message: `Limit harian Gemini API Free Tier telah tercapai. AI-Agent otomatis dikunci hingga reset pukul ${lockedQuota.resetAtWib} (${lockedQuota.timeUntilResetLabel} lagi) agar tidak menimbulkan biaya tambahan.`,
                quota: lockedQuota,
                attempts
              },
              429,
              request
            );
          }

          // Transient upstream error -> refund the reserved slot so user doesn't lose daily quota
          const refundRes = await quotaStub.fetch('https://quota/refund', { method: 'POST' });
          const refundedQuota = await refundRes.json();
          return jsonResponse(
            {
              ok: false,
              code: 'UPSTREAM_UNAVAILABLE',
              message: 'Server model Gemini sedang padat/sibuk sementara. Kuota Anda tidak terpotong. Silakan coba lagi atau gunakan Mode Analisis Lokal (Tanpa AI).',
              quota: refundedQuota,
              attempts
            },
            503,
            request
          );
        }

        // 5. Parse & normalize structured JSON response
        const parsed = parseJsonSafe(result.text);
        const normalized = normalizeAgentResponse(parsed, result.text);

        return jsonResponse(
          {
            ok: true,
            modelUsed: result.model,
            fallbackUsed: result.model !== primaryModel,
            data: normalized,
            quota: consumeData.quota,
            attempts
          },
          200,
          request
        );
      }

      return jsonResponse({ ok: false, code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' }, 404, request);
    } catch (err) {
      return jsonResponse(
        {
          ok: false,
          code: 'INTERNAL_ERROR',
          message: 'Terjadi kesalahan internal pada Cloudflare Worker.',
          detail: String(err?.message || err)
        },
        500,
        request
      );
    }
  }
};
