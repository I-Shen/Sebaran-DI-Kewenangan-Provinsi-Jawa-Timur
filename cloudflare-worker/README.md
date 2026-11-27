# Tanya SDA — Cloudflare Worker AI-Agent Backend

Backend proxy & guardrail untuk fitur **Tanya SDA** pada Portal WebGIS **Sebaran DI Kewenangan Provinsi Jawa Timur** (Dinas PU SDA Prov. Jawa Timur).

## Fitur Arsitektur
- **Model Fallback Otomatis**:
  1. Primary: `gemini-3.8-flash` (timeout cepat 9,5 detik agar petugas lapangan tidak menunggu lama saat model padat)
  2. Fallback: `gemini-4-hydrogen` (otomatis aktif apabila `gemini-3.8-flash` tidak tersedia / 503 / 404 / timeout)
  3. Resilience 503-Only: `gemini-3.5-flash` (hanya jika keduanya mengalami 503 sementara; tidak pernah melewati kunci kuota 429)
- **Zero-Cost Free-Tier Quota Guard (Durable Object SQLite `QuotaGuard`)**:
  - Menghitung permintaan harian per tanggal **WIB (UTC+7)** secara atomik.
  - Batas aman default `DAILY_LIMIT = 150` permintaan/hari dan `RPM_LIMIT = 10` permintaan/menit.
  - Circuit breaker otomatis: apabila Gemini mengembalikan `HTTP 429` (limit harian habis), Worker langsung mengunci layanan AI hingga reset **00:00 WIB** sehingga **tidak ada risiko biaya tambahan**.
- **Keamanan API Key**: `GEMINI_API_KEY` disimpan sebagai **Cloudflare Worker Secret** (terenkripsi di edge Cloudflare, tidak pernah terekspos di GitHub Pages / browser).

## Langkah Deploy ke Akun Cloudflare (`ad7e2a93b4c708d4f8dab0ccf38b7e71`)

> **Catatan API Token MCP Cloudflare**: Jika deploy otomatis via MCP gagal, pastikan Cloudflare API Token yang terpasang memiliki izin:
> - `Account → Workers Scripts: Edit`
> - `Account → Workers KV Storage: Edit`
> - `Account → Account Settings: Read`
> dan pastikan subdomain `*.workers.dev` sudah diaktifkan pada Cloudflare Dashboard (`Workers & Pages`).

### Deploy Manual via Wrangler CLI (1 Menit)
```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

Setelah deploy selesai, catat URL Worker Anda (contoh: `https://tanya-sda-jatim-agent.<subdomain>.workers.dev`) dan perbarui konstanta `DEFAULT_CLOUDFLARE_WORKER_URL` pada file `ai-agent.js`.
