/**
 * SEBARAN DAERAH IRIGASI (DI) KEWENANGAN PROVINSI JAWA TIMUR
 * Core WebGIS Logic: Leaflet Engine, Coordinate Parsing, Proximity Radar
 * Author: Antigravity AI & Dinas PU SDA Jawa Timur
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. STATE & CONFIGURATION
  const EAST_JAVA_CENTER = [-7.75, 112.55];
  const DEFAULT_ZOOM = 8;
  
  let map;
  let currentBasemap;
  let activePinpointMarker = null;
  let radarPolylines = [];
  let markerClusterGroup;
  let allDiData = [];
  let diMarkersMap = new Map();

  // UPT Badge Color Config
  const UPT_CONFIG = {
    'Korwil Madiun': { color: '#3b82f6', badgeClass: 'badge-madiun', pin: '#60a5fa' },
    'Korwil Malang': { color: '#10b981', badgeClass: 'badge-malang', pin: '#34d399' },
    'Perwakilan Mojokerto': { color: '#f59e0b', badgeClass: 'badge-mojokerto', pin: '#fbbf24' },
    'UPT Bojonegoro': { color: '#ef4444', badgeClass: 'badge-bojonegoro', pin: '#f87171' },
    'UPT Bondowoso': { color: '#a855f7', badgeClass: 'badge-bondowoso', pin: '#c084fc' },
    'UPT Kediri': { color: '#ec4899', badgeClass: 'badge-kediri', pin: '#f472b6' },
    'UPT Lumajang': { color: '#14b8a6', badgeClass: 'badge-lumajang', pin: '#2dd4bf' },
    'UPT Madura': { color: '#eab308', badgeClass: 'badge-madura', pin: '#facc15' },
    'UPT Pasuruan': { color: '#6366f1', badgeClass: 'badge-pasuruan', pin: '#818cf8' },
    'DEFAULT': { color: '#00e5ff', badgeClass: 'badge-default', pin: '#38bdf8' }
  };

  // 2. BASEMAP DEFINITIONS (SATELLITE HYBRID WITH RICH LABELS)
  const basemapLayers = {
    'esri-satellite': L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
        maxZoom: 19
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Labels &copy; Esri',
        maxZoom: 19
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Roads &copy; Esri',
        maxZoom: 19
      })
    ]),
    'google-satellite': L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps Satellite Hybrid',
      maxZoom: 20
    }),
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }),
    'carto-dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB Dark Matter',
      maxZoom: 19
    })
  };

  // 3. INITIALIZE LEAFLET MAP
  function initMap() {
    map = L.map('map', {
      center: EAST_JAVA_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      layers: [basemapLayers['esri-satellite']]
    });

    currentBasemap = basemapLayers['esri-satellite'];

    // Add Zoom Control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initialize MarkerCluster
    markerClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div style="background: rgba(0, 229, 255, 0.85); color: #070d1e; font-weight: 800; font-family: Inter, sans-serif; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px rgba(0, 229, 255, 0.6); border: 2px solid #ffffff;">${count}</div>`,
          className: 'custom-cluster-icon',
          iconSize: [36, 36]
        });
      }
    });

    map.addLayer(markerClusterGroup);

    // Click map to trigger pinpoint & proximity
    map.on('click', (e) => {
      setPinpointLocation(e.latlng.lat, e.latlng.lng, 'Titik Klik di Peta');
    });
  }

  // 4. LOAD & RENDER DATA SEBARAN DI
  function loadDiData() {
    if (window.DI_JATIM_DATA && Array.isArray(window.DI_JATIM_DATA)) {
      allDiData = window.DI_JATIM_DATA;
      renderDiMarkers(allDiData);
    } else {
      // Fallback fetch if opened over HTTP/HTTPS
      fetch('data/di_jatim.json')
        .then(res => res.json())
        .then(data => {
          allDiData = data;
          renderDiMarkers(allDiData);
        })
        .catch(err => {
          console.error('Gagal memuat data DI:', err);
          showToast('Peringatan Data', 'Gagal memuat file spasial DI. Pastikan folder data lengkap.');
        });
    }
  }

  function createCustomMarkerIcon(upt) {
    const cfg = UPT_CONFIG[upt] || UPT_CONFIG['DEFAULT'];
    return L.divIcon({
      className: 'custom-di-pin',
      html: `
        <div style="background-color: ${cfg.pin}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 8px ${cfg.pin};"></div>
      `,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  function renderDiMarkers(dataList) {
    markerClusterGroup.clearLayers();
    diMarkersMap.clear();

    dataList.forEach(di => {
      if (!di.lat || !di.lon) return;

      const icon = createCustomMarkerIcon(di.upt);
      const marker = L.marker([di.lat, di.lon], { icon: icon });

      const cfg = UPT_CONFIG[di.upt] || UPT_CONFIG['DEFAULT'];
      const dmsLat = formatDdToDms(di.lat, 'lat');
      const dmsLon = formatDdToDms(di.lon, 'lon');

      const popupHtml = `
        <div class="di-popup-container">
          <span class="di-popup-badge ${cfg.badgeClass}">${di.upt}</span>
          <h3 class="di-popup-title">${di.nama_di}</h3>
          <div class="di-popup-row">
            <span class="label">Latitude</span>
            <span class="value">${di.lat.toFixed(6)}° (${dmsLat})</span>
          </div>
          <div class="di-popup-row">
            <span class="label">Longitude</span>
            <span class="value">${di.lon.toFixed(6)}° (${dmsLon})</span>
          </div>
          <div class="di-popup-row" id="popupDistRow-${di.id}" style="display: none;">
            <span class="label">Jarak dari Titik</span>
            <span class="value text-warning" id="popupDistVal-${di.id}">-</span>
          </div>
          <div class="di-popup-files">
            <i class="fa-solid fa-file-shield"></i> Lapisan: ${di.files.length} File KMZ/KML
          </div>
          <div class="di-popup-actions">
            <a href="https://www.google.com/maps?q=${di.lat},${di.lon}" target="_blank" class="btn-popup">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Google Maps
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      markerClusterGroup.addLayer(marker);
      diMarkersMap.set(di.id, { marker: marker, data: di });
    });

    document.getElementById('statDisplayed').textContent = dataList.length;
  }

  // 5. COORDINATE CONVERSION & PARSER UTILITIES
  function formatDdToDms(val, type) {
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const d = Math.floor(absVal);
    const mFloat = (absVal - d) * 60;
    const m = Math.floor(mFloat);
    const s = ((mFloat - m) * 60).toFixed(2);
    const dir = type === 'lat' ? (isNegative ? 'S' : 'N') : (isNegative ? 'W' : 'E');
    return `${d}°${m}'${s}"${dir}`;
  }

  function dmsToDd(d, m, s, dir) {
    let dd = parseFloat(d) + parseFloat(m) / 60.0 + parseFloat(s) / 3600.0;
    if (dir && (dir.toUpperCase() === 'S' || dir.toUpperCase() === 'W')) {
      dd = -dd;
    }
    return dd;
  }

  /**
   * Smart Coordinate Parser:
   * Accepts DD (-7.718417, 112.909267) or DMS (7°43'6.30"S, 112°54'33.36"E)
   */
  function parseCoordinateString(inputStr) {
    if (!inputStr) return null;
    let str = inputStr.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');

    // 1. Try DMS pattern: e.g. 7°43'6.30"S 112°54'33.36"E
    const dmsRegex = /(\d+)[\s°]+(\d+)[\s']+([\d\.]+)[\s"]*([NSEWnsew])/g;
    const dmsMatches = [...str.matchAll(dmsRegex)];

    if (dmsMatches.length >= 2) {
      let lat = null, lon = null;
      dmsMatches.forEach(match => {
        const d = parseFloat(match[1]);
        const m = parseFloat(match[2]);
        const s = parseFloat(match[3]);
        const dir = match[4].toUpperCase();
        if (dir === 'N' || dir === 'S') lat = dmsToDd(d, m, s, dir);
        if (dir === 'E' || dir === 'W') lon = dmsToDd(d, m, s, dir);
      });
      if (lat !== null && lon !== null) return { lat, lon };
    }

    // 2. Try decimal numbers: -7.718417 112.909267
    const numRegex = /[-+]?\d*\.?\d+/g;
    const numMatches = str.match(numRegex);
    if (numMatches && numMatches.length >= 2) {
      const lat = parseFloat(numMatches[0]);
      const lon = parseFloat(numMatches[1]);
      // Validate reasonable coordinates for Indonesia/Java (Lat: -11 to -5, Lon: 105 to 118)
      if (lat >= -12 && lat <= -4 && lon >= 105 && lon <= 118) {
        return { lat, lon };
      }
      // If swapped (lon first)
      if (lon >= -12 && lon <= -4 && lat >= 105 && lat <= 118) {
        return { lat: lon, lon: lat };
      }
      return { lat, lon };
    }

    return null;
  }

  // 6. GEODESIC HAVERSINE DISTANCE (KM)
  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth Radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // 7. PINPOINT & PROXIMITY SIGNAL (RADAR CORE FEATURE)
  function setPinpointLocation(lat, lon, sourceLabel = 'Titik Lokasi') {
    // Clean previous pinpoint and polylines
    if (activePinpointMarker) {
      map.removeLayer(activePinpointMarker);
    }
    radarPolylines.forEach(p => map.removeLayer(p));
    radarPolylines = [];

    // Create Radar Pulsing HTML Marker
    const radarIcon = L.divIcon({
      className: 'radar-pulse-icon',
      html: `
        <div class="ring"></div>
        <div class="center-dot"></div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    activePinpointMarker = L.marker([lat, lon], {
      icon: radarIcon,
      zIndexOffset: 1000
    }).addTo(map);

    const dmsLat = formatDdToDms(lat, 'lat');
    const dmsLon = formatDdToDms(lon, 'lon');

    activePinpointMarker.bindPopup(`
      <div style="padding: 10px; font-family: Inter, sans-serif;">
        <span style="background: rgba(245, 158, 11, 0.25); color: #fbbf24; font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">${sourceLabel}</span>
        <h4 style="margin: 6px 0 4px 0; color: #ffffff; font-size: 0.9rem;">Titik Target Aktif</h4>
        <p style="font-size: 0.74rem; color: #94a3b8; margin: 0;">${lat.toFixed(6)}°, ${lon.toFixed(6)}°</p>
        <p style="font-size: 0.7rem; color: #38bdf8; font-family: monospace; margin: 2px 0 0 0;">${dmsLat}, ${dmsLon}</p>
      </div>
    `).openPopup();

    // Update Coordinate Badge
    document.getElementById('pinpointCoordBadge').textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

    // Compute proximity to all DIs
    const proximityData = allDiData.map(di => {
      const dist = calculateDistanceKm(lat, lon, di.lat, di.lon);
      return { ...di, distance: dist };
    });

    // Sort ascending
    proximityData.sort((a, b) => a.distance - b.distance);

    // Take Top 5 nearest DIs
    const nearest5 = proximityData.slice(0, 5);

    // Draw animated connection polylines to Top 5
    nearest5.forEach((di, index) => {
      const isNearest = index === 0;
      const polyline = L.polyline([[lat, lon], [di.lat, di.lon]], {
        color: isNearest ? '#10b981' : '#f59e0b',
        weight: isNearest ? 3 : 1.5,
        opacity: isNearest ? 0.9 : 0.6,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(map);

      radarPolylines.push(polyline);
    });

    // Populate Sidebar 5 DI Terdekat
    renderNearestList(nearest5, lat, lon);

    // Show Notification Toast
    if (nearest5.length > 0) {
      const top1 = nearest5[0];
      showToast(
        'Sinyal Proksimitas Terdeteksi!',
        `Titik ini terdekat dengan <strong>${top1.nama_di}</strong> (${top1.upt}) berjarak <strong>${top1.distance.toFixed(2)} km</strong>.`
      );
    }

    // Zoom/Pan to fit pinpoint and top 3 nearest
    const fitBounds = L.latLngBounds([[lat, lon], [nearest5[0].lat, nearest5[0].lon]]);
    map.flyToBounds(fitBounds, { padding: [60, 60], maxZoom: 14, duration: 1 });
  }

  let currentNearestItems = [];
  let currentTargetCoords = null;

  function renderNearestList(nearestItems, targetLat, targetLon) {
    currentNearestItems = nearestItems;
    currentTargetCoords = { lat: targetLat, lon: targetLon };

    const listContainer = document.getElementById('proximityList');
    const emptyContainer = document.getElementById('proximityEmpty');
    const actionsContainer = document.getElementById('proximityActions');

    emptyContainer.style.display = 'none';
    listContainer.classList.remove('hidden');
    if (actionsContainer) actionsContainer.classList.remove('hidden');
    listContainer.innerHTML = '';

    // Distance warning if top 1 > 25 km
    if (nearestItems.length > 0 && nearestItems[0].distance > 25) {
      const warnEl = document.createElement('div');
      warnEl.style.cssText = 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; padding: 8px 10px; font-size: 0.72rem; color: #fca5a5; margin-bottom: 6px;';
      warnEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Peringatan Radius:</strong> DI terdekat berjarak <strong>${nearestItems[0].distance.toFixed(2)} km</strong> (mungkin di luar jangkauan layanan irigasi provinsi).`;
      listContainer.appendChild(warnEl);
    }

    nearestItems.forEach((item, idx) => {
      const rank = idx + 1;
      const itemEl = document.createElement('div');
      itemEl.className = `nearest-item rank-${rank}`;
      itemEl.innerHTML = `
        <div class="item-left">
          <div class="rank-badge">#${rank}</div>
          <div class="di-details">
            <h4>${item.nama_di}</h4>
            <span><i class="fa-solid fa-building-flag"></i> ${item.upt}</span>
          </div>
        </div>
        <div class="item-right">
          <div class="dist-badge">${item.distance.toFixed(2)} km</div>
        </div>
      `;

      itemEl.addEventListener('click', () => {
        focusOnDi(item.id);
      });

      listContainer.appendChild(itemEl);
    });
  }

  // Generate Report Text
  function generateReportText() {
    if (!currentTargetCoords || currentNearestItems.length === 0) return '';
    const dmsLat = formatDdToDms(currentTargetCoords.lat, 'lat');
    const dmsLon = formatDdToDms(currentTargetCoords.lon, 'lon');

    let text = `*LAPORAN PROKSIMITAS DAERAH IRIGASI (DI) PROVINSI JAWA TIMUR*\n`;
    text += `Titik Koordinat: ${currentTargetCoords.lat.toFixed(6)}, ${currentTargetCoords.lon.toFixed(6)}\n`;
    text += `Format DMS: ${dmsLat}, ${dmsLon}\n`;
    text += `Google Maps: https://www.google.com/maps?q=${currentTargetCoords.lat},${currentTargetCoords.lon}\n\n`;
    text += `*5 DI Terdekat:*\n`;

    currentNearestItems.forEach((item, idx) => {
      text += `${idx + 1}. ${item.nama_di} (${item.upt}) - Jarak: ${item.distance.toFixed(2)} km\n`;
    });

    text += `\n_Dinas PU Sumber Daya Air Provinsi Jawa Timur (WebGIS Portal)_`;
    return text;
  }

  // Setup WhatsApp & Copy Event Listeners
  const btnShareWa = document.getElementById('btnShareWa');
  if (btnShareWa) {
    btnShareWa.addEventListener('click', () => {
      const text = generateReportText();
      if (!text) return;
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    });
  }

  const btnCopyReport = document.getElementById('btnCopyReport');
  if (btnCopyReport) {
    btnCopyReport.addEventListener('click', () => {
      const text = generateReportText();
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Laporan Disalin!', 'Teks ringkasan 5 DI terdekat berhasil disalin ke clipboard.');
      }).catch(() => {
        showToast('Gagal Salin', 'Silakan izinkan akses clipboard browser.');
      });
    });
  }

  function focusOnDi(diId) {
    const item = diMarkersMap.get(diId);
    if (item) {
      const marker = item.marker;
      markerClusterGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();
      });
    }
  }

  // 8. TOAST NOTIFICATION UTILITY
  function showToast(title, message) {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').innerHTML = message;

    toast.classList.remove('hidden');

    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 6000);
  }

  document.getElementById('btnToastClose').addEventListener('click', () => {
    document.getElementById('toastNotification').classList.add('hidden');
  });

  // 9. EVENT LISTENERS: SEARCH COORDINATES
  // Tab Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      document.getElementById(targetTab).classList.add('active');
    });
  });

  // Smart Search Button
  document.getElementById('btnSmartSearch').addEventListener('click', () => {
    const val = document.getElementById('smartCoordInput').value;
    const parsed = parseCoordinateString(val);
    if (parsed) {
      setPinpointLocation(parsed.lat, parsed.lon, 'Pencarian Koordinat');
    } else {
      showToast('Format Tidak Valid', 'Pastikan memasukkan format desimal (-7.71, 112.9) atau DMS (7°43\'S 112°54\'E).');
    }
  });

  document.getElementById('smartCoordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btnSmartSearch').click();
    }
  });

  // Manual Search Button
  document.getElementById('btnManualSearch').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lon = parseFloat(document.getElementById('manualLon').value);
    if (!isNaN(lat) && !isNaN(lon)) {
      setPinpointLocation(lat, lon, 'Input Manual (DD)');
    } else {
      showToast('Input Kurang Lengkap', 'Masukkan nilai Latitude dan Longitude yang valid.');
    }
  });

  // GPS Geolocation Handler
  function handleGpsClick() {
    const statusEl = document.getElementById('gpsStatus');
    statusEl.textContent = 'Mencari sinyal satelit GPS...';

    if (!navigator.geolocation) {
      statusEl.textContent = 'Geolocation tidak didukung oleh browser ini.';
      showToast('GPS Error', 'Browser Anda tidak mendukung layanan Geolocation.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);

        statusEl.textContent = `Akurasi GPS: ±${acc} meter`;
        setPinpointLocation(lat, lon, `Posisi GPS Saya (±${acc}m)`);
      },
      (err) => {
        statusEl.textContent = 'Gagal mengakses GPS. Periksa izin lokasi.';
        showToast('Izin Lokasi Ditolak', 'Pastikan izin akses lokasi/GPS telah diaktifkan di browser.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  document.getElementById('btnQuickGps').addEventListener('click', handleGpsClick);
  document.getElementById('btnGpsInside').addEventListener('click', handleGpsClick);

  // 10. FILTER & LIVE SEARCH
  function applyFilters() {
    const selectedUpt = document.getElementById('uptFilter').value;
    const query = document.getElementById('searchDiName').value.toLowerCase().trim();

    const filtered = allDiData.filter(di => {
      const matchUpt = (selectedUpt === 'ALL') || (di.upt === selectedUpt);
      const matchName = !query || di.nama_di.toLowerCase().includes(query);
      return matchUpt && matchName;
    });

    renderDiMarkers(filtered);
  }

  document.getElementById('uptFilter').addEventListener('change', applyFilters);
  document.getElementById('searchDiName').addEventListener('input', applyFilters);

  // 11. BASEMAP SWITCHER
  const btnToggleBasemap = document.getElementById('btnToggleBasemap');
  const basemapDropdown = document.getElementById('basemapDropdown');

  btnToggleBasemap.addEventListener('click', (e) => {
    e.stopPropagation();
    basemapDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!basemapDropdown.contains(e.target) && e.target !== btnToggleBasemap) {
      basemapDropdown.classList.add('hidden');
    }
  });

  document.querySelectorAll('.basemap-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const layerKey = btn.getAttribute('data-layer');
      if (basemapLayers[layerKey] && currentBasemap !== basemapLayers[layerKey]) {
        map.removeLayer(currentBasemap);
        currentBasemap = basemapLayers[layerKey];
        map.addLayer(currentBasemap);

        document.querySelectorAll('.basemap-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        basemapDropdown.classList.add('hidden');
      }
    });
  });

  // 12. SIDEBAR TOGGLE & RESET VIEW
  const sidebar = document.getElementById('sidebar');
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
  });
  document.getElementById('btnCloseSidebar').addEventListener('click', () => {
    sidebar.classList.add('hidden');
  });

  document.getElementById('btnResetView').addEventListener('click', () => {
    map.flyTo(EAST_JAVA_CENTER, DEFAULT_ZOOM, { duration: 1.2 });
  });

  // START APPLICATION
  initMap();
  loadDiData();
});
