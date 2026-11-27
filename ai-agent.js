/**
 * TANYA SDA — AI-AGENT WEBGIS CLIENT ENGINE
 * Hybrid Grounded Spatial RAG + Cloudflare Worker Proxy + Zero-Cost Quota Guard + Local Fallback
 * Portal WebGIS Sebaran DI Kewenangan Provinsi Jawa Timur (Dinas PU SDA Jatim)
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONFIGURATION
  // =========================================================================
  // URL Cloudflare Worker AI-Agent (dapat dioverride via window.TANYA_SDA_ENDPOINT atau ?ai_endpoint=...)
  const DEFAULT_CLOUDFLARE_WORKER_URL = 'https://tanya-sda-jatim-agent.workers.dev';

  function resolveWorkerBaseUrl() {
    const params = new URLSearchParams(window.location.search);
    const paramUrl = params.get('ai_endpoint');
    if (paramUrl && /^https?:\/\//i.test(paramUrl)) {
      return paramUrl.replace(/\/+$/, '');
    }
    if (window.TANYA_SDA_ENDPOINT && /^https?:\/\//i.test(window.TANYA_SDA_ENDPOINT)) {
      return window.TANYA_SDA_ENDPOINT.replace(/\/+$/, '');
    }
    const saved = localStorage.getItem('tanya_sda_worker_url');
    if (saved && /^https?:\/\//i.test(saved)) {
      return saved.replace(/\/+$/, '');
    }
    return DEFAULT_CLOUDFLARE_WORKER_URL;
  }

  // Referensi koordinat 38 Kab/Kota di Jawa Timur untuk pertanyaan berbasis nama wilayah
  const JATIM_GAZETTEER = [
    { name: 'Kota Surabaya', keys: ['surabaya', 'sby'], lat: -7.2575, lon: 112.7521 },
    { name: 'Kab. Sidoarjo', keys: ['sidoarjo'], lat: -7.4478, lon: 112.7183 },
    { name: 'Kab. Gresik', keys: ['gresik'], lat: -7.1567, lon: 112.6555 },
    { name: 'Kab. Mojokerto', keys: ['mojokerto'], lat: -7.4722, lon: 112.4336 },
    { name: 'Kab. Jombang', keys: ['jombang'], lat: -7.5459, lon: 112.2331 },
    { name: 'Kab. Malang', keys: ['malang', 'kepanjen'], lat: -7.9839, lon: 112.6214 },
    { name: 'Kota Batu', keys: ['batu'], lat: -7.8712, lon: 112.5269 },
    { name: 'Kab. Pasuruan', keys: ['pasuruan', 'bangil'], lat: -7.6453, lon: 112.9075 },
    { name: 'Kab. Probolinggo', keys: ['probolinggo', 'kraksaan'], lat: -7.7543, lon: 113.2159 },
    { name: 'Kab. Lumajang', keys: ['lumajang'], lat: -8.1335, lon: 113.2248 },
    { name: 'Kab. Jember', keys: ['jember'], lat: -8.1724, lon: 113.7007 },
    { name: 'Kab. Bondowoso', keys: ['bondowoso'], lat: -7.9135, lon: 113.8214 },
    { name: 'Kab. Situbondo', keys: ['situbondo'], lat: -7.7063, lon: 114.0095 },
    { name: 'Kab. Banyuwangi', keys: ['banyuwangi'], lat: -8.2192, lon: 114.3691 },
    { name: 'Kab. Kediri', keys: ['kediri', 'pare'], lat: -7.848, lon: 112.0178 },
    { name: 'Kab. Blitar', keys: ['blitar', 'kanigoro'], lat: -8.0955, lon: 112.1609 },
    { name: 'Kab. Tulungagung', keys: ['tulungagung'], lat: -8.0657, lon: 111.9025 },
    { name: 'Kab. Trenggalek', keys: ['trenggalek'], lat: -8.0503, lon: 111.7085 },
    { name: 'Kab. Nganjuk', keys: ['nganjuk'], lat: -7.6051, lon: 111.9036 },
    { name: 'Kab. Madiun', keys: ['madiun', 'caruban'], lat: -7.6298, lon: 111.5239 },
    { name: 'Kab. Magetan', keys: ['magetan'], lat: -7.6494, lon: 111.3372 },
    { name: 'Kab. Ngawi', keys: ['ngawi'], lat: -7.4038, lon: 111.4461 },
    { name: 'Kab. Ponorogo', keys: ['ponorogo'], lat: -7.8686, lon: 111.462 },
    { name: 'Kab. Pacitan', keys: ['pacitan'], lat: -8.1947, lon: 111.1055 },
    { name: 'Kab. Bojonegoro', keys: ['bojonegoro'], lat: -7.1502, lon: 111.8817 },
    { name: 'Kab. Tuban', keys: ['tuban'], lat: -6.8976, lon: 112.0649 },
    { name: 'Kab. Lamongan', keys: ['lamongan'], lat: -7.1167, lon: 112.4167 },
    { name: 'Kab. Bangkalan', keys: ['bangkalan', 'madura'], lat: -7.0455, lon: 112.7351 },
    { name: 'Kab. Sampang', keys: ['sampang'], lat: -7.1872, lon: 113.2394 },
    { name: 'Kab. Pamekasan', keys: ['pamekasan'], lat: -7.1568, lon: 113.4746 },
    { name: 'Kab. Sumenep', keys: ['sumenep'], lat: -7.0167, lon: 113.8667 }
  ];

  // =========================================================================
  // 2. STATE
  // =========================================================================
  let isOpen = false;
  let isBusy = false;
  let chatHistory = [];
  let quotaState = {
    used: 0,
    limit: 150,
    remaining: 150,
    exhausted: false,
    resetAtWib: '00:00 WIB',
    timeUntilResetLabel: '',
    lockReason: ''
  };
  let aiOverlayGroup = null;
  let lastModelUsed = 'gemini-3.8-flash';

  // SVG Icons
  const SPARKLE_SVG = `<svg class="ai-sparkle-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="url(#tanyaSparkleGrad)"/>
    <defs>
      <linearGradient id="tanyaSparkleGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FFFFFF"/>
        <stop offset="0.55" stop-color="#BAE6FD"/>
        <stop offset="1" stop-color="#00E5FF"/>
      </linearGradient>
    </defs>
  </svg>`;

  const ROBOT_AVATAR_SVG = `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="4" x2="18" y2="9" stroke="#38BDF8" stroke-width="2" stroke-linecap="round"/>
    <circle cx="18" cy="4" r="2.2" fill="#00E5FF"/>
    <rect x="7" y="9" width="22" height="17" rx="7" fill="#E0F2FE" stroke="#38BDF8" stroke-width="1.6"/>
    <rect x="10.5" y="13" width="15" height="9" rx="4" fill="#0B142C"/>
    <circle cx="14.8" cy="17.5" r="2" fill="#00E5FF"/>
    <circle cx="21.2" cy="17.5" r="2" fill="#00E5FF"/>
    <path d="M15.5 20.3C16.3 21.1 19.7 21.1 20.5 20.3" stroke="#38BDF8" stroke-width="1.3" stroke-linecap="round"/>
    <rect x="4.5" y="14.5" width="2.5" height="6" rx="1.2" fill="#38BDF8"/>
    <rect x="29" y="14.5" width="2.5" height="6" rx="1.2" fill="#38BDF8"/>
    <path d="M12 28.5C12 26.8 14.5 26 18 26C21.5 26 24 26.8 24 28.5V31H12V28.5Z" fill="#0284C7"/>
  </svg>`;

  // =========================================================================
  // 3. HELPERS & FORMATTING
  // =========================================================================
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatIdDistance(km) {
    if (km === null || km === undefined || !Number.isFinite(km)) return '';
    if (km <= 0.005) return '0,00 km (Di Dalam)';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1).replace('.', ',')} km`;
  }

  function getBridge() {
    return window.WebGisBridge || null;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const b = getBridge();
    if (b && typeof b.calculateDistanceKm === 'function') {
      return b.calculateDistanceKm(lat1, lon1, lat2, lon2);
    }
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bboxDistKm(lat, lon, bounds) {
    if (!bounds || bounds.length < 4) return Infinity;
    const [minLat, minLon, maxLat, maxLon] = bounds;
    const cLat = Math.max(minLat, Math.min(maxLat, lat));
    const cLon = Math.max(minLon, Math.min(maxLon, lon));
    return haversineKm(lat, lon, cLat, cLon);
  }

  function inferNearestKabupaten(lat, lon) {
    let best = JATIM_GAZETTEER[0];
    let minD = Infinity;
    for (const loc of JATIM_GAZETTEER) {
      const d = haversineKm(lat, lon, loc.lat, loc.lon);
      if (d < minD) {
        minD = d;
        best = loc;
      }
    }
    return best ? `${best.name}, Jatim` : 'Provinsi Jawa Timur';
  }

  // =========================================================================
  // 4. DETERMINISTIC SPATIAL CONTEXT BUILDER (ZERO HALLUCINATION RAG)
  // =========================================================================
  async function buildSpatialContext(queryText) {
    const bridge = getBridge();
    const map = bridge ? bridge.getMap() : null;
    const allDis = (bridge && bridge.getAllDiData()) || window.DI_JATIM_DATA || [];
    const lowerQ = queryText.toLowerCase();

    // 4.1 Determine Reference Point (Coordinate in text > Gazetteer city > Active Pinpoint > Map Center)
    let refPoint = null;
    let refSource = '';

    const parsedCoord = bridge && bridge.parseCoordinateString ? bridge.parseCoordinateString(queryText) : null;
    if (parsedCoord && Math.abs(parsedCoord.lat) <= 15 && parsedCoord.lon >= 100 && parsedCoord.lon <= 125) {
      refPoint = { lat: parsedCoord.lat, lon: parsedCoord.lon };
      refSource = 'Koordinat yang disebut pada pertanyaan';
    }

    if (!refPoint) {
      for (const loc of JATIM_GAZETTEER) {
        if (loc.keys.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(lowerQ))) {
          refPoint = { lat: loc.lat, lon: loc.lon };
          refSource = `Referensi wilayah ${loc.name}`;
          break;
        }
      }
    }

    const activePin = bridge && bridge.getCurrentPinpoint ? bridge.getCurrentPinpoint() : null;
    if (!refPoint && activePin && Number.isFinite(activePin.lat)) {
      refPoint = { lat: activePin.lat, lon: activePin.lon };
      refSource = activePin.sourceLabel || 'Titik target aktif pada peta';
    }

    if (!refPoint && map) {
      const c = map.getCenter();
      refPoint = { lat: Number(c.lat.toFixed(6)), lon: Number(c.lng.toFixed(6)) };
      refSource = 'Pusat tampilan peta (viewport) saat ini';
    }

    if (!refPoint) {
      refPoint = { lat: -7.75, lon: 112.75 };
      refSource = 'Titik tengah Provinsi Jawa Timur';
    }

    const refLocationLabel = inferNearestKabupaten(refPoint.lat, refPoint.lon);

    // 4.2 UPT / Korwil Summary (Exact dynamically computed counts from 188 DI)
    const uptCounts = {};
    for (const di of allDis) {
      uptCounts[di.upt] = (uptCounts[di.upt] || 0) + 1;
    }
    const uptSummary = Object.entries(uptCounts)
      .map(([upt, count]) => ({ upt, count }))
      .sort((a, b) => b.count - a.count);

    // Check if user mentioned a specific UPT
    let matchedUpt = null;
    for (const item of uptSummary) {
      const shortWord = item.upt.replace(/^(Korwil|UPT|Perwakilan)\s+/i, '').toLowerCase();
      if (lowerQ.includes(item.upt.toLowerCase()) || new RegExp(`\\b${shortWord}\\b`, 'i').test(lowerQ)) {
        if (/(upt|korwil|perwakilan|wilayah|berapa|daftar|jumlah|list|di mana|di di)/i.test(lowerQ)) {
          matchedUpt = item.upt;
          break;
        }
      }
    }

    // 4.3 Match specific DI names mentioned in prompt
    const matchedDis = [];
    for (const di of allDis) {
      const cleanName = di.nama_di.replace(/^DI\s+/i, '').trim().toLowerCase();
      if (cleanName.length >= 3 && (lowerQ.includes(di.nama_di.toLowerCase()) || lowerQ.includes(cleanName))) {
        matchedDis.push({
          id: di.id,
          nama_di: di.nama_di,
          upt: di.upt,
          lat: di.lat,
          lon: di.lon,
          total_titik: di.total_titik,
          files: di.files
        });
      }
    }

    // Active highlighted DI(s) on map
    const activeHighlighted = bridge && bridge.getActiveHighlightedDis ? bridge.getActiveHighlightedDis() : [];

    // If user asks to summarize a specific DI (or "DI ini"), attach detailed GeoJSON counts
    let detailedDiStats = null;
    const targetDiForDetail =
      matchedDis[0] ||
      (activeHighlighted.length > 0 ? activeHighlighted[0] : null);

    if (targetDiForDetail && /(ringkas|detail|luas|saluran|petak|bangunan|info|tentang|spesifikasi)/i.test(lowerQ)) {
      if (activeHighlighted.length > 0 && activeHighlighted[0].id === targetDiForDetail.id && activeHighlighted[0].counts) {
        detailedDiStats = activeHighlighted[0];
      } else if (bridge && typeof bridge.loadDiStatsAsync === 'function') {
        detailedDiStats = await bridge.loadDiStatsAsync(targetDiForDetail.id).catch(() => null);
      }
    }

    // 4.4 Compute Nearest 8 DIs from refPoint (prefer exact vector distances if activePin matches!)
    let nearestDis = [];
    const activeNearest5 = bridge && bridge.getCurrentNearest5 ? bridge.getCurrentNearest5() : [];
    const usingExactPin =
      activePin &&
      activeNearest5.length > 0 &&
      Math.abs(activePin.lat - refPoint.lat) < 0.0005 &&
      Math.abs(activePin.lon - refPoint.lon) < 0.0005;

    if (usingExactPin) {
      nearestDis = activeNearest5.slice(0, 5).map((d, idx) => ({
        rank: idx + 1,
        id: d.id,
        nama_di: d.nama_di,
        upt: d.upt,
        distance_km: Number((d.distance ?? 0).toFixed(2)),
        distance_method: 'proyeksi_vektor_presisi',
        is_inside: Boolean(d.isInside),
        lat: d.closestPoint ? Number(d.closestPoint.lat.toFixed(6)) : d.lat,
        lon: d.closestPoint ? Number(d.closestPoint.lon.toFixed(6)) : d.lon
      }));
    } else {
      nearestDis = allDis
        .map((di) => {
          const bDist = bboxDistKm(refPoint.lat, refPoint.lon, di.bounds);
          const cDist = haversineKm(refPoint.lat, refPoint.lon, di.lat, di.lon);
          const dist = Math.min(bDist, cDist);
          return {
            id: di.id,
            nama_di: di.nama_di,
            upt: di.upt,
            distance_km: Number(dist.toFixed(2)),
            distance_method: bDist < cDist ? 'haversine_batas_bbox' : 'haversine_centroid',
            is_inside: bDist === 0,
            lat: di.lat,
            lon: di.lon
          };
        })
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, 6)
        .map((item, idx) => ({ rank: idx + 1, ...item }));
    }

    // 4.5 Wilayah Sungai (WS) & Nearest Rivers
    const wsAtRef = bridge && bridge.findWsForCoordinate ? bridge.findWsForCoordinate(refPoint.lat, refPoint.lon) : null;
    const wsList = (window.RIVER_INDEX_DATA || []).map((w) => ({
      slug: w.slug,
      name: w.name,
      desc: w.desc,
      river_segments: w.count,
      total_km: w.total_km
    }));

    let nearestRivers = [];
    const activeRivers = bridge && bridge.getActiveRecommendedRivers ? bridge.getActiveRecommendedRivers() : [];
    if (usingExactPin && activeRivers.length > 0) {
      nearestRivers = activeRivers.slice(0, 5).map((r, idx) => ({
        rank: idx + 1,
        name: r.properties?.Sungai ? `Sungai ${r.properties.Sungai}` : 'Alur Sungai',
        ws: r.wsInfo?.name || r.properties?.ws_name || '-',
        ws_slug: r.wsInfo?.slug || null,
        das: r.properties?.DAS || '-',
        panjang_km: r.properties?.Panjang_km ?? null,
        kabupaten: r.properties?.Kabupaten || '-',
        distance_km: Number((r.distanceKm ?? 0).toFixed(2)),
        lat: r.closestPoint?.lat ?? null,
        lon: r.closestPoint?.lon ?? null
      }));
    } else if (window.RIVER_ORDE1_DATA && Array.isArray(window.RIVER_ORDE1_DATA.features)) {
      const riverCands = [];
      for (const feat of window.RIVER_ORDE1_DATA.features) {
        const g = feat.geometry;
        const p = feat.properties || {};
        let sampleCoord = null;
        if (g?.type === 'LineString' && g.coordinates.length > 0) {
          sampleCoord = g.coordinates[Math.floor(g.coordinates.length / 2)];
        } else if (g?.type === 'MultiLineString' && g.coordinates[0]?.length > 0) {
          sampleCoord = g.coordinates[0][0];
        }
        if (!sampleCoord) continue;
        const d = haversineKm(refPoint.lat, refPoint.lon, sampleCoord[1], sampleCoord[0]);
        riverCands.push({
          name: p.Sungai ? `Sungai ${p.Sungai}` : 'Sungai Utama',
          ws: p.ws_name || p.WS || '-',
          ws_slug: p.ws_slug || null,
          das: p.DAS || '-',
          panjang_km: p.Panjang_km ?? null,
          kabupaten: p.Kabupaten || '-',
          distance_km: Number(d.toFixed(2)),
          lat: Number(sampleCoord[1].toFixed(6)),
          lon: Number(sampleCoord[0].toFixed(6))
        });
      }
      riverCands.sort((a, b) => a.distance_km - b.distance_km);
      const seenR = new Set();
      for (const rc of riverCands) {
        if (!seenR.has(rc.name)) {
          seenR.add(rc.name);
          nearestRivers.push({ rank: nearestRivers.length + 1, ...rc });
        }
        if (nearestRivers.length >= 5) break;
      }
    }

    // 4.6 Nearest Aset Tanah [Data Simulasi]
    let nearestAset = [];
    const asetFc = (bridge && bridge.getAsetTanahData && bridge.getAsetTanahData()) || window.ASET_TANAH_DATA;
    if (asetFc && Array.isArray(asetFc.features) && /(aset|tanah|sempadan|sertifikat|kib|bendung|waduk|embung|mata air|persil)/i.test(lowerQ)) {
      const asetCands = [];
      for (const f of asetFc.features) {
        const ring = f.geometry?.coordinates?.[0];
        if (!ring || ring.length === 0) continue;
        const cLon = ring[0][0];
        const cLat = ring[0][1];
        const d = haversineKm(refPoint.lat, refPoint.lon, cLat, cLon);
        const p = f.properties || {};
        asetCands.push({
          id: p.id || f.id,
          kode_aset: p.kode_aset,
          nama_aset: p.nama_aset,
          kategori: p.kategori,
          luas_ha: p.luas_ha,
          status_tanah: p.status_tanah,
          kabupaten: p.kabupaten,
          upt: p.upt,
          distance_km: Number(d.toFixed(2)),
          lat: Number(cLat.toFixed(6)),
          lon: Number(cLon.toFixed(6)),
          is_simulated: true
        });
      }
      asetCands.sort((a, b) => a.distance_km - b.distance_km);
      nearestAset = asetCands.slice(0, 5).map((item, idx) => ({ rank: idx + 1, ...item }));
    }

    // 4.7 Sample list of DIs if specific UPT asked
    let uptDiList = [];
    if (matchedUpt) {
      uptDiList = allDis
        .filter((d) => d.upt === matchedUpt)
        .slice(0, 15)
        .map((d) => ({ id: d.id, nama_di: d.nama_di, lat: d.lat, lon: d.lon }));
    }

    const wantsRivers = /(sungai|das|wilayah sungai|\bws\b|aliran|brantas|bengawan|pekalen|sampean|bondoyudo)/i.test(lowerQ);
    const wantsUpt = /(upt|korwil|perwakilan|sebaran|statistik|berapa|jumlah|ringkas|total|daftar)/i.test(lowerQ);

    return {
      inventory: {
        total_di: allDis.length || 188,
        total_upt: uptSummary.length || 10,
        total_spatial_features: 47853,
        total_ws: 6,
        aset_tanah_polygons: asetFc?.features?.length || 1800,
        aset_tanah_status: '[Data Simulasi]'
      },
      referencePoint: {
        lat: refPoint.lat,
        lon: refPoint.lon,
        source: refSource,
        estimatedRegion: refLocationLabel,
        wsName: wsAtRef ? wsAtRef.name : null,
        wsSlug: wsAtRef ? wsAtRef.slug : null
      },
      activeHighlightedDis: activeHighlighted.map((h) => ({
        id: h.id,
        nama_di: h.nama_di,
        upt: h.upt,
        counts: h.counts
      })),
      detailedDiStats,
      matchedDis: matchedDis.slice(0, 5),
      matchedUpt,
      uptDiList,
      uptSummary: wantsUpt || matchedUpt ? uptSummary : undefined,
      nearestDis,
      wsList: wantsRivers ? wsList : undefined,
      nearestRivers: wantsRivers ? nearestRivers : nearestRivers.slice(0, 2),
      nearestAset
    };
  }

  // =========================================================================
  // 5. LOCAL DETERMINISTIC FALLBACK ENGINE (0 AI CALLS / 100% FREE OFFLINE)
  // =========================================================================
  async function runLocalFallbackAnalysis(queryText) {
    const ctx = await buildSpatialContext(queryText);
    const lowerQ = queryText.toLowerCase();

    if (/(aset|tanah|sempadan|sertifikat|embung|waduk)/i.test(lowerQ) && ctx.nearestAset.length > 0) {
      return {
        answer: `Mode Analisis Lokal (Tanpa AI): Berikut ${ctx.nearestAset.length} Aset Tanah & Sempadan [Data Simulasi] terdekat dari lokasi referensi.`,
        cards: ctx.nearestAset.map((a) => ({
          rank: a.rank,
          type: 'aset',
          id: a.id,
          name: a.nama_aset,
          meta: `[Data Simulasi] ${a.kategori} • ${a.luas_ha} • ${a.kabupaten || a.upt}`,
          distance_km: a.distance_km,
          distance_label: formatIdDistance(a.distance_km),
          lat: a.lat,
          lon: a.lon,
          is_simulated: true
        })),
        location_label: ctx.referencePoint.estimatedRegion,
        assumption: `${ctx.referencePoint.source}. Data aset tanah adalah [Data Simulasi] uji coba.`,
        map_action: {
          type: 'show_aset',
          lat: ctx.referencePoint.lat,
          lon: ctx.referencePoint.lon,
          aset_category: 'ALL'
        },
        follow_ups: ['5 DI Terdekat', 'Sungai Terdekat', 'Ringkas UPT']
      };
    }

    if (/(sungai|das|wilayah sungai|\bws\b)/i.test(lowerQ) && ctx.nearestRivers.length > 0) {
      return {
        answer: `Mode Analisis Lokal (Tanpa AI): Berikut ${ctx.nearestRivers.length} alur sungai terdekat di sekitar ${ctx.referencePoint.estimatedRegion} (${ctx.referencePoint.wsName || 'Jawa Timur'}).`,
        cards: ctx.nearestRivers.map((r) => ({
          rank: r.rank,
          type: 'river',
          id: r.ws_slug,
          name: r.name,
          meta: `${r.ws} • DAS ${r.das}${r.panjang_km ? ` • ${r.panjang_km} km` : ''}`,
          distance_km: r.distance_km,
          distance_label: formatIdDistance(r.distance_km),
          lat: r.lat,
          lon: r.lon,
          is_simulated: false
        })),
        location_label: ctx.referencePoint.estimatedRegion,
        assumption: `${ctx.referencePoint.source}. Dihitung langsung dari dataset jaringan sungai PU SDA Jatim.`,
        map_action: {
          type: 'show_rivers',
          lat: ctx.referencePoint.lat,
          lon: ctx.referencePoint.lon,
          ws_slug: ctx.referencePoint.wsSlug
        },
        follow_ups: ['5 DI Terdekat', 'Aset Tanah', 'Ringkas UPT']
      };
    }

    if (ctx.matchedDis.length > 0) {
      const top = ctx.matchedDis[0];
      return {
        answer: `Mode Analisis Lokal (Tanpa AI): Ditemukan ${top.nama_di} di bawah kewenangan ${top.upt} (${top.total_titik || '-'} titik geometri).`,
        cards: ctx.matchedDis.map((d, idx) => ({
          rank: idx + 1,
          type: 'di',
          id: d.id,
          name: d.nama_di,
          meta: `${d.upt} • Koordinat ${d.lat.toFixed(4)}, ${d.lon.toFixed(4)}`,
          distance_km: null,
          distance_label: 'Fokus DI',
          lat: d.lat,
          lon: d.lon,
          is_simulated: false
        })),
        location_label: top.upt,
        assumption: 'Pencarian langsung pada database 188 DI Kewenangan Provinsi Jawa Timur.',
        map_action: { type: 'highlight_di', di_id: top.id, lat: top.lat, lon: top.lon },
        follow_ups: ['5 DI Terdekat', 'Sungai Terdekat', 'Aset Tanah']
      };
    }

    // Default: 5 DI Terdekat (deterministic)
    const top5 = ctx.nearestDis.slice(0, 5);
    return {
      answer: `Mode Analisis Lokal (Tanpa AI): Berikut 5 Daerah Irigasi terdekat dari lokasi referensi (${ctx.referencePoint.lat.toFixed(4)}°, ${ctx.referencePoint.lon.toFixed(4)}°):`,
      cards: top5.map((d) => ({
        rank: d.rank,
        type: 'di',
        id: d.id,
        name: d.nama_di,
        meta: d.upt,
        distance_km: d.distance_km,
        distance_label: formatIdDistance(d.distance_km),
        lat: d.lat,
        lon: d.lon,
        is_simulated: false
      })),
      location_label: ctx.referencePoint.estimatedRegion,
      assumption: `${ctx.referencePoint.source}. Jarak dihitung secara deterministik dari data resmi 188 DI PU SDA Jatim.`,
      map_action: {
        type: 'pinpoint_nearest',
        lat: ctx.referencePoint.lat,
        lon: ctx.referencePoint.lon,
        di_ids: top5.map((d) => d.id)
      },
      follow_ups: ['Sungai Terdekat', 'Aset Tanah', 'Ringkas DI ini']
    };
  }

  // =========================================================================
  // 6. ON-MAP VISUAL OVERLAY & ACTION DISPATCHER (MATCHING SCREENSHOT 1)
  // =========================================================================
  function clearAiMapOverlay() {
    const bridge = getBridge();
    const map = bridge ? bridge.getMap() : null;
    if (aiOverlayGroup && map) {
      map.removeLayer(aiOverlayGroup);
      aiOverlayGroup = null;
    }
  }

  function drawAiNearestOverlay(refLat, refLon, cards, title = '5 DI Terdekat') {
    const bridge = getBridge();
    const map = bridge ? bridge.getMap() : null;
    if (!map || !Number.isFinite(refLat) || !Number.isFinite(refLon)) return;

    clearAiMapOverlay();
    aiOverlayGroup = L.layerGroup().addTo(map);

    const diCards = (cards || []).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon)).slice(0, 5);
    diCards.forEach((c, idx) => {
      // Glowing underlay cyan line (matching Screenshot 1)
      L.polyline(
        [
          [refLat, refLon],
          [c.lat, c.lon]
        ],
        {
          color: '#00e5ff',
          weight: idx === 0 ? 5.5 : 3.5,
          opacity: 0.35,
          interactive: false
        }
      ).addTo(aiOverlayGroup);

      // Sharp bright core radial line
      L.polyline(
        [
          [refLat, refLon],
          [c.lat, c.lon]
        ],
        {
          color: '#7dd3fc',
          weight: idx === 0 ? 2.4 : 1.6,
          opacity: 0.95,
          interactive: false
        }
      ).addTo(aiOverlayGroup);
    });

    // Floating glassmorphic callout card on map ("5 DI Terdekat", matching Screenshot 1)
    if (diCards.length > 0) {
      const rowsHtml = diCards
        .map(
          (c, i) => `
          <div class="tanya-map-callout-row" data-di-id="${c.id ?? ''}" data-lat="${c.lat}" data-lon="${c.lon}">
            <span>${i + 1}. ${escapeHtml(c.name)}</span>
            <span>${escapeHtml(c.distance_label || formatIdDistance(c.distance_km))}</span>
          </div>`
        )
        .join('');

      const calloutMarker = L.marker([refLat, refLon], {
        zIndexOffset: 1200,
        icon: L.divIcon({
          className: 'tanya-map-callout-icon',
          html: `
            <div class="tanya-map-callout">
              <div class="tanya-map-callout-hdr">
                <span class="tanya-map-callout-badge"><i class="fa-solid fa-earth-asia"></i> ${escapeHtml(title)}</span>
                <button class="tanya-map-callout-close" title="Tutup Callout">&times;</button>
              </div>
              ${rowsHtml}
            </div>
          `,
          iconSize: [230, 145],
          iconAnchor: [115, 165]
        })
      }).addTo(aiOverlayGroup);

      setTimeout(() => {
        const el = calloutMarker.getElement();
        if (!el) return;
        L.DomEvent.disableClickPropagation(el);
        const closeBtn = el.querySelector('.tanya-map-callout-close');
        if (closeBtn) closeBtn.addEventListener('click', clearAiMapOverlay);
        el.querySelectorAll('.tanya-map-callout-row').forEach((row) => {
          row.addEventListener('click', () => {
            const diId = parseInt(row.getAttribute('data-di-id'), 10);
            if (Number.isFinite(diId) && bridge) {
              bridge.highlightDi(diId);
            }
          });
        });
      }, 60);
    }
  }

  function executeMapAction(responseData) {
    const bridge = getBridge();
    if (!bridge || !responseData) return;
    const action = responseData.map_action || { type: 'none' };
    const cards = responseData.cards || [];
    const map = bridge.getMap();

    switch (action.type) {
      case 'pinpoint_nearest': {
        const lat = action.lat ?? cards[0]?.lat;
        const lon = action.lon ?? cards[0]?.lon;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          bridge.setPinpointLocation(lat, lon, 'Analisis Tanya SDA', true, true);
          drawAiNearestOverlay(lat, lon, cards, `${Math.min(5, cards.length || 5)} DI Terdekat`);
        }
        break;
      }
      case 'highlight_di': {
        const diId = action.di_id ?? (cards[0]?.type === 'di' ? Number(cards[0].id) : null);
        if (Number.isFinite(diId)) {
          clearAiMapOverlay();
          bridge.highlightDi(diId);
        }
        break;
      }
      case 'highlight_multiple_di': {
        const ids = action.di_ids && action.di_ids.length > 0
          ? action.di_ids
          : cards.filter((c) => c.type === 'di' && Number.isFinite(Number(c.id))).map((c) => Number(c.id));
        if (ids.length > 0) {
          bridge.highlightMultipleDis(ids);
        }
        break;
      }
      case 'filter_upt': {
        if (action.upt) {
          clearAiMapOverlay();
          bridge.filterByUpt(action.upt);
        }
        break;
      }
      case 'focus_ws': {
        if (action.ws_slug) {
          clearAiMapOverlay();
          bridge.focusWs(action.ws_slug);
        }
        break;
      }
      case 'show_rivers': {
        const lat = action.lat ?? cards[0]?.lat;
        const lon = action.lon ?? cards[0]?.lon;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          bridge.setPinpointLocation(lat, lon, 'Analisis Sungai Tanya SDA', true, true);
          drawAiNearestOverlay(lat, lon, cards, 'Sungai Terdekat');
        } else if (action.ws_slug) {
          bridge.focusWs(action.ws_slug);
        }
        break;
      }
      case 'show_aset': {
        const lat = action.lat ?? cards[0]?.lat;
        const lon = action.lon ?? cards[0]?.lon;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          bridge.showAsetNear(lat, lon, action.aset_category || 'ALL');
          drawAiNearestOverlay(lat, lon, cards, 'Aset Tanah [Simulasi]');
        }
        break;
      }
      case 'fly_to': {
        const lat = action.lat ?? cards[0]?.lat;
        const lon = action.lon ?? cards[0]?.lon;
        if (map && Number.isFinite(lat) && Number.isFinite(lon)) {
          map.flyTo([lat, lon], 13, { duration: 0.9 });
        }
        break;
      }
      default: {
        // If there are DI cards with coordinates, gently fly to first card when user clicks "Lihat di Peta"
        if (cards.length > 0 && cards[0].type === 'di' && Number.isFinite(Number(cards[0].id))) {
          bridge.highlightDi(Number(cards[0].id));
        }
        break;
      }
    }
  }

  // =========================================================================
  // 7. QUOTA UI & ZERO-COST HARD LOCK
  // =========================================================================
  function updateQuotaUi(quota) {
    if (!quota || typeof quota !== 'object') return;
    quotaState = { ...quotaState, ...quota };

    const pill = document.getElementById('tanyaQuotaPill');
    const pillText = document.getElementById('tanyaQuotaText');
    const banner = document.getElementById('tanyaQuotaBanner');
    const bannerDesc = document.getElementById('tanyaQuotaBannerDesc');
    const inputBox = document.getElementById('tanyaInputBox');
    const inputEl = document.getElementById('tanyaInputField');
    const sendBtn = document.getElementById('tanyaSendBtn');
    const chips = document.querySelectorAll('.tanya-chip');

    const used = Number(quotaState.used ?? 0);
    const limit = Number(quotaState.limit ?? 150);
    const remaining = Number(quotaState.remaining ?? Math.max(0, limit - used));
    const exhausted = Boolean(quotaState.exhausted || remaining <= 0);

    if (pill && pillText) {
      pill.classList.remove('warning', 'exhausted');
      if (exhausted) {
        pill.classList.add('exhausted');
        pillText.textContent = `Kuota Habis (0/${limit})`;
      } else if (remaining <= Math.ceil(limit * 0.2)) {
        pill.classList.add('warning');
        pillText.textContent = `Sisa ${remaining}/${limit}`;
      } else {
        pillText.textContent = `Free Tier • ${remaining}/${limit}`;
      }
    }

    if (exhausted) {
      if (banner) banner.classList.remove('hidden');
      if (bannerDesc) {
        const resetInfo = quotaState.timeUntilResetLabel
          ? `Reset otomatis pukul ${quotaState.resetAtWib || '00:00 WIB'} (${quotaState.timeUntilResetLabel} lagi).`
          : `Reset otomatis pukul ${quotaState.resetAtWib || '00:00 WIB'}.`;
        bannerDesc.textContent = `Limit harian AI-Agent Free Tier telah tercapai (${used}/${limit}). Pertanyaan ke Gemini AI dinonaktifkan sementara untuk menjaga agar tidak ada biaya tambahan. ${resetInfo}`;
      }
      if (inputBox) inputBox.classList.add('disabled');
      if (inputEl) {
        inputEl.disabled = true;
        inputEl.value = '';
        inputEl.placeholder = 'Kuota harian AI habis. Refresh pukul 00:00 WIB...';
      }
      if (sendBtn) sendBtn.disabled = true;
      chips.forEach((c) => {
        c.disabled = true;
      });
    } else {
      if (banner) banner.classList.add('hidden');
      if (inputBox) inputBox.classList.remove('disabled');
      if (inputEl) {
        inputEl.disabled = false;
        inputEl.placeholder = 'Tanyakan sesuatu tentang SDA...';
      }
      if (sendBtn) sendBtn.disabled = isBusy;
      chips.forEach((c) => {
        c.disabled = isBusy;
      });
    }
  }

  async function fetchQuotaStatus() {
    const baseUrl = resolveWorkerBaseUrl();
    const modelPill = document.getElementById('tanyaModelPill');
    try {
      const res = await fetch(`${baseUrl}/api/quota`, {
        method: 'GET',
        headers: { 'X-Client-App': 'webgis-di-jatim' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.quota) {
        updateQuotaUi(json.quota);
      }
      if (modelPill) {
        modelPill.innerHTML = `<i class="fa-solid fa-microchip"></i> ${escapeHtml(lastModelUsed)}`;
      }
    } catch {
      if (modelPill) {
        modelPill.innerHTML = `<i class="fa-solid fa-wifi"></i> Siap (Fallback Lokal)`;
      }
    }
  }

  // =========================================================================
  // 8. UI RENDERING (PANEL, MESSAGES, CARDS, CHIPS, COPY/SHARE)
  // =========================================================================
  function injectTanyaSdaDom() {
    // 1. Add trigger button in top navbar
    const headerActions = document.querySelector('.header-actions');
    const btnQuickGps = document.getElementById('btnQuickGps');
    if (headerActions && !document.getElementById('btnOpenTanyaSda')) {
      const navBtn = document.createElement('button');
      navBtn.id = 'btnOpenTanyaSda';
      navBtn.className = 'btn-tanya-sda-nav';
      navBtn.title = 'Buka Tanya SDA (Asisten AI Geospasial Jawa Timur)';
      navBtn.innerHTML = `${SPARKLE_SVG}<span class="btn-text">Tanya SDA</span>`;
      if (btnQuickGps) {
        headerActions.insertBefore(navBtn, btnQuickGps);
      } else {
        headerActions.appendChild(navBtn);
      }
    }

    // 2. Add mobile FAB & Tanya SDA Panel inside main-content
    const mainContent = document.querySelector('.main-content');
    if (!mainContent || document.getElementById('tanyaSdaPanel')) return;

    const fab = document.createElement('button');
    fab.id = 'tanyaSdaMobileFab';
    fab.className = 'tanya-sda-mobile-fab';
    fab.title = 'Tanya SDA (Asisten AI)';
    fab.innerHTML = SPARKLE_SVG;
    mainContent.appendChild(fab);

    const panel = document.createElement('aside');
    panel.id = 'tanyaSdaPanel';
    panel.className = 'tanya-sda-panel hidden';
    panel.setAttribute('aria-label', 'Tanya SDA Asisten AI Geospasial');
    panel.innerHTML = `
      <div id="tanyaSheetHandleWrap" class="tanya-sheet-handle-wrap" title="Geser atau ketuk untuk memperluas/perkecil">
        <div class="tanya-sheet-handle"></div>
      </div>

      <div class="tanya-sda-header">
        <div class="tanya-sda-brand">
          <div class="tanya-sda-logo">${SPARKLE_SVG}</div>
          <div class="tanya-sda-title-wrap">
            <div class="tanya-sda-title-row">
              <h2>Tanya SDA</h2>
            </div>
            <div class="tanya-sda-subtitle">Asisten AI untuk Sumber Daya Air Jawa Timur</div>
          </div>
        </div>
        <div class="tanya-header-actions">
          <button id="btnTanyaClearChat" class="tanya-icon-btn" title="Bersihkan Riwayat Percakapan">
            <i class="fa-solid fa-trash-can"></i>
          </button>
          <button id="btnCloseTanyaSda" class="tanya-icon-btn" title="Tutup Tanya SDA">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="tanya-status-bar">
        <span id="tanyaQuotaPill" class="tanya-quota-pill" title="Perlindungan Kuota Harian Gemini Free Tier">
          <span class="tanya-quota-dot"></span>
          <span id="tanyaQuotaText">Free Tier • Memeriksa...</span>
        </span>
        <span id="tanyaModelPill" class="tanya-model-pill" title="Model AI aktif (Primary: gemini-3.8-flash, Fallback: gemini-4-hydrogen)">
          <i class="fa-solid fa-microchip"></i> gemini-3.8-flash
        </span>
      </div>

      <div id="tanyaQuotaBanner" class="tanya-quota-banner hidden" role="alert">
        <div class="tanya-quota-banner-title">
          <i class="fa-solid fa-shield-halved"></i>
          <span>Kuota Harian AI-Agent Habis</span>
        </div>
        <div id="tanyaQuotaBannerDesc">
          Limit harian Free Tier telah tercapai. AI dinonaktifkan hingga reset harian pukul 00:00 WIB untuk mencegah biaya tambahan.
        </div>
        <div class="tanya-quota-banner-actions">
          <button id="btnRunLocalProximity" class="btn-local-fallback-mode">
            <i class="fa-solid fa-location-crosshairs"></i> Analisis 5 DI Lokal (Tanpa AI)
          </button>
          <button id="btnRunLocalRivers" class="btn-local-fallback-mode">
            <i class="fa-solid fa-water"></i> Sungai Terdekat (Tanpa AI)
          </button>
        </div>
      </div>

      <div id="tanyaSdaMessages" class="tanya-sda-messages"></div>

      <div id="tanyaChipsWrap" class="tanya-chips-wrap">
        <button class="tanya-chip" data-prompt="DI terdekat di lokasi ini apa saja?">
          <i class="fa-solid fa-earth-asia"></i> 5 DI Terdekat
        </button>
        <button class="tanya-chip" data-prompt="Sungai terdekat dari lokasi ini apa saja?">
          <i class="fa-solid fa-water"></i> Sungai Terdekat
        </button>
        <button class="tanya-chip" data-prompt="Aset tanah sekitar lokasi ini apa saja?">
          <i class="fa-solid fa-layer-group"></i> Aset Tanah
        </button>
        <button class="tanya-chip" data-prompt="Ringkas sebaran 188 DI per UPT/Korwil Jawa Timur">
          <i class="fa-solid fa-chart-pie"></i> Ringkas UPT
        </button>
      </div>

      <div class="tanya-input-footer">
        <form id="tanyaSdaForm" class="tanya-input-box" autocomplete="off">
          <span class="tanya-input-sparkle"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
          <input
            type="text"
            id="tanyaInputField"
            class="tanya-input-field"
            placeholder="Tanyakan sesuatu tentang SDA..."
            maxlength="600"
          />
          <button type="submit" id="tanyaSendBtn" class="tanya-send-btn" title="Kirim Pertanyaan">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </form>
        <div class="tanya-disclaimer">Jawaban dapat berisi estimasi. Selalu validasi di lapangan.</div>
      </div>
    `;
    mainContent.appendChild(panel);
  }

  function renderWelcomeMessage() {
    const container = document.getElementById('tanyaSdaMessages');
    if (!container) return;
    container.innerHTML = '';

    const welcomeData = {
      answer:
        'Halo! Saya Tanya SDA, asisten geospasial Dinas PU SDA Provinsi Jawa Timur. Saya siap membantu cek 5 DI terdekat, detail jaringan irigasi (188 DI • 10 UPT), sungai terdekat di 6 WS, serta Aset Tanah [Data Simulasi].',
      cards: [],
      location_label: 'Provinsi Jawa Timur (188 DI • 10 UPT • 6 WS)',
      assumption: 'Arahkan peta / aktifkan GPS lalu tanyakan apa saja, atau ketik nama DI / koordinat langsung.',
      map_action: { type: 'none' },
      follow_ups: ['DI terdekat di lokasi ini?', 'Sungai terdekat', 'Aset tanah sekitar']
    };
    appendBotMessage(welcomeData, { modelLabel: 'Siap membantu', isWelcome: true });
  }

  function appendUserMessage(text, locationHint) {
    const container = document.getElementById('tanyaSdaMessages');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = 'tanya-msg-user-wrap';
    wrap.innerHTML = `
      <div class="tanya-msg-user">
        <div class="tanya-msg-user-top">
          <i class="fa-solid fa-location-dot tanya-user-pin"></i>
          <div class="tanya-user-text">${escapeHtml(text)}</div>
        </div>
        <div class="tanya-user-sub">
          <i class="fa-solid fa-crosshairs"></i>
          <span>${escapeHtml(locationHint || 'Lokasi peta saat ini')}</span>
        </div>
      </div>
    `;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function appendTypingIndicator() {
    const container = document.getElementById('tanyaSdaMessages');
    if (!container) return null;

    const wrap = document.createElement('div');
    wrap.className = 'tanya-msg-bot-wrap';
    wrap.id = 'tanyaTypingBubble';
    wrap.innerHTML = `
      <div class="tanya-bot-avatar">${ROBOT_AVATAR_SVG}</div>
      <div class="tanya-bot-col">
        <div class="tanya-bot-card">
          <div class="tanya-typing"><span></span><span></span><span></span></div>
          <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">Menganalisis data spasial PUSDA Jatim...</div>
        </div>
      </div>
    `;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('tanyaTypingBubble');
    if (el) el.remove();
  }

  function buildShareText(data) {
    const lines = [`[Tanya SDA • Dinas PU SDA Prov. Jawa Timur]`, data.answer];
    if (Array.isArray(data.cards) && data.cards.length > 0) {
      lines.push('');
      data.cards.forEach((c, idx) => {
        const dist = c.distance_label || formatIdDistance(c.distance_km);
        const sim = c.is_simulated ? ' [Data Simulasi]' : '';
        lines.push(`${idx + 1}. ${c.name}${sim}${dist ? ` — ${dist}` : ''}${c.meta ? ` (${c.meta})` : ''}`);
      });
    }
    if (data.location_label) lines.push(`\nLokasi: ${data.location_label}`);
    const topCard = data.cards?.[0];
    if (topCard?.type === 'di' && Number.isFinite(Number(topCard.id))) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?di=${topCard.id}`;
      lines.push(`Peta WebGIS: ${shareUrl}`);
    } else {
      lines.push(`Peta WebGIS: ${window.location.origin}${window.location.pathname}`);
    }
    return lines.join('\n');
  }

  function appendBotMessage(data, meta = {}) {
    const container = document.getElementById('tanyaSdaMessages');
    if (!container) return;

    const cards = Array.isArray(data.cards) ? data.cards : [];
    const hasCoords =
      Number.isFinite(data.map_action?.lat) ||
      cards.some((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon)) ||
      (data.map_action && data.map_action.type && data.map_action.type !== 'none');

    const coordPreview = Number.isFinite(data.map_action?.lat)
      ? `${data.map_action.lat.toFixed(4)}°, ${data.map_action.lon.toFixed(4)}°`
      : cards[0] && Number.isFinite(cards[0].lat)
      ? `${cards[0].lat.toFixed(4)}°, ${cards[0].lon.toFixed(4)}°`
      : 'WebGIS Jatim';

    const listHtml =
      cards.length > 0
        ? `<div class="tanya-result-list">
            ${cards
              .map((c, idx) => {
                const dist = c.distance_label || formatIdDistance(c.distance_km);
                const simBadge = c.is_simulated ? `<span class="tanya-sim-tag">SIMULASI</span>` : '';
                return `
                  <div class="tanya-result-row" data-card-idx="${idx}" title="Klik untuk fokuskan di peta">
                    <div class="tanya-result-left">
                      <span class="tanya-rank-circle">${c.rank || idx + 1}</span>
                      <div class="tanya-result-info">
                        <div class="tanya-result-name">${escapeHtml(c.name)}${simBadge}</div>
                        ${c.meta ? `<div class="tanya-result-meta">${escapeHtml(c.meta)}</div>` : ''}
                      </div>
                    </div>
                    ${dist ? `<span class="tanya-result-dist">${escapeHtml(dist)}</span>` : ''}
                  </div>
                `;
              })
              .join('')}
          </div>`
        : '';

    const miniMapHtml =
      !meta.isWelcome && hasCoords
        ? `<div class="tanya-minimap-strip" title="Tampilkan hasil ini di peta utama">
            <span class="tanya-minimap-coord">${escapeHtml(coordPreview)}</span>
            <button type="button" class="btn-lihat-peta">
              <span>Lihat di Peta</span>
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
          </div>`
        : '';

    const actionsHtml = !meta.isWelcome
      ? `<div class="tanya-card-actions">
          <button type="button" class="tanya-action-pill btn-tanya-detail">
            <i class="fa-regular fa-file-lines"></i> Detail
          </button>
          <button type="button" class="tanya-action-pill btn-tanya-copy">
            <i class="fa-regular fa-copy"></i> Salin
          </button>
          <button type="button" class="tanya-action-pill btn-tanya-share">
            <i class="fa-solid fa-share-nodes"></i> Bagikan
          </button>
        </div>`
      : '';

    const wrap = document.createElement('div');
    wrap.className = 'tanya-msg-bot-wrap';
    wrap.innerHTML = `
      <div class="tanya-bot-avatar">${ROBOT_AVATAR_SVG}</div>
      <div class="tanya-bot-col">
        <div class="tanya-bot-card">
          <div class="tanya-bot-answer">${escapeHtml(data.answer)}</div>
          ${listHtml}
          ${
            data.location_label
              ? `<div class="tanya-location-row"><i class="fa-solid fa-location-dot"></i><span>Lokasi: ${escapeHtml(data.location_label)}</span></div>`
              : ''
          }
          ${miniMapHtml}
          <div class="tanya-assumption-box">
            <i class="fa-solid fa-circle-info"></i>
            <div>
              <span>Asumsi: ${escapeHtml(data.assumption || 'Berdasarkan data spasial Dinas PU SDA Prov. Jawa Timur.')}</span>
              ${
                meta.modelLabel
                  ? `<div style="margin-top:3px;font-size:0.63rem;color:#64748b;">Engine: ${escapeHtml(meta.modelLabel)}</div>`
                  : ''
              }
            </div>
          </div>
        </div>
        ${actionsHtml}
      </div>
    `;

    // Wire row clicks -> focus/highlight item on map
    wrap.querySelectorAll('.tanya-result-row').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-card-idx'), 10);
        const card = cards[idx];
        const bridge = getBridge();
        if (!card || !bridge) return;
        if (card.type === 'di' && Number.isFinite(Number(card.id))) {
          bridge.highlightDi(Number(card.id));
        } else if (card.type === 'aset' && Number.isFinite(card.lat) && Number.isFinite(card.lon)) {
          bridge.showAsetNear(card.lat, card.lon, 'ALL');
        } else if (card.type === 'river' && Number.isFinite(card.lat) && Number.isFinite(card.lon)) {
          bridge.setPinpointLocation(card.lat, card.lon, card.name, true, true);
        } else if (Number.isFinite(card.lat) && Number.isFinite(card.lon)) {
          bridge.getMap()?.flyTo([card.lat, card.lon], 13, { duration: 0.8 });
        }
        // On mobile, collapse sheet back to half height so user sees the map immediately
        if (window.innerWidth <= 768) {
          document.getElementById('tanyaSdaPanel')?.classList.remove('expanded');
        }
      });
    });

    // Wire "Lihat di Peta"
    const miniStrip = wrap.querySelector('.tanya-minimap-strip');
    if (miniStrip) {
      miniStrip.addEventListener('click', () => {
        executeMapAction(data);
        if (window.innerWidth <= 768) {
          document.getElementById('tanyaSdaPanel')?.classList.remove('expanded');
        }
      });
    }

    // Wire "Detail"
    const btnDetail = wrap.querySelector('.btn-tanya-detail');
    if (btnDetail) {
      btnDetail.addEventListener('click', () => {
        const bridge = getBridge();
        if (!bridge) return;
        const firstDi = cards.find((c) => c.type === 'di' && Number.isFinite(Number(c.id)));
        if (firstDi) {
          bridge.highlightDi(Number(firstDi.id));
        } else {
          bridge.openSidebar();
        }
      });
    }

    // Wire "Salin"
    const btnCopy = wrap.querySelector('.btn-tanya-copy');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const txt = buildShareText(data);
        navigator.clipboard
          ?.writeText(txt)
          .then(() => getBridge()?.showToast('Disalin ke Clipboard', 'Ringkasan jawaban Tanya SDA siap ditempel ke WhatsApp/laporan.'))
          .catch(() => getBridge()?.showToast('Info', 'Salin manual teks di atas jika browser membatasi clipboard.'));
      });
    }

    // Wire "Bagikan"
    const btnShare = wrap.querySelector('.btn-tanya-share');
    if (btnShare) {
      btnShare.addEventListener('click', async () => {
        const txt = buildShareText(data);
        if (navigator.share) {
          try {
            await navigator.share({ title: 'Tanya SDA • WebGIS DI Jawa Timur', text: txt });
            return;
          } catch (_) {
            // User canceled or unsupported
          }
        }
        navigator.clipboard
          ?.writeText(txt)
          .then(() => getBridge()?.showToast('Tautan & Ringkasan Disalin', 'Siap dibagikan ke tim lapangan atau pimpinan.'));
      });
    }

    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;

    // Update quick suggestion chips
    if (Array.isArray(data.follow_ups) && data.follow_ups.length > 0 && !meta.isWelcome) {
      renderQuickChips(data.follow_ups);
    }
  }

  function renderQuickChips(suggestions) {
    const wrap = document.getElementById('tanyaChipsWrap');
    if (!wrap) return;
    const icons = ['fa-earth-asia', 'fa-water', 'fa-layer-group', 'fa-compass'];
    wrap.innerHTML = suggestions
      .slice(0, 4)
      .map(
        (label, idx) => `
        <button class="tanya-chip" data-prompt="${escapeHtml(label)}" ${quotaState.exhausted ? 'disabled' : ''}>
          <i class="fa-solid ${icons[idx % icons.length]}"></i> ${escapeHtml(label)}
        </button>`
      )
      .join('');

    wrap.querySelectorAll('.tanya-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-prompt');
        if (q) sendUserPrompt(q);
      });
    });
  }

  // =========================================================================
  // 9. CHAT SUBMISSION FLOW (CLOUDFLARE WORKER -> GEMINI 3.8 -> 4.0 HYDROGEN)
  // =========================================================================
  async function sendUserPrompt(rawText, options = {}) {
    const text = String(rawText || '').trim();
    if (!text || isBusy) return;

    // HARD ZERO-COST GUARD: Block AI queries when daily quota is exhausted!
    if (quotaState.exhausted && !options.forceLocal) {
      getBridge()?.showToast(
        'Kuota Harian AI Habis',
        `Tanya SDA dinonaktifkan sementara hingga reset harian (${quotaState.resetAtWib || '00:00 WIB'}) untuk mencegah biaya tambahan.`
      );
      updateQuotaUi(quotaState);
      return;
    }

    const inputEl = document.getElementById('tanyaInputField');
    if (inputEl) inputEl.value = '';

    const bridge = getBridge();
    const activePin = bridge?.getCurrentPinpoint ? bridge.getCurrentPinpoint() : null;
    const locationHint = activePin
      ? `${activePin.sourceLabel || 'Titik Target'} (${activePin.lat.toFixed(4)}°, ${activePin.lon.toFixed(4)}°)`
      : 'Lokasi peta saat ini';

    appendUserMessage(text, locationHint);

    // Explicit offline/local deterministic analysis (0 API calls)
    if (options.forceLocal) {
      const localData = await runLocalFallbackAnalysis(text);
      appendBotMessage(localData, { modelLabel: 'Analisis Lokal Deterministik (Tanpa AI • 0 Kuota)' });
      if (localData.map_action && localData.map_action.type !== 'none') {
        executeMapAction(localData);
      }
      return;
    }

    isBusy = true;
    const sendBtn = document.getElementById('tanyaSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    appendTypingIndicator();

    try {
      const spatialContext = await buildSpatialContext(text);
      const baseUrl = resolveWorkerBaseUrl();

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-App': 'webgis-di-jatim'
        },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-6),
          spatialContext
        })
      });

      const payload = await res.json().catch(() => null);
      removeTypingIndicator();

      if (payload?.quota) {
        updateQuotaUi(payload.quota);
      }

      if (res.status === 429 && payload?.code === 'QUOTA_EXHAUSTED') {
        // Hard lock UI immediately!
        updateQuotaUi({ ...(payload.quota || quotaState), exhausted: true, remaining: 0 });
        appendBotMessage(
          {
            answer:
              payload.message ||
              'Kuota harian AI-Agent (Free Tier) telah habis. AI-Agent dikunci sementara hingga reset pukul 00:00 WIB agar tidak menimbulkan biaya tambahan.',
            cards: [],
            location_label: 'Perlindungan Kuota Free Tier',
            assumption: 'Anda tetap dapat menggunakan seluruh fitur peta WebGIS dan tombol Analisis Lokal (Tanpa AI) di atas.',
            map_action: { type: 'none' },
            follow_ups: []
          },
          { modelLabel: 'Quota Guard Aktif' }
        );
        bridge?.showToast('Kuota Harian AI Habis', 'Pertanyaan AI dikunci hingga 00:00 WIB untuk menjaga biaya Rp 0.');
        return;
      }

      if (res.status === 429 && payload?.code === 'RATE_LIMITED') {
        appendBotMessage(
          {
            answer: payload.message || 'Permintaan terlalu cepat. Mohon tunggu ~15 detik lalu kirim ulang.',
            cards: [],
            location_label: 'Perlindungan Rate Limit Free Tier',
            assumption: 'Kuota harian Anda tidak terpotong.',
            map_action: { type: 'none' },
            follow_ups: ['5 DI Terdekat', 'Sungai Terdekat', 'Aset Tanah']
          },
          { modelLabel: 'Rate Limit Guard' }
        );
        return;
      }

      if (!res.ok || !payload?.ok || !payload?.data) {
        throw new Error(payload?.message || `HTTP ${res.status}`);
      }

      lastModelUsed = payload.modelUsed || 'gemini-3.8-flash';
      const modelPill = document.getElementById('tanyaModelPill');
      if (modelPill) {
        modelPill.innerHTML = `<i class="fa-solid fa-microchip"></i> ${escapeHtml(lastModelUsed)}`;
      }

      const modelDesc = payload.fallbackUsed
        ? `${lastModelUsed} (otomatis beralih dari gemini-3.8-flash)`
        : lastModelUsed;

      chatHistory.push({ role: 'user', text });
      chatHistory.push({ role: 'model', text: payload.data.answer });
      if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

      appendBotMessage(payload.data, { modelLabel: modelDesc });

      // Automatically synchronize map with AI answer!
      if (payload.data.map_action && payload.data.map_action.type !== 'none') {
        executeMapAction(payload.data);
      }
    } catch (err) {
      removeTypingIndicator();
      console.warn('[Tanya SDA] Worker unavailable, switching to deterministic local fallback:', err);
      const localData = await runLocalFallbackAnalysis(text);
      localData.assumption = `Koneksi server AI-Agent sedang tidak terjangkau (${err.message || 'offline'}). Menampilkan hasil akurat dari mode fallback tanpa AI.`;
      appendBotMessage(localData, { modelLabel: 'Fallback Lokal (Tanpa AI)' });
      if (localData.map_action && localData.map_action.type !== 'none') {
        executeMapAction(localData);
      }
    } finally {
      isBusy = false;
      if (sendBtn && !quotaState.exhausted) sendBtn.disabled = false;
    }
  }

  // =========================================================================
  // 10. PANEL OPEN/CLOSE & MOBILE BOTTOM SHEET DRAG GESTURE
  // =========================================================================
  function setPanelOpen(open) {
    const panel = document.getElementById('tanyaSdaPanel');
    const navBtn = document.getElementById('btnOpenTanyaSda');
    const mobileFab = document.getElementById('tanyaSdaMobileFab');
    if (!panel) return;

    isOpen = Boolean(open);
    panel.classList.toggle('hidden', !isOpen);
    document.body.classList.toggle('tanya-sda-open', isOpen);
    if (navBtn) navBtn.classList.toggle('active', isOpen);
    if (mobileFab) mobileFab.classList.toggle('hidden', isOpen);

    if (isOpen) {
      // On mobile, close left sidebar so sheets don't collide
      if (window.innerWidth <= 768) {
        getBridge()?.closeSidebar?.();
      }
      fetchQuotaStatus();
      setTimeout(() => {
        getBridge()?.getMap?.()?.invalidateSize?.();
        const input = document.getElementById('tanyaInputField');
        if (input && !input.disabled && window.innerWidth > 768) {
          input.focus();
        }
      }, 260);
    } else {
      setTimeout(() => {
        getBridge()?.getMap?.()?.invalidateSize?.();
      }, 260);
    }
  }

  function setupMobileSheetDrag() {
    const handle = document.getElementById('tanyaSheetHandleWrap');
    const panel = document.getElementById('tanyaSdaPanel');
    if (!handle || !panel) return;

    let startY = 0;
    let deltaY = 0;

    handle.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        panel.classList.toggle('expanded');
      }
    });

    handle.addEventListener(
      'touchstart',
      (e) => {
        if (window.innerWidth > 768) return;
        startY = e.touches[0].clientY;
        deltaY = 0;
      },
      { passive: true }
    );

    handle.addEventListener(
      'touchmove',
      (e) => {
        if (window.innerWidth > 768) return;
        deltaY = e.touches[0].clientY - startY;
      },
      { passive: true }
    );

    handle.addEventListener(
      'touchend',
      () => {
        if (window.innerWidth > 768) return;
        if (deltaY < -45) {
          panel.classList.add('expanded');
        } else if (deltaY > 90) {
          if (panel.classList.contains('expanded')) {
            panel.classList.remove('expanded');
          } else {
            setPanelOpen(false);
          }
        }
      },
      { passive: true }
    );
  }

  // =========================================================================
  // 11. INITIALIZATION
  // =========================================================================
  function initTanyaSda() {
    injectTanyaSdaDom();
    renderWelcomeMessage();
    setupMobileSheetDrag();

    document.getElementById('btnOpenTanyaSda')?.addEventListener('click', () => setPanelOpen(!isOpen));
    document.getElementById('tanyaSdaMobileFab')?.addEventListener('click', () => setPanelOpen(true));
    document.getElementById('btnCloseTanyaSda')?.addEventListener('click', () => setPanelOpen(false));

    document.getElementById('btnTanyaClearChat')?.addEventListener('click', () => {
      chatHistory = [];
      clearAiMapOverlay();
      renderWelcomeMessage();
      getBridge()?.showToast('Percakapan Dibersihkan', 'Riwayat chat Tanya SDA telah direset.');
    });

    document.getElementById('tanyaSdaForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('tanyaInputField');
      if (input && input.value.trim()) {
        sendUserPrompt(input.value);
      }
    });

    // Initial chips
    document.querySelectorAll('.tanya-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-prompt');
        if (q) sendUserPrompt(q);
      });
    });

    // Explicit non-AI local fallback buttons (available even when AI quota is exhausted!)
    document.getElementById('btnRunLocalProximity')?.addEventListener('click', () => {
      sendUserPrompt('DI terdekat di lokasi ini apa saja?', { forceLocal: true });
    });
    document.getElementById('btnRunLocalRivers')?.addEventListener('click', () => {
      sendUserPrompt('Sungai terdekat dari lokasi ini apa saja?', { forceLocal: true });
    });

    // Clear AI overlay when user clears target or resets view
    document.getElementById('btnResetView')?.addEventListener('click', clearAiMapOverlay);
    document.getElementById('btnFloatingClearSelection')?.addEventListener('click', clearAiMapOverlay);

    // Expose public API for testing & external hooks
    window.TanyaSdaAgent = {
      open: () => setPanelOpen(true),
      close: () => setPanelOpen(false),
      ask: (q, opts) => {
        setPanelOpen(true);
        return sendUserPrompt(q, opts);
      },
      getQuota: () => ({ ...quotaState }),
      refreshQuota: fetchQuotaStatus,
      clearOverlay: clearAiMapOverlay,
      setWorkerUrl: (url) => {
        localStorage.setItem('tanya_sda_worker_url', url.replace(/\/+$/, ''));
        fetchQuotaStatus();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTanyaSda);
  } else {
    initTanyaSda();
  }
})();
