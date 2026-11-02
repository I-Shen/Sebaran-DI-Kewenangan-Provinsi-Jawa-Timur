/**
 * SEBARAN DAERAH IRIGASI (DI) KEWENANGAN PROVINSI JAWA TIMUR
 * Core WebGIS Logic: Leaflet Engine, Coordinate Parsing, Proximity Radar, Vector GeoJSON Highlighting
 * Author: Antigravity AI & Dinas PU SDA Jawa Timur
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. STATE & CONFIGURATION
  const EAST_JAVA_CENTER = [-7.75, 112.75];
  const DEFAULT_ZOOM = 8;
  const EAST_JAVA_BOUNDS = [
    [-8.85, 110.85], // Barat Daya (Pacitan/Bojonegoro/Ngawi)
    [-6.70, 114.75]  // Timur Laut (Madura/Situbondo/Banyuwangi)
  ];
  
  let map;
  let currentBasemap;
  let activePinpointMarker = null;
  let radarPolylines = [];
  let markerClusterGroup;
  let allDiData = [];
  let diMarkersMap = new Map();
  let currentHighlightLayer = null;

  // GOOGLE EARTH MISS-CLICK MITIGATION & MOBILE STATE
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  let isTargetLocked = false;
  let pinpointHistory = []; // Stack for Undo (Ctrl+Z)
  let currentPinpointCoord = null;

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
      renderer: L.canvas({ tolerance: isTouchDevice ? 26 : 14 }), // Wide hit tolerance for vector lines/polygons
      layers: [basemapLayers['esri-satellite']]
    });

    currentBasemap = basemapLayers['esri-satellite'];

    // Inisialisasi awal: kunci batas langsung 1 Provinsi Jawa Timur utuh
    map.fitBounds(EAST_JAVA_BOUNDS, { padding: [15, 15] });

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

    // Click map to trigger pinpoint & proximity (Google Earth miss-click mitigation)
    map.on('click', (e) => {
      if (isTargetLocked) {
        showToast('Target Terkunci', 'Buka kunci target di bilah bawah untuk memindahkan titik.');
        return;
      }
      // Pada perangkat sentuh (HP), abaikan klik tunggal di peta kosong agar tidak miss-click saat geser/zoom.
      // Pengguna HP menggunakan Sentuhan Tahan (Long-Press 0.5s) atau tombol "Bidik Pusat Peta"!
      if (isTouchDevice) {
        return;
      }
      setPinpointLocation(e.latlng.lat, e.latlng.lng, 'Titik Klik di Peta', true, true);
    });

    // Pasang gestur Google Earth Mobile Long-Press (Sentuhan Tahan)
    setupMapLongPressGesture();

    // Inisialisasi Custom Panes, Batas WS (Poligon & Notasi) & Sungai Orde 1-2
    initWsAndRivers();
    // Inisialisasi Layer Aset Tanah & Sempadan (Stress Test 1.800 Poligon)
    initAsetTanah();
  }

  // GOOGLE EARTH MOBILE GESTURE: LONG-PRESS (TAHAN 480ms) TO DROP PINPOINT
  function setupMapLongPressGesture() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    let touchTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;

    mapContainer.addEventListener('touchstart', (e) => {
      // Pinch-zoom multitouch atau target terkunci: batalkan long-press seketika
      if (e.touches.length > 1 || isTargetLocked) {
        if (touchTimer) clearTimeout(touchTimer);
        return;
      }

      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      touchTimer = setTimeout(() => {
        // Konversi koordinat layar sentuh ke lat/lng peta Leaflet
        const rect = mapContainer.getBoundingClientRect();
        const containerPt = L.point(touchStartX - rect.left, touchStartY - rect.top);
        const latlng = map.containerPointToLatLng(containerPt);

        // Haptic feedback getaran lembut (seperti Google Earth mobile)
        if (navigator.vibrate) {
          try { navigator.vibrate(35); } catch (_) {}
        }

        setPinpointLocation(latlng.lat, latlng.lng, 'Sentuhan Tahan (HP)', true, true);
        showToast('Titik Ditempatkan', 'Target dipilih via sentuhan tahan (Google Earth pattern).');
      }, 480);
    }, { passive: true });

    mapContainer.addEventListener('touchmove', (e) => {
      if (!touchTimer) return;
      if (e.touches.length > 1) {
        clearTimeout(touchTimer);
        touchTimer = null;
        return;
      }
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      // Jika jari bergeser > 8px, berarti pengguna sedang menggeser/navigasi peta: batalkan drop pin!
      if (dx > 8 || dy > 8) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, { passive: true });

    mapContainer.addEventListener('touchend', () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, { passive: true });

    mapContainer.addEventListener('touchcancel', () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, { passive: true });
  }

  // GOOGLE EARTH ICON CONFIGURATION WITH RANK COLOR ANCHOR RING
  function createGePushpinIcon(colorCfg) {
    const ringColor = (colorCfg && colorCfg.color) ? colorCfg.color : '#f59e0b';
    return L.divIcon({
      className: 'ge-pushpin-marker',
      html: `
        <div class="ge-pin-wrapper">
          <img src="assets/ylw-pushpin.png" class="ge-pushpin-img" alt="Bangunan">
          <div class="ge-pin-ring" style="background: ${ringColor}; box-shadow: 0 0 8px ${ringColor};"></div>
        </div>
      `,
      iconSize: [32, 34],
      iconAnchor: [10, 32],
      popupAnchor: [6, -30]
    });
  }
  const gePushpinIcon = createGePushpinIcon({ color: '#f59e0b' });

  let selectedVectorLayer = null;

  // 4. LOAD & RENDER DATA SEBARAN DI
  function loadDiData() {
    if (window.DI_JATIM_DATA && Array.isArray(window.DI_JATIM_DATA)) {
      allDiData = window.DI_JATIM_DATA;
      onDiDataLoaded(allDiData);
    } else {
      fetch('data/di_jatim.json')
        .then(res => res.json())
        .then(data => {
          allDiData = data;
          onDiDataLoaded(allDiData);
        })
        .catch(err => {
          console.error('Gagal memuat data DI:', err);
          showToast('Peringatan Data', 'Gagal memuat file spasial DI.');
        });
    }
  }

  function onDiDataLoaded(dataList) {
    renderDiMarkers(dataList);
    populateQuickDiSelector(dataList);

    // Tampilan awal saat link pertama kali dibuka: 1 Provinsi Jawa Timur utuh
    const urlParams = new URLSearchParams(window.location.search);
    const initialDiId = parseInt(urlParams.get('di'));
    if (initialDiId) {
      setTimeout(() => {
        highlightDi(initialDiId);
      }, 350);
    } else {
      // Tetap pada zoom 1 Provinsi Jawa Timur utuh
      map.fitBounds(EAST_JAVA_BOUNDS, { padding: [20, 20] });
    }
  }

  function populateQuickDiSelector(dataList) {
    const selectEl = document.getElementById('selectQuickDi');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Pilih DI (Tampilan Google Earth)...</option>';
    
    const sorted = [...dataList].sort((a, b) => a.nama_di.localeCompare(b.nama_di));
    sorted.forEach(di => {
      const opt = document.createElement('option');
      opt.value = di.id;
      opt.textContent = `${di.nama_di} (${di.upt})`;
      selectEl.appendChild(opt);
    });
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
          <div class="di-popup-files">
            <i class="fa-solid fa-file-shield"></i> Sumber Data: Dinas PUSDA Prov. Jawa Timur
          </div>
          <div class="di-popup-actions" style="flex-direction: column; gap: 6px;">
            <button onclick="window.highlightDi(${di.id})" class="btn-popup" style="background: rgba(16, 185, 129, 0.25); border-color: #10b981; color: #34d399;">
              <i class="fa-solid fa-earth-asia"></i> Buka Tampilan Google Earth (1 DI Utuh)
            </button>
            <a href="https://www.google.com/maps?q=${di.lat},${di.lon}" target="_blank" class="btn-popup">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka di Google Maps
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

  // 5. VECTOR GEOJSON LOADER & GOOGLE EARTH RENDERING ENGINE (GAMBAR 2 & GAMBAR 3)
  function loadDiGeoJson(diId, callback) {
    if (window.DI_GEOJSON_CACHE && window.DI_GEOJSON_CACHE[diId]) {
      callback(window.DI_GEOJSON_CACHE[diId]);
      return;
    }

    fetch(`data/geojson/${diId}.json`)
      .then(res => res.json())
      .then(data => {
        window.DI_GEOJSON_CACHE = window.DI_GEOJSON_CACHE || {};
        window.DI_GEOJSON_CACHE[diId] = data;
        callback(data);
      })
      .catch(() => {
        const script = document.createElement('script');
        script.src = `data/geojson/${diId}.js`;
        script.onload = () => {
          if (window.DI_GEOJSON_CACHE && window.DI_GEOJSON_CACHE[diId]) {
            callback(window.DI_GEOJSON_CACHE[diId]);
          } else {
            showToast('Informasi Spasial', 'Data vektor detail untuk DI ini sedang disiapkan.');
          }
        };
        script.onerror = () => {
          showToast('Informasi Spasial', 'Gagal memuat file vektor DI.');
        };
        document.head.appendChild(script);
      });
  }

  // SHOW GOOGLE EARTH INSPECTOR CARD (GAMBAR 3, SUNGAI JATIM, & ASET TANAH)
  function showGoogleEarthInspector(feature, di, layer) {
    const p = feature.properties || {};
    const geomType = feature.geometry ? feature.geometry.type : '';
    const isRiver = Boolean(p.ws_slug || p.Sungai || p.WS);
    const isAsetTanah = p.tipe === 'aset_tanah' || Boolean(p.kode_aset && p.kategori);
    const tipe = isRiver ? 'sungai' : (isAsetTanah ? 'aset_tanah' : (p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'))));

    const inspector = document.getElementById('googleEarthInspector');
    if (!inspector) return;

    // Header Icon
    const iconContainer = document.getElementById('geHeaderIcon');
    if (tipe === 'petak') {
      iconContainer.innerHTML = '<i class="fa-solid fa-draw-polygon" style="color: #16a34a;"></i>';
    } else if (tipe === 'saluran') {
      iconContainer.innerHTML = '<i class="fa-solid fa-route" style="color: #00e5ff;"></i>';
    } else if (tipe === 'sungai') {
      iconContainer.innerHTML = '<i class="fa-solid fa-water" style="color: #38bdf8;"></i>';
    } else if (tipe === 'aset_tanah') {
      iconContainer.innerHTML = `<i class="fa-solid fa-vector-square" style="color: ${p.fillColor || '#f97316'};"></i>`;
    } else {
      iconContainer.innerHTML = '<i class="fa-solid fa-map-pin" style="color: #eab308;"></i>';
    }

    // Title
    const title = isRiver
      ? (p.Sungai ? `Sungai ${p.Sungai}` : 'Alur Sungai Jatim')
      : (isAsetTanah ? (p.nama_aset || 'Aset Tanah Sempadan') : (p.name || p.nomenklatur || p.nama || (tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi'))));
    document.getElementById('geTitle').textContent = title;
    document.getElementById('geTitle').title = title;

    // Subtitle
    const subLabel = isRiver 
      ? `${p.ws_name || p.WS || 'Wilayah Sungai'} • DAS ${p.DAS || '-'}`
      : (isAsetTanah ? `${p.kategori} • ${p.status_tanah || 'Aset Pemerintah'}` : `${tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi')} • ${p.di_name || (di ? di.nama_di : 'Daerah Irigasi')}`);
    document.getElementById('geSubTitle').textContent = subLabel;

    // Metrics Group
    const areaRow = document.getElementById('geAreaRow');
    const perimeterRow = document.getElementById('gePerimeterRow');
    const perimeterLabel = document.getElementById('gePerimeterLabel');

    if (tipe === 'petak' || tipe === 'aset_tanah') {
      areaRow.style.display = 'block';
      document.getElementById('geAreaVal').textContent = typeof p.luas_m2 === 'number' ? `${p.luas_m2.toLocaleString('id-ID')} m²` : (p.area_m2 || '-');
      document.getElementById('geAreaHaVal').textContent = p.luas_ha || p.area_ha || '-';
      perimeterLabel.textContent = tipe === 'aset_tanah' ? 'Keliling Sempadan' : 'Perimeter';
      document.getElementById('gePerimeterVal').textContent = p.perimeter_m || '-';
    } else if (tipe === 'saluran' || tipe === 'sungai') {
      areaRow.style.display = 'none';
      perimeterLabel.textContent = isRiver ? 'Panjang Alur Sungai' : 'Panjang Saluran';
      document.getElementById('gePerimeterVal').textContent = p.Panjang_km ? `${p.Panjang_km} km (${p.Panjang_m || (p.Panjang_km * 1000).toFixed(0)} m)` : (p.panjang_m ? `${p.panjang_m} (${p.panjang_km})` : '-');
    } else {
      areaRow.style.display = 'none';
      perimeterLabel.textContent = 'Koordinat Bangunan';
      if (feature.geometry && feature.geometry.coordinates) {
        const coords = feature.geometry.coordinates;
        document.getElementById('gePerimeterVal').textContent = `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`;
      } else {
        document.getElementById('gePerimeterVal').textContent = '-';
      }
    }

    // Attributes list - update dynamic key labels
    const attrRows = inspector.querySelectorAll('.ge-attr-row');
    const setAttrRow = (idx, key, val) => {
      if (attrRows[idx]) {
        const keyEl = attrRows[idx].querySelector('.ge-attr-key');
        const valEl = attrRows[idx].querySelector('.ge-attr-val');
        if (keyEl) keyEl.textContent = key;
        if (valEl) valEl.textContent = val || '-';
      }
    };

    if (tipe === 'aset_tanah') {
      setAttrRow(0, 'kode_aset', p.kode_aset);
      setAttrRow(1, 'kategori', p.kategori);
      setAttrRow(2, 'nama_aset', p.nama_aset);
      setAttrRow(3, 'no_sertifikat', p.no_sertifikat);
      setAttrRow(4, 'status_tanah', p.status_tanah);
      setAttrRow(5, 'Lokasi / DI', p.di_name || p.kabupaten);
      setAttrRow(6, 'UPT & Kondisi', `${p.upt} • ${p.kondisi_fisik || 'Terawat'}`);
    } else if (isRiver) {
      setAttrRow(0, 'Wilayah Sungai', p.ws_name || p.WS);
      setAttrRow(1, 'Tipe Sungai', p.Tipe_Sungai || 'Sungai Utama');
      setAttrRow(2, 'Nama Sungai', p.Sungai);
      setAttrRow(3, 'Induk Aliran', p.Induk ? `Induk: ${p.Induk}` : (p.Nomenklatr || '-'));
      setAttrRow(4, 'Kabupaten', p.Kabupaten);
      setAttrRow(5, 'DAS', p.DAS ? `DAS ${p.DAS}` : '-');
      setAttrRow(6, 'Pengelola', p.keterangan || 'Wilayah Sungai PUSDA Jatim');
    } else {
      setAttrRow(0, 'id_di', p.id_di || (di ? di.id : '-'));
      setAttrRow(1, 'k_aset', p.k_aset);
      setAttrRow(2, 'nama', p.nama || p.name);
      setAttrRow(3, 'nomenklatur', p.nomenklatur);
      setAttrRow(4, 'norec', p.norec);
      setAttrRow(5, 'Daerah Irigasi', p.di_name || (di ? di.nama_di : '-'));
      setAttrRow(6, 'UPT / Wilayah', p.upt || (di ? di.upt : '-'));
    }

    // Highlight active layer style without corrupting original rank styling
    if (selectedVectorLayer && selectedVectorLayer._originalStyle && selectedVectorLayer.setStyle) {
      selectedVectorLayer.setStyle(selectedVectorLayer._originalStyle);
    }
    selectedVectorLayer = layer;
    if (layer && layer.setStyle) {
      if (!layer._originalStyle && layer.options) {
        layer._originalStyle = {
          color: layer.options.color,
          weight: layer.options.weight,
          fillColor: layer.options.fillColor,
          fillOpacity: layer.options.fillOpacity,
          opacity: layer.options.opacity,
          dashArray: layer.options.dashArray
        };
      }
      if (tipe === 'saluran' || tipe === 'sungai') {
        layer.setStyle({ color: '#ffffff', weight: 4.8, opacity: 1.0 });
        if (layer.bringToFront) layer.bringToFront();
      } else if (tipe === 'aset_tanah') {
        layer.setStyle({ color: '#ffffff', weight: 3.5, fillOpacity: 0.85 });
        if (layer.bringToFront) layer.bringToFront();
      } else if (tipe === 'petak') {
        layer.setStyle({ fillColor: '#4ade80', fillOpacity: 0.65, weight: 3.8, color: '#ffffff' });
        if (layer.bringToFront) layer.bringToFront();
      }
    }

    // Store active feature
    window.currentGeActiveFeature = { feature, di, layer, isRiver, isAsetTanah };

    // Show card
    inspector.classList.remove('hidden');
  }

  // Multi-DI Highlight Storage: Map<diId, { di, layer, mainLayer, rankIndex, colorCfg, counts }>
  const activeHighlightedDis = new Map();
  let currentNearest5List = [];

  // Ranked Color Palettes for Comparing 5 Nearest DIs (Opsi A: Pembeda di tepi saluran & border petak)
  const NEAREST_RANK_COLORS = [
    { rank: 1, color: '#f59e0b', fill: '#f59e0b', badgeBg: '#f59e0b', badgeText: '#451a03', name: 'Rank 1 (Amber Oranye)' },
    { rank: 2, color: '#ec4899', fill: '#ec4899', badgeBg: '#ec4899', badgeText: '#500724', name: 'Rank 2 (Rose Magenta)' },
    { rank: 3, color: '#8b5cf6', fill: '#8b5cf6', badgeBg: '#8b5cf6', badgeText: '#2e1065', name: 'Rank 3 (Electric Violet)' },
    { rank: 4, color: '#eab308', fill: '#eab308', badgeBg: '#eab308', badgeText: '#422006', name: 'Rank 4 (Kuning Emas)' },
    { rank: 5, color: '#14b8a6', fill: '#14b8a6', badgeBg: '#14b8a6', badgeText: '#042f2e', name: 'Rank 5 (Aqua Mint)' }
  ];

  function loadAndAddDiHighlight(diId, rankIndex = 0, autoFit = true, callback = null) {
    const item = diMarkersMap.get(diId) || { data: allDiData.find(d => d.id === diId) };
    if (!item || !item.data) {
      if (callback) callback();
      return;
    }
    const di = item.data;

    // If already loaded, just trigger callback
    if (activeHighlightedDis.has(diId)) {
      if (callback) callback();
      return;
    }

    const colorCfg = NEAREST_RANK_COLORS[rankIndex % NEAREST_RANK_COLORS.length];

    loadDiGeoJson(diId, (geoJsonData) => {
      if (!geoJsonData || !geoJsonData.features || geoJsonData.features.length === 0) {
        if (callback) callback();
        return;
      }

      let countSaluran = 0;
      let countPetak = 0;
      let countBangunan = 0;
      let firstInteractiveFeature = null;
      let firstInteractiveLayer = null;

      const pushpinIcon = createGePushpinIcon(colorCfg);

      // Feature Group penampung dual-stroke casing dan layer utama
      const diFeatureGroup = L.featureGroup();

      // Helper function for attaching events & tooltips to interactive DI elements
      function attachDiEvents(feature, featLayer, tipe) {
        const p = feature.properties || {};
        const title = p.name || p.nomenklatur || p.nama || (tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi'));

        if (featLayer.options) {
          featLayer._originalStyle = {
            color: featLayer.options.color,
            weight: featLayer.options.weight,
            fillColor: featLayer.options.fillColor,
            fillOpacity: featLayer.options.fillOpacity,
            opacity: featLayer.options.opacity
          };
        }

        featLayer.bindTooltip(`
          <div style="font-family: Inter, sans-serif;">
            <span style="display: inline-block; background: ${colorCfg.badgeBg}; color: ${colorCfg.badgeText}; font-size: 0.65rem; font-weight: 800; padding: 1px 6px; border-radius: 3px; margin-bottom: 2px;">#${rankIndex + 1} ${di.nama_di}</span><br>
            <strong>${title}</strong><br>
            <small style="color: #94a3b8;">${tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi')}</small>
          </div>
        `, { sticky: true, className: 'ge-map-tooltip' });

        featLayer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          showGoogleEarthInspector(feature, di, featLayer);
        });

        // Interactive hover feedback
        featLayer.on('mouseover', () => {
          if (featLayer.setStyle && featLayer !== selectedVectorLayer) {
            if (tipe === 'saluran') {
              featLayer.setStyle({ color: '#ffffff', weight: 4.5 });
            } else if (tipe === 'petak') {
              featLayer.setStyle({ fillOpacity: 0.58, weight: 3.5, color: '#ffffff' });
            }
          }
        });

        featLayer.on('mouseout', () => {
          if (featLayer.setStyle && featLayer !== selectedVectorLayer) {
            featLayer.setStyle(featLayer._originalStyle || {
              color: tipe === 'saluran' ? '#00e5ff' : colorCfg.color,
              weight: 2.8,
              fillColor: tipe === 'petak' ? '#22c55e' : undefined,
              fillOpacity: tipe === 'petak' ? 0.35 : undefined
            });
          }
        });

        if (!firstInteractiveFeature && (tipe === 'petak' || tipe === 'saluran')) {
          firstInteractiveFeature = feature;
          firstInteractiveLayer = featLayer;
        }
      }

      // 1. UNDERLAY CASING LAYER: Garis Luar Pembungkus Saluran Irigasi (pane: diCanalsCasingPane zIndex 438)
      const casingLayer = L.geoJSON(geoJsonData, {
        pane: 'diCanalsCasingPane',
        filter: function(feature) {
          const geomType = feature.geometry ? feature.geometry.type : '';
          const p = feature.properties || {};
          const tipe = p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'));
          return tipe === 'saluran' || geomType === 'LineString' || geomType === 'MultiLineString';
        },
        style: function() {
          return {
            color: colorCfg.color, // Warna pembeda DI di tepi saluran
            weight: 6.2,           // Casing lebar membungkus inti air
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false     // Mouse event tembus langsung ke inti saluran
          };
        }
      });
      casingLayer.addTo(diFeatureGroup);

      // 2. LAYER PETAK SAWAH: Poligon Hamparan Sawah Hijau (pane: diPetakPane zIndex 445 - DI BAWAH ASET TANAH)
      const petakLayer = L.geoJSON(geoJsonData, {
        pane: 'diPetakPane',
        filter: function(feature) {
          const geomType = feature.geometry ? feature.geometry.type : '';
          const p = feature.properties || {};
          const tipe = p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'));
          return (geomType === 'Polygon' || geomType === 'MultiPolygon') && tipe !== 'saluran';
        },
        style: function() {
          countPetak++;
          return {
            fillColor: '#22c55e',  // Warna petak sawah: Hijau alami
            fillOpacity: 0.35,      // Transparan agar tekstur citra satelit tetap terlihat
            color: colorCfg.color, // Border petak sawah: Warna pembeda DI
            weight: 2.8,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
          };
        },
        onEachFeature: function(feature, featLayer) {
          attachDiEvents(feature, featLayer, 'petak');
        }
      });
      petakLayer.addTo(diFeatureGroup);

      // 3. LAYER SALURAN IRIGASI: Inti Air Biru (pane: diCanalsPane zIndex 450)
      const canalsLayer = L.geoJSON(geoJsonData, {
        pane: 'diCanalsPane',
        filter: function(feature) {
          const geomType = feature.geometry ? feature.geometry.type : '';
          const p = feature.properties || {};
          const tipe = p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'));
          return tipe === 'saluran' || geomType === 'LineString' || geomType === 'MultiLineString';
        },
        style: function() {
          countSaluran++;
          return {
            color: '#00e5ff', // Inti saluran: Biru muda air alami
            weight: 2.8,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
          };
        },
        onEachFeature: function(feature, featLayer) {
          attachDiEvents(feature, featLayer, 'saluran');
        }
      });
      canalsLayer.addTo(diFeatureGroup);

      // 4. LAYER TITIK BANGUNAN AIR: Pushpin KMZ (pane: diBangunanPane zIndex 520 - DIGESER KE ATAS ASET TANAH)
      const bangunanLayer = L.geoJSON(geoJsonData, {
        pane: 'diBangunanPane',
        filter: function(feature) {
          const geomType = feature.geometry ? feature.geometry.type : '';
          const p = feature.properties || {};
          const tipe = p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'));
          return geomType === 'Point' || geomType === 'MultiPoint' || tipe === 'bangunan';
        },
        pointToLayer: function(feature, latlng) {
          countBangunan++;
          return L.marker(latlng, { icon: pushpinIcon, pane: 'diBangunanPane' });
        },
        onEachFeature: function(feature, featLayer) {
          attachDiEvents(feature, featLayer, 'bangunan');
        }
      });
      bangunanLayer.addTo(diFeatureGroup);

      diFeatureGroup.addTo(map);

      activeHighlightedDis.set(diId, {
        di,
        layer: diFeatureGroup,
        mainLayer: diFeatureGroup,
        firstFeature: firstInteractiveFeature,
        firstLayer: firstInteractiveLayer,
        rankIndex,
        colorCfg,
        counts: { saluran: countSaluran, petak: countPetak, bangunan: countBangunan }
      });

      updateMultiHighlightBanner();
      updateCompareCheckboxes();

      if (autoFit) {
        fitAllActiveHighlightedDis();
      }

      if (callback) callback();
    });
  }

  function removeDiHighlight(diId, autoFit = true) {
    if (activeHighlightedDis.has(diId)) {
      const entry = activeHighlightedDis.get(diId);
      map.removeLayer(entry.layer);
      activeHighlightedDis.delete(diId);
      updateMultiHighlightBanner();
      updateCompareCheckboxes();
      if (autoFit) {
        fitAllActiveHighlightedDis();
      }
    }
  }

  function clearAllHighlightedDis() {
    if (selectedVectorLayer && selectedVectorLayer._originalStyle && selectedVectorLayer.setStyle) {
      selectedVectorLayer.setStyle(selectedVectorLayer._originalStyle);
      selectedVectorLayer = null;
    }
    activeHighlightedDis.forEach(entry => {
      map.removeLayer(entry.layer);
    });
    activeHighlightedDis.clear();
    const banner = document.getElementById('diHighlightBanner');
    if (banner) banner.classList.add('hidden');
    const inspector = document.getElementById('googleEarthInspector');
    if (inspector) inspector.classList.add('hidden');
    updateCompareCheckboxes();
  }

  function fitAllActiveHighlightedDis() {
    if (activeHighlightedDis.size === 0) return;
    const combinedBounds = L.latLngBounds([]);
    activeHighlightedDis.forEach(entry => {
      if (entry.layer.getBounds && entry.layer.getBounds().isValid()) {
        combinedBounds.extend(entry.layer.getBounds());
      }
    });
    if (combinedBounds.isValid()) {
      map.fitBounds(combinedBounds, {
        padding: [60, 60],
        maxZoom: 16,
        duration: 0.8
      });
    }
  }

  function updateMultiHighlightBanner() {
    const banner = document.getElementById('diHighlightBanner');
    const countBadge = document.getElementById('activeCompareCountBadge');
    const size = activeHighlightedDis.size;

    if (countBadge) {
      countBadge.textContent = `${size} DI Aktif`;
    }

    if (size === 0) {
      banner.classList.add('hidden');
      return;
    }

    banner.classList.remove('hidden');

    if (size === 1) {
      const first = [...activeHighlightedDis.values()][0];
      document.getElementById('bannerDiTitle').textContent = `${first.di.nama_di} (${first.di.upt})`;
      document.getElementById('bannerDiStats').textContent = `${first.counts.saluran} Saluran • ${first.counts.petak} Petak • ${first.counts.bangunan} Bangunan`;
    } else {
      const names = [...activeHighlightedDis.values()].map(e => e.di.nama_di).join(', ');
      let totSal = 0, totPet = 0, totBang = 0;
      activeHighlightedDis.forEach(e => {
        totSal += e.counts.saluran;
        totPet += e.counts.petak;
        totBang += e.counts.bangunan;
      });
      document.getElementById('bannerDiTitle').textContent = `Perbandingan ${size} DI Terdekat: ${names}`;
      document.getElementById('bannerDiStats').textContent = `Total: ${totSal} Saluran • ${totPet} Petak • ${totBang} Bangunan`;
    }
  }

  function updateCompareCheckboxes() {
    document.querySelectorAll('.compare-checkbox').forEach(cb => {
      const diId = parseInt(cb.getAttribute('data-di-id'));
      const isChecked = activeHighlightedDis.has(diId);
      cb.checked = isChecked;

      const parentItem = cb.closest('.nearest-item');
      if (parentItem) {
        if (isChecked) {
          parentItem.classList.add('active-highlight');
        } else {
          parentItem.classList.remove('active-highlight');
        }
      }
    });
  }

  // Single Highlight (Backward-compatible for Dropdown / Marker click)
  function highlightDi(diId) {
    clearAllHighlightedDis();

    // Update Quick Selector Dropdown
    const selectEl = document.getElementById('selectQuickDi');
    if (selectEl && selectEl.value !== String(diId)) {
      selectEl.value = String(diId);
    }

    loadAndAddDiHighlight(diId, 0, true, () => {
      // Auto inspect first feature
      const entry = activeHighlightedDis.get(diId);
      if (entry) {
        if (entry.firstFeature && entry.firstLayer) {
          showGoogleEarthInspector(entry.firstFeature, entry.di, entry.firstLayer);
        } else {
          const targetLayer = entry.mainLayer || entry.layer;
          if (targetLayer && targetLayer.eachLayer) {
            targetLayer.eachLayer((subLayer) => {
              if (subLayer.eachLayer) {
                subLayer.eachLayer((featLayer) => {
                  if (!window.currentGeActiveFeature && featLayer.feature) {
                    showGoogleEarthInspector(featLayer.feature, entry.di, featLayer);
                  }
                });
              } else if (!window.currentGeActiveFeature && subLayer.feature) {
                showGoogleEarthInspector(subLayer.feature, entry.di, subLayer);
              }
            });
          }
        }
      }
    });
  }

  // Export to window
  window.highlightDi = highlightDi;
  window.loadAndAddDiHighlight = loadAndAddDiHighlight;
  window.removeDiHighlight = removeDiHighlight;
  window.clearAllHighlightedDis = clearAllHighlightedDis;

  document.getElementById('btnCloseHighlight').addEventListener('click', () => {
    clearAllHighlightedDis();
    map.fitBounds(EAST_JAVA_BOUNDS, { padding: [20, 20], duration: 1.0 });
  });

  // GOOGLE EARTH INSPECTOR CONTROLS
  document.getElementById('btnCloseGeInspector').addEventListener('click', () => {
    document.getElementById('googleEarthInspector').classList.add('hidden');
    if (selectedVectorLayer && selectedVectorLayer._originalStyle && selectedVectorLayer.setStyle) {
      selectedVectorLayer.setStyle(selectedVectorLayer._originalStyle);
      selectedVectorLayer = null;
    }
  });

  const btnMinimizeGeInspector = document.getElementById('btnMinimizeGeInspector');
  if (btnMinimizeGeInspector) {
    btnMinimizeGeInspector.addEventListener('click', () => {
      const inspector = document.getElementById('googleEarthInspector');
      if (inspector) {
        inspector.classList.toggle('minimized');
        const icon = btnMinimizeGeInspector.querySelector('i');
        if (icon) {
          if (inspector.classList.contains('minimized')) {
            icon.className = 'fa-solid fa-chevron-up';
            btnMinimizeGeInspector.title = 'Perluas Panel';
          } else {
            icon.className = 'fa-solid fa-chevron-down';
            btnMinimizeGeInspector.title = 'Perkecil Panel';
          }
        }
      }
    });
  }

  document.getElementById('btnGeMenu').addEventListener('click', () => {
    showToast('Menu Objek', 'Objek tersinkronisasi dengan Database Dinas PUSDA Provinsi Jawa Timur.');
  });

  document.getElementById('btnGeEdit').addEventListener('click', () => {
    if (window.currentGeActiveFeature) {
      const f = window.currentGeActiveFeature.feature;
      const isRiver = window.currentGeActiveFeature.isRiver;
      const p = f.properties || {};
      const dataStr = isRiver
        ? `[Dinas PUSDA Jatim] Sungai: ${p.Sungai || '-'} | WS: ${p.ws_name || p.WS || '-'} | DAS: ${p.DAS || '-'} | Orde: ${p.Orde || '-'} | Panjang: ${p.Panjang_km || '-'} km | Wilayah: ${p.Kabupaten || '-'}`
        : `[Dinas PUSDA Jatim] Objek: ${p.name || p.nama || '-'} | DI: ${p.di_name || '-'} | Nomenklatur: ${p.nomenklatur || '-'} | Kode Aset: ${p.k_aset || '-'} | Luas/Panjang: ${p.area_m2 || p.panjang_m || '-'}`;
      const objName = isRiver ? (p.Sungai ? `Sungai ${p.Sungai}` : 'Sungai Jatim') : (p.name || p.nomenklatur || 'Aset');
      navigator.clipboard.writeText(dataStr).then(() => {
        showToast('Berhasil Menyalin Data', `Atribut <strong>${objName}</strong> berhasil disalin ke clipboard!`);
      }).catch(() => {
        showToast('Info Data', `Atribut: ${objName}`);
      });
    }
  });

  document.getElementById('btnGeFocus').addEventListener('click', () => {
    if (window.currentGeActiveFeature && window.currentGeActiveFeature.layer) {
      const layer = window.currentGeActiveFeature.layer;
      if (layer.getBounds && layer.getBounds().isValid()) {
        map.fitBounds(layer.getBounds(), { maxZoom: 18, duration: 0.8 });
      } else if (layer.getLatLng) {
        map.flyTo(layer.getLatLng(), 18, { duration: 0.8 });
      }
    }
  });

  // QUICK DI SELECTOR CHANGE EVENT
  const selectQuickDi = document.getElementById('selectQuickDi');
  if (selectQuickDi) {
    selectQuickDi.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (val) {
        highlightDi(val);
      }
    });
  }

  // 6. COORDINATE CONVERSION & PARSER UTILITIES
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
      if (lat >= -12 && lat <= -4 && lon >= 105 && lon <= 118) {
        return { lat, lon };
      }
      if (lon >= -12 && lon <= -4 && lat >= 105 && lat <= 118) {
        return { lat: lon, lon: lat };
      }
      return { lat, lon };
    }

    return null;
  }

  // 7. GEODESIC HAVERSINE DISTANCE (KM)
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

  // --- GEOMETRIC HELPERS (PROYEKSI SEGMEN & JARAK VEKTOR PRESISI) ---
  function projectPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { lat: x1, lon: y1 };

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { lat: x1 + t * dx, lon: y1 + t * dy };
  }

  function isPointInsidePolygon(point, polygon) {
    if (!polygon || polygon.length < 3) return false;
    const x = point[0], y = point[1]; // lon, lat
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function getMinDistanceToGeometry(targetLat, targetLon, geom) {
    if (!geom || !geom.coordinates) return { distanceKm: Infinity, closestPoint: null, isInside: false };

    let minDist = Infinity;
    let bestPoint = null;
    let isInside = false;

    function checkLineCoords(coords) {
      if (!coords || coords.length === 0) return;
      if (coords.length === 1) {
        const pLat = coords[0][1];
        const pLon = coords[0][0];
        const d = calculateDistanceKm(targetLat, targetLon, pLat, pLon);
        if (d < minDist) {
          minDist = d;
          bestPoint = { lat: pLat, lon: pLon };
        }
        return;
      }

      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const proj = projectPointToSegment(targetLat, targetLon, p1[1], p1[0], p2[1], p2[0]);
        const dist = calculateDistanceKm(targetLat, targetLon, proj.lat, proj.lon);
        if (dist < minDist) {
          minDist = dist;
          bestPoint = proj;
        }
      }
    }

    if (geom.type === 'LineString') {
      checkLineCoords(geom.coordinates);
    } else if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach(line => checkLineCoords(line));
    } else if (geom.type === 'Polygon') {
      if (geom.coordinates && geom.coordinates[0] && isPointInsidePolygon([targetLon, targetLat], geom.coordinates[0])) {
        isInside = true;
      }
      geom.coordinates.forEach(ring => checkLineCoords(ring));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => {
        if (poly && poly[0] && isPointInsidePolygon([targetLon, targetLat], poly[0])) {
          isInside = true;
        }
        poly.forEach(ring => checkLineCoords(ring));
      });
    } else if (geom.type === 'Point') {
      checkLineCoords([geom.coordinates]);
    }

    if (isInside) {
      minDist = 0.0;
    }

    return { distanceKm: minDist, closestPoint: bestPoint, isInside: isInside };
  }

  function getMinDistanceToBbox(targetLat, targetLon, bounds) {
    if (!bounds || bounds.length < 4) return Infinity;
    const [minLat, minLon, maxLat, maxLon] = bounds;
    const cLat = Math.max(minLat, Math.min(maxLat, targetLat));
    const cLon = Math.max(minLon, Math.min(maxLon, targetLon));
    return calculateDistanceKm(targetLat, targetLon, cLat, cLon);
  }

  function loadDiGeoJsonAsync(diId) {
    return new Promise((resolve) => {
      loadDiGeoJson(diId, (data) => {
        resolve(data);
      });
    });
  }

  function getDiExactVectorDistance(targetLat, targetLon, geoJsonData) {
    let minD = Infinity;
    let bestPt = null;
    let isInside = false;

    if (!geoJsonData || !geoJsonData.features) return { distanceKm: minD, closestPoint: bestPt, isInside };

    for (const feat of geoJsonData.features) {
      const res = getMinDistanceToGeometry(targetLat, targetLon, feat.geometry);
      if (res.distanceKm < minD) {
        minD = res.distanceKm;
        bestPt = res.closestPoint;
      }
      if (res.isInside) {
        isInside = true;
      }
    }

    if (isInside) {
      minD = 0.0;
    }

    return { distanceKm: minD, closestPoint: bestPt, isInside };
  }

  // 8. PINPOINT & PROXIMITY SIGNAL (RADAR CORE FEATURE)
  function clearTargetPinpoint() {
    if (activePinpointMarker) {
      map.removeLayer(activePinpointMarker);
      activePinpointMarker = null;
    }
    radarPolylines.forEach(p => map.removeLayer(p));
    radarPolylines = [];

    if (recommendedRiversGroup) {
      recommendedRiversGroup.clearLayers();
    }
    recommendedLayerEntries.clear();
    activeRecommendedRivers = [];

    currentPinpointCoord = null;
    pinpointHistory = [];
    isTargetLocked = false;

    const targetHud = document.getElementById('floatingTargetHudContainer');
    if (targetHud) {
      targetHud.classList.add('hidden');
      targetHud.style.display = 'none';
    }

    const riverBadge = document.getElementById('floatingRiverProximityBadge');
    if (riverBadge) {
      riverBadge.classList.add('hidden');
      riverBadge.style.display = 'none';
    }

    const floatingBar = document.getElementById('floatingClearSelectionBar');
    if (floatingBar) {
      floatingBar.classList.add('hidden');
      floatingBar.style.display = 'none';
    }
    const floatingCoordVal = document.getElementById('floatingCoordVal');
    if (floatingCoordVal) {
      floatingCoordVal.textContent = '-';
    }

    const btnUndo = document.getElementById('btnUndoPinpoint');
    if (btnUndo) btnUndo.classList.add('hidden');

    const btnLock = document.getElementById('btnLockTargetPin');
    if (btnLock) {
      btnLock.classList.remove('locked');
      const icon = btnLock.querySelector('i');
      const text = document.getElementById('lblLockTarget');
      if (icon) icon.className = 'fa-solid fa-lock-open';
      if (text) text.textContent = 'Kunci';
    }

    const btnClearTarget = document.getElementById('btnClearTargetPin');
    if (btnClearTarget) {
      btnClearTarget.classList.add('hidden');
      btnClearTarget.style.display = 'none';
    }

    const coordBadge = document.getElementById('pinpointCoordBadge');
    if (coordBadge) coordBadge.textContent = '-';

    const nearbyCard = document.getElementById('nearbyRiversCard');
    if (nearbyCard) nearbyCard.classList.add('hidden');

    const listContainer = document.getElementById('proximityList');
    const emptyContainer = document.getElementById('proximityEmpty');
    const controlsContainer = document.getElementById('proximityControls');

    if (listContainer) {
      listContainer.innerHTML = '';
      listContainer.classList.add('hidden');
    }
    if (controlsContainer) controlsContainer.classList.add('hidden');
    if (emptyContainer) emptyContainer.style.display = 'block';

    clearAllHighlightedDis();
    clearAsetTanahTarget();
    showToast('Pilihan Dibatalkan', 'Titik target dan analisis proksimitas telah dibersihkan.');
  }
  window.clearTargetPinpoint = clearTargetPinpoint;

  function setPinpointLocation(lat, lon, sourceLabel = 'Titik Lokasi', autoFly = true, pushToHistory = true) {
    // Catat ke riwayat undo jika pushToHistory true dan sudah ada koordinat aktif sebelumnya
    if (pushToHistory && currentPinpointCoord) {
      pinpointHistory.push({
        lat: currentPinpointCoord.lat,
        lon: currentPinpointCoord.lon,
        sourceLabel: currentPinpointCoord.sourceLabel
      });
      if (pinpointHistory.length > 10) pinpointHistory.shift();
      const btnUndo = document.getElementById('btnUndoPinpoint');
      if (btnUndo) btnUndo.classList.remove('hidden');
    }
    currentPinpointCoord = { lat, lon, sourceLabel };

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

    // GOOGLE EARTH PC PATTERN: Draggable Marker untuk fine-tuning posisi tanpa miss-click
    activePinpointMarker = L.marker([lat, lon], {
      icon: radarIcon,
      zIndexOffset: 1000,
      draggable: !isTargetLocked
    }).addTo(map);

    // Draggable precision event
    activePinpointMarker.on('dragstart', () => {
      activePinpointMarker.closePopup();
    });

    activePinpointMarker.on('dragend', (e) => {
      if (isTargetLocked) return;
      const p = e.target.getLatLng();
      // Perbarui posisi target secara gentle tanpa merusak zoom / orientasi kamera
      setPinpointLocation(p.lat, p.lng, 'Titik Digeser', false, true);
    });

    // REVISI POINT 3 & 4: POPUP MINI COMPACT, MUNCUL DI BAWAH TITIK, HANYA 1 FORMAT DESIMAL
    activePinpointMarker.bindPopup(`
      <div class="mini-target-popup-wrap">
        <div class="mini-target-popup-header">
          <span class="mini-target-badge"><i class="fa-solid fa-crosshairs"></i> ${sourceLabel}</span>
          <button onclick="window.clearTargetPinpoint()" class="mini-target-btn-close" title="Batalkan Pilihan"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="mini-target-coord-val">${lat.toFixed(6)}°, ${lon.toFixed(6)}°</div>
      </div>
    `, {
      offset: [0, 74],
      className: 'compact-target-popup',
      closeButton: false,
      autoPan: false
    }).openPopup();

    // Update Coordinate Badge & Reveal Clear Button in Sidebar
    const coordBadge = document.getElementById('pinpointCoordBadge');
    if (coordBadge) coordBadge.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
    const btnClearTarget = document.getElementById('btnClearTargetPin');
    if (btnClearTarget) {
      btnClearTarget.classList.remove('hidden');
      btnClearTarget.style.display = 'inline-flex';
    }

    // Reveal Floating Target HUD Bar on Map (Posisinya di bawah agar tidak menutupi banner DI)
    const targetHud = document.getElementById('floatingTargetHudContainer');
    const floatingBar = document.getElementById('floatingClearSelectionBar');
    const floatingCoordVal = document.getElementById('floatingCoordVal');
    if (targetHud) {
      targetHud.classList.remove('hidden');
      targetHud.style.display = 'flex';
    }
    if (floatingBar) {
      floatingBar.classList.remove('hidden');
      floatingBar.style.display = 'flex';
      if (floatingCoordVal) {
        floatingCoordVal.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
      }
    }

    const riverBadge = document.getElementById('floatingRiverProximityBadge');
    const riverText = document.getElementById('floatingRiverProximityText');
    if (riverBadge && riverText) {
      riverBadge.classList.remove('hidden');
      riverBadge.style.display = 'inline-flex';
      riverText.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-right: 5px; color: #38bdf8;"></i> Menganalisis sungai terdekat...`;
    }

    // REVISI POINT 1: HITUNG JARAK VEKTOR TERDEKAT (TEPI LINE / POLIGON) UNTUK DI
    // Tahap 1: Fast Bounding-Box filtering pada 181 DI sebagai lower bound
    const candidateDis = allDiData.map(di => {
      const bDist = getMinDistanceToBbox(lat, lon, di.bounds);
      const cDist = calculateDistanceKm(lat, lon, di.lat, di.lon);
      return {
        ...di,
        bboxDist: bDist,
        centroidDist: cDist,
        sortScore: Math.min(bDist, cDist)
      };
    }).sort((a, b) => a.sortScore - b.sortScore);

    // Tampilkan preview awal seketika agar UI responsif
    const initialNearest = candidateDis.slice(0, 5).map(c => ({
      ...c,
      distance: c.bboxDist > 0 ? c.bboxDist : c.centroidDist,
      closestPoint: { lat: c.lat, lon: c.lon },
      isInside: false
    }));
    renderNearestList(initialNearest);

    // Tahap 2: Evaluasi Vektor Presisi pada Top 8 Candidate
    const topCandidates = candidateDis.slice(0, 8);
    Promise.all(topCandidates.map(c => loadDiGeoJsonAsync(c.id).then(geoJsonData => {
      const vRes = getDiExactVectorDistance(lat, lon, geoJsonData);
      return {
        ...c,
        distance: vRes.distanceKm,
        closestPoint: vRes.closestPoint || { lat: c.lat, lon: c.lon },
        isInside: vRes.isInside
      };
    }))).then(evaluatedDIs => {
      // Urutkan naik berdasarkan jarak vektor terdekat yang nyata
      evaluatedDIs.sort((a, b) => a.distance - b.distance);
      const nearest5 = evaluatedDIs.slice(0, 5);

      // Gambar garis radar langsung ke titik vektor terdekat (bukan centroid jauh)
      radarPolylines.forEach(p => map.removeLayer(p));
      radarPolylines = [];
      nearest5.forEach((di, index) => {
        const isNearest = index === 0;
        const rankColor = NEAREST_RANK_COLORS[index % NEAREST_RANK_COLORS.length].color;
        const targetCoord = di.closestPoint ? [di.closestPoint.lat, di.closestPoint.lon] : [di.lat, di.lon];
        const polyline = L.polyline([[lat, lon], targetCoord], {
          color: rankColor,
          weight: isNearest ? 3.5 : 2.0,
          opacity: isNearest ? 0.95 : 0.75,
          dashArray: '6, 8',
          lineCap: 'round'
        }).addTo(map);

        radarPolylines.push(polyline);
      });

      // Render daftar ranking dengan jarak vektor presisi
      renderNearestList(nearest5);

      // Auto-highlight DI #1 terdekat
      clearAllHighlightedDis();
      loadAndAddDiHighlight(nearest5[0].id, 0, false);

      // Notifikasi Toast dengan informasi jarak vektor terdekat
      if (nearest5.length > 0) {
        const top1 = nearest5[0];
        const distStr = top1.isInside ? 'berada di dalam kawasan DI (0.00 km)' : `berjarak <strong>${top1.distance.toFixed(2)} km</strong> (tepi vektor terdekat)`;
        showToast(
          'Sinyal Proksimitas Terdeteksi!',
          `Titik ini terdekat dengan <strong>${top1.nama_di}</strong> (${top1.upt}) - ${distStr}.`
        );
      }

      // =========================================================================
      // NON-DESTRUCTIVE GENTLE CAMERA (OPTIMASI PENGAMATAN SPASIAL TANPA DISORIENTASI)
      // =========================================================================
      if (autoFly) {
        const currentBounds = map.getBounds();
        const isTargetInView = currentBounds.contains([lat, lon]);
        const fitTarget = nearest5[0].closestPoint 
          ? [nearest5[0].closestPoint.lat, nearest5[0].closestPoint.lon] 
          : [nearest5[0].lat, nearest5[0].lon];
        const isNearestInView = currentBounds.contains(fitTarget);

        if (isTargetInView && isNearestInView) {
          // Kasus 1: Kedua titik (target & DI terdekat) sudah ada di layar pengguna
          // JANGAN ubah zoom! Cukup geser halus (gentle pan) agar user tidak kehilangan konteks
          map.panTo([lat, lon], {
            animate: true,
            duration: 0.6,
            easeLinearity: 0.25
          });
        } else if (isTargetInView && map.getZoom() >= 13) {
          // Kasus 2: Pengguna sedang zoom dekat memeriksa alur saluran / petak sawah / aset tanah
          // Pertahankan zoom pengguna, lakukan gentle pan ke titik target
          map.panTo([lat, lon], {
            animate: true,
            duration: 0.5
          });
        } else {
          // Kasus 3: Target baru atau berada di luar viewport layar
          const fitBounds = L.latLngBounds([[lat, lon], fitTarget]);
          map.flyToBounds(fitBounds, {
            padding: isTouchDevice ? [40, 40] : [70, 70],
            maxZoom: 14,
            duration: 0.9
          });
        }
      } else {
        // Jika autoFly false (misal dari dragend marker), jangan ubah zoom sama sekali
        const currentBounds = map.getBounds();
        if (!currentBounds.contains([lat, lon])) {
          map.panTo([lat, lon], { animate: true, duration: 0.4 });
        }
      }
    });

    // Hitung & Rekomendasikan Sungai Terdekat (Orde 1-8) On-Demand
    findNearbyRiversAndRecommend(lat, lon);

    // Tampilkan Poligon Aset Tanah Terdekat On-Demand (Bebas Lag)
    updateAsetTanahForTarget(lat, lon);
  }

  function renderNearestList(nearestItems) {
    currentNearest5List = nearestItems;
    const listContainer = document.getElementById('proximityList');
    const emptyContainer = document.getElementById('proximityEmpty');
    const controlsContainer = document.getElementById('proximityControls');

    emptyContainer.style.display = 'none';
    if (controlsContainer) controlsContainer.classList.remove('hidden');
    listContainer.classList.remove('hidden');
    listContainer.innerHTML = '';

    nearestItems.forEach((item, idx) => {
      const rank = idx + 1;
      const colorCfg = NEAREST_RANK_COLORS[idx % NEAREST_RANK_COLORS.length];
      const isChecked = activeHighlightedDis.has(item.id);
      const distLabel = item.isInside ? '0.00 km (Di Dalam)' : `${item.distance.toFixed(2)} km`;

      const itemEl = document.createElement('div');
      itemEl.className = `nearest-item rank-${rank} ${isChecked ? 'active-highlight' : ''}`;
      itemEl.setAttribute('data-di-id', item.id);

      itemEl.innerHTML = `
        <div class="item-left">
          <label class="compare-toggle-wrap" title="Centang untuk menampilkan & membandingkan DI ini di peta">
            <input type="checkbox" class="compare-checkbox" data-di-id="${item.id}" data-rank-idx="${idx}" ${isChecked ? 'checked' : ''}>
          </label>
          <div class="rank-badge" style="background: ${colorCfg.badgeBg}; color: ${colorCfg.badgeText};">#${rank}</div>
          <div class="di-details">
            <h4>${item.nama_di}</h4>
            <span><i class="fa-solid fa-building-flag"></i> ${item.upt}</span>
          </div>
        </div>
        <div class="item-right">
          <div class="dist-badge" style="border: 1px solid ${colorCfg.color}; color: ${colorCfg.color};">${distLabel}</div>
          <button class="btn-focus-di" title="Pusatkan kamera ke DI ini"><i class="fa-solid fa-crosshairs"></i></button>
        </div>
      `;

      // Checkbox event
      const checkbox = itemEl.querySelector('.compare-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          loadAndAddDiHighlight(item.id, idx, true);
        } else {
          removeDiHighlight(item.id, true);
        }
      });

      // Focus button event
      const btnFocus = itemEl.querySelector('.btn-focus-di');
      btnFocus.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!activeHighlightedDis.has(item.id)) {
          checkbox.checked = true;
          loadAndAddDiHighlight(item.id, idx, false, () => {
            const entry = activeHighlightedDis.get(item.id);
            if (entry && entry.layer.getBounds && entry.layer.getBounds().isValid()) {
              map.fitBounds(entry.layer.getBounds(), { padding: [50, 50], maxZoom: 16, duration: 0.8 });
            }
          });
        } else {
          const entry = activeHighlightedDis.get(item.id);
          if (entry && entry.layer.getBounds && entry.layer.getBounds().isValid()) {
            map.fitBounds(entry.layer.getBounds(), { padding: [50, 50], maxZoom: 16, duration: 0.8 });
          }
        }
      });

      // Clicking row body toggles checkbox
      itemEl.addEventListener('click', (e) => {
        if (e.target.tagName.toLowerCase() === 'input' || e.target.closest('.btn-focus-di') || e.target.closest('.compare-toggle-wrap')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });

      listContainer.appendChild(itemEl);
    });
  }

  // BUTTON LISTENERS: COMPARE ALL & CLEAR
  const btnHighlightAll5 = document.getElementById('btnHighlightAll5');
  if (btnHighlightAll5) {
    btnHighlightAll5.addEventListener('click', () => {
      if (!currentNearest5List || currentNearest5List.length === 0) return;

      let loadedCount = 0;
      currentNearest5List.forEach((item, idx) => {
        loadAndAddDiHighlight(item.id, idx, false, () => {
          loadedCount++;
          if (loadedCount >= currentNearest5List.length) {
            fitAllActiveHighlightedDis();
            showToast(
              'Mode Perbandingan Aktif',
              `Seluruh <strong>${currentNearest5List.length} DI terdekat</strong> berhasil ditampilkan bersamaan di peta untuk perbandingan visual.`
            );
          }
        });
      });
    });
  }

  const btnClearCompareDis = document.getElementById('btnClearCompareDis');
  if (btnClearCompareDis) {
    btnClearCompareDis.addEventListener('click', () => {
      clearAllHighlightedDis();
      showToast('Highlight Dibersihkan', 'Semua lapisan vektor perbandingan telah disembunyikan.');
    });
  }

  // 9. TOAST NOTIFICATION UTILITY
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

  // 10. EVENT LISTENERS: SEARCH COORDINATES
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

  // 11. FILTER & LIVE SEARCH
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

  // 12. BASEMAP SWITCHER
  const btnToggleBasemap = document.getElementById('btnToggleBasemap');
  const basemapDropdown = document.getElementById('basemapDropdown');

  btnToggleBasemap.addEventListener('click', (e) => {
    e.stopPropagation();
    const lfd = document.getElementById('layerFilterDropdown');
    if (lfd) lfd.classList.add('hidden');
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

  // 13. SIDEBAR TOGGLE, RETICLE FAB, LOCK & RESET VIEW
  const sidebar = document.getElementById('sidebar');
  const btnFloatingSidebarToggle = document.getElementById('btnFloatingSidebarToggle');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnCloseSidebar = document.getElementById('btnCloseSidebar');
  const btnOpenSidebarFromBar = document.getElementById('btnOpenSidebarFromBar');

  function syncSidebarVisibility(shouldOpen) {
    if (shouldOpen) {
      sidebar.classList.remove('hidden');
      if (btnFloatingSidebarToggle) btnFloatingSidebarToggle.classList.add('hidden');
    } else {
      sidebar.classList.add('hidden');
      if (btnFloatingSidebarToggle) btnFloatingSidebarToggle.classList.remove('hidden');
    }
  }

  if (btnFloatingSidebarToggle) {
    btnFloatingSidebarToggle.addEventListener('click', () => {
      syncSidebarVisibility(true);
    });
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      const isCurrentlyHidden = sidebar.classList.contains('hidden');
      syncSidebarVisibility(isCurrentlyHidden);
    });
  }

  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => {
      syncSidebarVisibility(false);
    });
  }

  if (btnOpenSidebarFromBar) {
    btnOpenSidebarFromBar.addEventListener('click', (e) => {
      e.stopPropagation();
      syncSidebarVisibility(true);
    });
  }

  // GOOGLE EARTH RETICLE MODE: FAB "BIDIK PUSAT PETA"
  const btnCenterReticle = document.getElementById('btnCenterReticle');
  if (btnCenterReticle) {
    btnCenterReticle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isTargetLocked) {
        showToast('Target Terkunci', 'Buka kunci target di bilah bawah untuk memindahkan titik.');
        return;
      }
      const center = map.getCenter();
      setPinpointLocation(center.lat, center.lng, 'Pusat Layar (Bidik Presisi)', true, true);
      if (navigator.vibrate) {
        try { navigator.vibrate(35); } catch (_) {}
      }
      showToast('Pusat Peta Dibidik', 'Titik target presisi ditempatkan pada pusat viewport peta.');
    });
  }

  // TARGET LOCK TOGGLE (Mencegah Klik Tak Sengaja)
  const btnLockTargetPin = document.getElementById('btnLockTargetPin');
  if (btnLockTargetPin) {
    btnLockTargetPin.addEventListener('click', (e) => {
      e.stopPropagation();
      isTargetLocked = !isTargetLocked;
      if (activePinpointMarker && activePinpointMarker.dragging) {
        if (isTargetLocked) {
          activePinpointMarker.dragging.disable();
        } else {
          activePinpointMarker.dragging.enable();
        }
      }
      btnLockTargetPin.classList.toggle('locked', isTargetLocked);
      const icon = document.getElementById('iconLockTarget') || btnLockTargetPin.querySelector('i');
      const text = document.getElementById('lblLockTarget') || btnLockTargetPin.querySelector('.btn-text');
      if (isTargetLocked) {
        if (icon) icon.className = 'fa-solid fa-lock';
        if (text) text.textContent = 'Terkunci';
        showToast('Target Dikunci', 'Titik target diproteksi dari klik atau sentuhan tak sengaja.');
      } else {
        if (icon) icon.className = 'fa-solid fa-lock-open';
        if (text) text.textContent = 'Kunci';
        showToast('Kunci Dibuka', 'Titik target dapat dipindahkan atau digeser kembali.');
      }
    });
  }

  // UNDO PINPOINT FUNCTION (Ctrl+Z & Button)
  function undoPinpoint() {
    if (isTargetLocked) {
      showToast('Target Terkunci', 'Buka kunci target terlebih dahulu untuk mengurungkan titik.');
      return;
    }
    if (pinpointHistory.length === 0) {
      showToast('Tidak Ada Riwayat', 'Tidak ada titik koordinat sebelumnya untuk diurungkan.');
      return;
    }
    const prev = pinpointHistory.pop();
    if (pinpointHistory.length === 0) {
      const btnUndo = document.getElementById('btnUndoPinpoint');
      if (btnUndo) btnUndo.classList.add('hidden');
    }
    setPinpointLocation(prev.lat, prev.lon, prev.sourceLabel || 'Riwayat Sebelumnya', true, false);
    showToast('Undo Berhasil', `Target dikembalikan ke (${prev.lat.toFixed(4)}°, ${prev.lon.toFixed(4)}°).`);
  }
  window.undoPinpoint = undoPinpoint;

  const btnUndoPinpoint = document.getElementById('btnUndoPinpoint');
  if (btnUndoPinpoint) {
    btnUndoPinpoint.addEventListener('click', (e) => {
      e.stopPropagation();
      undoPinpoint();
    });
  }

  // Keyboard shortcut Ctrl+Z untuk Undo
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (pinpointHistory.length > 0) {
        e.preventDefault();
        undoPinpoint();
      }
    }
  });

  document.getElementById('btnResetView').addEventListener('click', () => {
    clearAllHighlightedDis();
    clearTargetPinpoint();
    if (typeof window.deselectWs === 'function') window.deselectWs();
    map.fitBounds(EAST_JAVA_BOUNDS, { padding: [20, 20], duration: 1.0 });
  });

  // CLEAR SELECTION LISTENERS (UI / UX KEMUDAHAN MEMBATALKAN TITIK TARGET)
  const btnFloatingClear = document.getElementById('btnFloatingClearSelection');
  if (btnFloatingClear) {
    btnFloatingClear.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTargetPinpoint();
    });
  }

  const btnClearTargetPin = document.getElementById('btnClearTargetPin');
  if (btnClearTargetPin) {
    btnClearTargetPin.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTargetPinpoint();
    });
  }

  // Keyboard Shortcut: ESC untuk membatalkan pilihan secara instan
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (activePinpointMarker) {
        clearTargetPinpoint();
      } else if (typeof window.deselectWs === 'function') {
        window.deselectWs();
      }
    }
  });

  // 14. WILAYAH SUNGAI (WS) & JARINGAN SUNGAI (ORDE 1-8) ENGINE
  const RIVERS_CONFIG = {
    'brantas': {
      name: 'WS Brantas',
      slug: 'brantas',
      casing: '#f59e0b',       // Amber Gold
      core: '#1e40af',         // Deep River Blue
      badgeBg: '#f59e0b',
      badgeText: '#451a03',
      desc: 'Malang, Blitar, Tulungagung, Kediri, Jombang, Mojokerto, Surabaya, Sidoarjo'
    },
    'bengawan_solo': {
      name: 'WS Bengawan Solo',
      slug: 'bengawan_solo',
      casing: '#10b981',       // Emerald Green
      core: '#1e40af',
      badgeBg: '#10b981',
      badgeText: '#022c22',
      desc: 'Ngawi, Madiun, Magetan, Ponorogo, Bojonegoro, Tuban, Lamongan, Gresik'
    },
    'bondoyudo_baru': {
      name: 'WS Bondoyudo Baru',
      slug: 'bondoyudo_baru',
      casing: '#ec4899',       // Vivid Rose / Magenta
      core: '#1e40af',
      badgeBg: '#ec4899',
      badgeText: '#500724',
      desc: 'Lumajang, Jember'
    },
    'welang_pekalen': {
      name: 'WS Welang Pekalen',
      slug: 'welang_pekalen',
      casing: '#8b5cf6',       // Electric Violet
      core: '#1e40af',
      badgeBg: '#8b5cf6',
      badgeText: '#2e1065',
      desc: 'Pasuruan, Probolinggo'
    },
    'sampean_setail': {
      name: 'WS Sampean Setail',
      slug: 'sampean_setail',
      casing: '#f97316',       // Sunset Orange
      core: '#1e40af',
      badgeBg: '#f97316',
      badgeText: '#431407',
      desc: 'Bondowoso, Situbondo, Banyuwangi'
    },
    'madura': {
      name: 'WS Kepulauan Madura',
      slug: 'madura',
      casing: '#00e5ff',       // Aqua Cyan
      core: '#1e40af',
      badgeBg: '#00e5ff',
      badgeText: '#082f49',
      desc: 'Bangkalan, Sampang, Pamekasan, Sumenep dan Kepulauan'
    }
  };

  let wsBoundariesGroup;
  let wsLabelsGroup;
  let orde1RiversGroup;
  let recommendedRiversGroup;
  let onDemandFullBasinGroup;

  let isDiVisible = true;
  let isWsVisible = true;
  let isRiversVisible = true;
  let activeRecommendedRivers = [];
  let recommendedLayerEntries = new Map();
  let isAllOrdeVisibleInActiveWs = false;

  function initRiverPanes() {
    if (!map.getPane('wsBoundsPane')) {
      const wsPane = map.createPane('wsBoundsPane');
      wsPane.style.zIndex = 405; // Di bawah sungai dan DI, di atas basemap
      wsPane.style.pointerEvents = 'none';
    }
    if (!map.getPane('riversCasingPane')) {
      const casingPane = map.createPane('riversCasingPane');
      casingPane.style.zIndex = 410;
    }
    if (!map.getPane('riversCorePane')) {
      const corePane = map.createPane('riversCorePane');
      corePane.style.zIndex = 412;
    }
    if (!map.getPane('recommendedRiversPane')) {
      const recPane = map.createPane('recommendedRiversPane');
      recPane.style.zIndex = 420;
    }
    if (!map.getPane('diCanalsCasingPane')) {
      const p = map.createPane('diCanalsCasingPane');
      p.style.zIndex = 438;
    }
    if (!map.getPane('diPetakPane')) {
      const petakPane = map.createPane('diPetakPane');
      petakPane.style.zIndex = 445; // LAYER KE-8: PETAK SAWAH (Di bawah aset tanah)
    }
    if (!map.getPane('diCanalsPane')) {
      const canalsPane = map.createPane('diCanalsPane');
      canalsPane.style.zIndex = 450;
    }
    if (!map.getPane('asetTanahPane')) {
      const asetPane = map.createPane('asetTanahPane');
      asetPane.style.zIndex = 460; // LAYER ASET TANAH BERADA DI ATAS PETAK SAWAH!
    }
    if (!map.getPane('diBangunanPane')) {
      const bgnPane = map.createPane('diBangunanPane');
      bgnPane.style.zIndex = 520; // TITIK PIN & BANGUNAN AIR DIGESER KE ATAS ASET TANAH!
    }
    if (!map.getPane('diHighlightPane')) {
      const diPane = map.createPane('diHighlightPane');
      diPane.style.zIndex = 450;
    }
  }

  function initWsAndRivers() {
    initRiverPanes();

    wsBoundariesGroup = L.featureGroup().addTo(map);
    wsLabelsGroup = L.featureGroup().addTo(map);
    orde1RiversGroup = L.featureGroup().addTo(map);
    recommendedRiversGroup = L.featureGroup().addTo(map);
    onDemandFullBasinGroup = L.featureGroup().addTo(map);

    // 1. Render Batas 6 Wilayah Sungai (Label nama HANYA muncul saat poligon WS diseleksi)
    renderWsBoundaries();

    // 2. Render Jaringan Sungai Ringan Awal (HANYA Sungai Utama Orde 1)
    renderOrde1Rivers();
  }

  // --- FEATURE: ASET TANAH & SEMPADAN (STRESS TEST 1.800 POLIGON 18 KATEGORI - ON DEMAND BEBAS LAG) ---
  let asetTanahLayer = null;
  let isAsetTanahVisible = false; // AWALNYA NONAKTIF AGAR TIDAK MEMBUAT LAG
  let activeAsetTanahCategory = 'ALL';
  let asetTanahDataCache = null;
  let currentTargetCoord = null;
  let currentNearbyAsetCount = 0;

  function getAsetFeatureCenter(f) {
    if (f._center) return f._center;
    const coords = f.geometry && f.geometry.coordinates && f.geometry.coordinates[0];
    if (!coords || coords.length === 0) return { lat: 0, lon: 0 };
    let sumLat = 0, sumLon = 0;
    for (let i = 0; i < coords.length; i++) {
      sumLon += coords[i][0];
      sumLat += coords[i][1];
    }
    f._center = { lat: sumLat / coords.length, lon: sumLon / coords.length };
    return f._center;
  }

  function renderAsetTanahFeatures(fc, shouldAddToMap = true) {
    if (!fc || !fc.features) return;

    if (asetTanahLayer) {
      map.removeLayer(asetTanahLayer);
      asetTanahLayer = null;
    }

    // High performance Leaflet Canvas renderer for stress testing
    const asetCanvasRenderer = L.canvas({
      pane: 'asetTanahPane',
      padding: 0.25,
      tolerance: 6
    });

    asetTanahLayer = L.geoJSON(fc, {
      pane: 'asetTanahPane',
      renderer: asetCanvasRenderer,
      filter: function(feat) {
        if (activeAsetTanahCategory === 'ALL') return true;
        const p = feat.properties || {};
        return p.kategori === activeAsetTanahCategory;
      },
      style: function(feat) {
        const p = feat.properties || {};
        return {
          fillColor: p.fillColor || '#f97316',
          fillOpacity: p.is_bekas ? 0.35 : 0.50,
          color: p.color || '#ea580c',
          weight: p.is_bekas ? 1.8 : 2.4,
          dashArray: p.dashArray || null,
          lineCap: 'round',
          lineJoin: 'round'
        };
      },
      onEachFeature: function(feat, layer) {
        const p = feat.properties || {};
        const title = p.nama_aset || 'Aset Tanah Sempadan';
        const badgeColor = p.fillColor || '#f97316';

        if (layer.options) {
          layer._originalStyle = {
            fillColor: p.fillColor || '#f97316',
            fillOpacity: p.is_bekas ? 0.35 : 0.50,
            color: p.color || '#ea580c',
            weight: p.is_bekas ? 1.8 : 2.4,
            dashArray: p.dashArray || null
          };
        }

        layer.bindTooltip(`
          <div style="font-family: Inter, sans-serif; min-width: 140px;">
            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: ${badgeColor};"></span>
              <strong style="color: ${badgeColor}; font-size: 0.7rem; text-transform: uppercase;">${p.kategori}</strong>
            </div>
            <div style="font-size: 0.82rem; font-weight: 700; color: #f8fafc; line-height: 1.2; margin-bottom: 3px;">${title}</div>
            <div style="font-size: 0.72rem; color: #94a3b8; display: flex; gap: 8px;">
              <span>Luas: <b style="color: #38bdf8;">${p.luas_ha || (p.luas_m2 ? p.luas_m2 + ' m²' : '-')}</b></span>
              <span>•</span>
              <span>${p.kabupaten || p.upt || ''}</span>
            </div>
          </div>
        `, { sticky: true, className: 'ge-map-tooltip' });

        layer.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          showGoogleEarthInspector(feat, null, layer);
        });

        // Hover effect
        layer.on('mouseover', function() {
          if (layer.setStyle && layer !== selectedVectorLayer) {
            layer.setStyle({
              weight: 3.5,
              color: '#ffffff',
              fillOpacity: 0.75
            });
          }
        });

        layer.on('mouseout', function() {
          if (layer.setStyle && layer !== selectedVectorLayer) {
            layer.setStyle(layer._originalStyle || {
              fillColor: p.fillColor || '#f97316',
              fillOpacity: p.is_bekas ? 0.35 : 0.50,
              color: p.color || '#ea580c',
              weight: p.is_bekas ? 1.8 : 2.4,
              dashArray: p.dashArray || null
            });
          }
        });
      }
    });

    if (shouldAddToMap && isAsetTanahVisible) {
      asetTanahLayer.addTo(map);
    }
  }

  function initAsetTanah() {
    initRiverPanes();

    // Cache data latar belakang saja, TIDAK MEMUNCULKAN 1.800 POLIGON DI AWAL (AGAR BEBAS LAG)
    if (window.ASET_TANAH_DATA && window.ASET_TANAH_DATA.features) {
      asetTanahDataCache = window.ASET_TANAH_DATA;
    } else {
      fetch('data/aset_tanah.json')
        .then(res => res.json())
        .then(data => {
          window.ASET_TANAH_DATA = data;
          asetTanahDataCache = data;
        })
        .catch(err => console.warn('Gagal memuat data aset tanah:', err));
    }

    // Pastikan status awal tombol & toggle di UI dalam keadaan Standby
    isAsetTanahVisible = false;
    const btnToggleAsetTanah = document.getElementById('btnToggleAsetTanah');
    const badgeAsetTanahNav = document.getElementById('badgeAsetTanahNav');
    const chkLayerAsetTanah = document.getElementById('chkLayerAsetTanah');
    const filterRowAsetTanah = document.getElementById('filterRowAsetTanah');
    if (btnToggleAsetTanah) btnToggleAsetTanah.classList.remove('active');
    if (badgeAsetTanahNav) badgeAsetTanahNav.textContent = 'Standby';
    if (chkLayerAsetTanah) chkLayerAsetTanah.checked = false;
    if (filterRowAsetTanah) filterRowAsetTanah.classList.remove('active');
    updateLayerCounter();
  }

  // TAMPILKAN POLIGON ASET TANAH TERDEKAT SAAT TITIK KOORDINAT DIPILIH
  function updateAsetTanahForTarget(targetLat, targetLon) {
    currentTargetCoord = { lat: targetLat, lon: targetLon };

    const data = asetTanahDataCache || window.ASET_TANAH_DATA;
    if (!data || !data.features || data.features.length === 0) return;

    // Hitung jarak ke setiap poligon dari titik koordinat terpilih
    const evaluated = data.features.map(f => {
      const center = getAsetFeatureCenter(f);
      const distKm = calculateDistanceKm(targetLat, targetLon, center.lat, center.lon);
      return { feature: f, distKm };
    });

    // Urutkan jarak naik
    evaluated.sort((a, b) => a.distKm - b.distKm);

    // Filter kategori jika sedang dipilih
    let filtered = evaluated;
    if (activeAsetTanahCategory !== 'ALL') {
      filtered = evaluated.filter(item => {
        const p = item.feature.properties || {};
        return p.kategori === activeAsetTanahCategory;
      });
    }

    // Ambil subset sekitar titik: radius 25 km, atau top 30 terdekat (maks 40)
    let selected = filtered.filter(item => item.distKm <= 25.0);
    if (selected.length < 15) {
      selected = filtered.slice(0, 25);
    } else if (selected.length > 40) {
      selected = selected.slice(0, 40);
    }

    currentNearbyAsetCount = selected.length;
    isAsetTanahVisible = true;

    const subsetFc = {
      type: "FeatureCollection",
      features: selected.map(s => s.feature)
    };

    renderAsetTanahFeatures(subsetFc, true);

    const btnToggleAsetTanah = document.getElementById('btnToggleAsetTanah');
    const badgeAsetTanahNav = document.getElementById('badgeAsetTanahNav');
    const chkLayerAsetTanah = document.getElementById('chkLayerAsetTanah');
    const filterRowAsetTanah = document.getElementById('filterRowAsetTanah');

    if (btnToggleAsetTanah) btnToggleAsetTanah.classList.add('active');
    if (badgeAsetTanahNav) badgeAsetTanahNav.textContent = `${currentNearbyAsetCount}`;
    if (chkLayerAsetTanah) chkLayerAsetTanah.checked = true;
    if (filterRowAsetTanah) filterRowAsetTanah.classList.add('active');

    updateLayerCounter();
  }

  // BERSIHKAN ASET TANAH SAAT PILIHAN KOORDINAT DIBATALKAN
  function clearAsetTanahTarget() {
    currentTargetCoord = null;
    currentNearbyAsetCount = 0;
    isAsetTanahVisible = false;

    if (asetTanahLayer) {
      map.removeLayer(asetTanahLayer);
      asetTanahLayer = null;
    }

    const btnToggleAsetTanah = document.getElementById('btnToggleAsetTanah');
    const badgeAsetTanahNav = document.getElementById('badgeAsetTanahNav');
    const chkLayerAsetTanah = document.getElementById('chkLayerAsetTanah');
    const filterRowAsetTanah = document.getElementById('filterRowAsetTanah');

    if (btnToggleAsetTanah) btnToggleAsetTanah.classList.remove('active');
    if (badgeAsetTanahNav) badgeAsetTanahNav.textContent = 'Standby';
    if (chkLayerAsetTanah) chkLayerAsetTanah.checked = false;
    if (filterRowAsetTanah) filterRowAsetTanah.classList.remove('active');

    updateLayerCounter();
  }

  function setAsetTanahCategoryFilter(cat) {
    activeAsetTanahCategory = cat;
    if (currentTargetCoord) {
      updateAsetTanahForTarget(currentTargetCoord.lat, currentTargetCoord.lon);
      showToast(
        'Filter Kategori Aset',
        `Menampilkan poligon kategori <strong>${cat === 'ALL' ? 'Semua Kategori' : cat}</strong> di sekitar koordinat.`
      );
    } else {
      showToast(
        'Kategori Aset Terpilih',
        `Kategori <strong>${cat === 'ALL' ? 'Semua Kategori' : cat}</strong> aktif saat titik koordinat dipilih di peta.`
      );
    }
  }

  function setAsetTanahVisibility(visible) {
    if (!currentTargetCoord && visible) {
      showToast(
        'Pilih Koordinat Terlebih Dahulu',
        'Klik lokasi di peta atau gunakan GPS untuk memunculkan poligon aset tanah di area tersebut tanpa membuat lag.'
      );
      const chkLayerAsetTanah = document.getElementById('chkLayerAsetTanah');
      if (chkLayerAsetTanah) chkLayerAsetTanah.checked = false;
      return;
    }

    isAsetTanahVisible = visible;
    if (asetTanahLayer) {
      if (isAsetTanahVisible) {
        if (!map.hasLayer(asetTanahLayer)) map.addLayer(asetTanahLayer);
      } else {
        if (map.hasLayer(asetTanahLayer)) map.removeLayer(asetTanahLayer);
      }
    }
    const btnToggleAsetTanah = document.getElementById('btnToggleAsetTanah');
    const chkLayerAsetTanah = document.getElementById('chkLayerAsetTanah');
    const filterRowAsetTanah = document.getElementById('filterRowAsetTanah');
    if (btnToggleAsetTanah) btnToggleAsetTanah.classList.toggle('active', isAsetTanahVisible);
    if (chkLayerAsetTanah) chkLayerAsetTanah.checked = isAsetTanahVisible;
    if (filterRowAsetTanah) filterRowAsetTanah.classList.toggle('active', isAsetTanahVisible);
    updateLayerCounter();
    showToast(
      isAsetTanahVisible ? 'Layer Aset Tanah Aktif' : 'Layer Aset Tanah Disembunyikan',
      isAsetTanahVisible ? `Menampilkan ${currentNearbyAsetCount} poligon aset tanah sempadan di sekitar titik terpilih.` : 'Poligon aset tanah disembunyikan.'
    );
  }

  // --- FEATURE 1: BATAS WILAYAH SUNGAI (WS) NON-BLOCKING VISUAL LAYER ---
  function renderWsBoundaries() {
    function drawWsFeatures(fc) {
      if (!fc || !fc.features) return;
      wsBoundariesGroup.clearLayers();
      wsLabelsGroup.clearLayers();

      const wsLayer = L.geoJSON(fc, {
        pane: 'wsBoundsPane',
        interactive: false, // Tidak memblokir klik di darat, klik langsung memetakan titik target di peta!
        className: 'ws-boundary-path',
        style: function(feat) {
          const p = feat.properties || {};
          return {
            color: '#0f172a',
            weight: 2.2,
            dashArray: '6, 6',     // Garis batas administrasi/WS elegan, tidak memblokir visual jalan dan sungai
            opacity: 0.85,
            fillColor: p.casing || '#3b82f6',
            fillOpacity: 0.12,     // Tint warna semi-transparan agar citra satelit tetap terbaca
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
            className: 'ws-boundary-path'
          };
        }
      });

      wsBoundariesGroup.addLayer(wsLayer);
    }

    if (window.BATAS_WS_DATA && window.BATAS_WS_DATA.features) {
      drawWsFeatures(window.BATAS_WS_DATA);
    } else {
      fetch('data/sungai/batas_ws.json')
        .then(res => res.json())
        .then(data => {
          window.BATAS_WS_DATA = data;
          drawWsFeatures(data);
        })
        .catch(err => console.warn('Gagal memuat batas WS:', err));
    }
  }

  // --- FEATURE 2: SUNGAI UTAMA (ORDE 1 SAJA) PADA AWAL HALAMAN ---
  function renderOrde1Rivers() {
    function drawOrde1(fc) {
      if (!fc || !fc.features) return;
      orde1RiversGroup.clearLayers();

      // 1. Casing Layer (Dual-Stroke)
      const casingLayer = L.geoJSON(fc, {
        pane: 'riversCasingPane',
        style: function(feat) {
          const p = feat.properties || {};
          return {
            color: p.casing_color || '#38bdf8',
            weight: 4.2,
            opacity: 0.92,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
          };
        }
      });
      orde1RiversGroup.addLayer(casingLayer);

      // 2. Core Layer (Deep River Blue)
      const coreLayer = L.geoJSON(fc, {
        pane: 'riversCorePane',
        style: function(feat) {
          const p = feat.properties || {};
          return {
            color: p.core_color || '#1e40af',
            weight: 2.2,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
          };
        },
        onEachFeature: function(feat, layer) {
          setupRiverFeatureInteractions(feat, layer);
        }
      });
      orde1RiversGroup.addLayer(coreLayer);
    }

    if (window.RIVER_ORDE1_DATA && window.RIVER_ORDE1_DATA.features) {
      drawOrde1(window.RIVER_ORDE1_DATA);
    } else {
      fetch('data/sungai/sungai_orde1.json')
        .then(res => res.json())
        .then(data => {
          window.RIVER_ORDE1_DATA = data;
          drawOrde1(data);
        })
        .catch(err => console.warn('Gagal memuat sungai utama orde 1:', err));
    }
  }

  function setupRiverFeatureInteractions(feat, layer) {
    const p = feat.properties || {};
    const title = p.Sungai ? `Sungai ${p.Sungai}` : 'Alur Sungai Utama';
    const pKm = p.Panjang_km ? `${p.Panjang_km} km` : '';

    if (layer.options) {
      layer._originalStyle = {
        color: layer.options.color,
        weight: layer.options.weight,
        opacity: layer.options.opacity
      };
    }

    layer.bindTooltip(`
      <div style="font-family: Inter, sans-serif;">
        <span style="display: inline-block; background: ${p.casing_color || '#38bdf8'}; color: #070d1e; font-size: 0.65rem; font-weight: 800; padding: 1px 6px; border-radius: 3px; margin-bottom: 2px;">${p.ws_name || p.WS || 'Jawa Timur'}</span><br>
        <strong>${title}</strong><br>
        <small style="color: #94a3b8;">DAS ${p.DAS || '-'} ${pKm ? '• Panjang: ' + pKm : ''}</small>
      </div>
    `, { sticky: true, className: 'ge-map-tooltip' });

    layer.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      showGoogleEarthInspector(feat, null, layer);
    });

    layer.on('mouseover', () => {
      if (layer.setStyle && layer !== selectedVectorLayer) {
        layer.setStyle({ color: '#ffffff', weight: 4.5, opacity: 1.0 });
      }
    });

    layer.on('mouseout', () => {
      if (layer.setStyle && layer !== selectedVectorLayer) {
        layer.setStyle(layer._originalStyle || {
          color: p.core_color || '#1e40af',
          weight: 2.2,
          opacity: 1.0
        });
      }
    });
  }

  // --- GEOMETRIC HELPERS (POINT IN POLYGON & LINE PROJECTION) ---
  function findWsForCoordinate(lat, lon) {
    if (!window.BATAS_WS_DATA || !window.BATAS_WS_DATA.features) return null;

    for (const feat of window.BATAS_WS_DATA.features) {
      const geom = feat.geometry;
      if (geom.type === 'Polygon') {
        const coords = geom.coordinates[0];
        if (isPointInsidePolygon([lon, lat], coords)) {
          return feat.properties;
        }
      } else if (geom.type === 'MultiPolygon') {
        for (const polyCoords of geom.coordinates) {
          if (isPointInsidePolygon([lon, lat], polyCoords[0])) {
            return feat.properties;
          }
        }
      }
    }

    let closest = null;
    let minD = Infinity;
    for (const feat of window.BATAS_WS_DATA.features) {
      const c = feat.properties.centroid;
      const d = calculateDistanceKm(lat, lon, c[1], c[0]);
      if (d < minD) {
        minD = d;
        closest = feat.properties;
      }
    }
    return closest;
  }

  function loadRiverGeoJson(slug, callback) {
    if (window.RIVER_CACHE && window.RIVER_CACHE[slug]) {
      callback(window.RIVER_CACHE[slug]);
      return;
    }
    fetch(`data/sungai/${slug}.json`)
      .then(res => res.json())
      .then(data => {
        window.RIVER_CACHE = window.RIVER_CACHE || {};
        window.RIVER_CACHE[slug] = data;
        callback(data);
      })
      .catch(() => {
        const script = document.createElement('script');
        script.src = `data/sungai/${slug}.js`;
        script.onload = () => {
          if (window.RIVER_CACHE && window.RIVER_CACHE[slug]) {
            callback(window.RIVER_CACHE[slug]);
          }
        };
        document.head.appendChild(script);
      });
  }

  // --- FEATURE 3: PROXIMITY DETECTION & REKOMENDASI SUNGAI TERDEKAT (ORDE 1-8) ---
  function findNearbyRiversAndRecommend(targetLat, targetLon) {
    const wsInfo = findWsForCoordinate(targetLat, targetLon);
    if (!wsInfo) return;

    const nearbyCard = document.getElementById('nearbyRiversCard');
    const wsBadge = document.getElementById('nearbyWsBadge');
    const listEl = document.getElementById('nearbyRiversList');

    if (nearbyCard) nearbyCard.classList.remove('hidden');
    if (wsBadge) {
      wsBadge.textContent = wsInfo.name;
      wsBadge.style.borderColor = wsInfo.casing;
      wsBadge.style.color = wsInfo.casing;
    }
    if (listEl) {
      listEl.innerHTML = `
        <div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 0.78rem;">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right: 6px; color: #38bdf8;"></i>
          Menganalisis jaringan sungai terdekat di ${wsInfo.name}...
        </div>
      `;
    }

    loadRiverGeoJson(wsInfo.slug, (geoJsonData) => {
      if (!geoJsonData || !geoJsonData.features) {
        if (listEl) listEl.innerHTML = '<div style="padding: 8px; color: #f87171; font-size: 0.75rem;">Gagal memuat data sungai.</div>';
        return;
      }

      const riverCandidates = [];
      geoJsonData.features.forEach((feat, idx) => {
        const geom = feat.geometry;
        const p = feat.properties || {};
        const vRes = getMinDistanceToGeometry(targetLat, targetLon, geom);

        riverCandidates.push({
          id: `river_${wsInfo.slug}_${idx}`,
          feature: feat,
          properties: p,
          distanceKm: vRes.distanceKm,
          distanceM: Math.round(vRes.distanceKm * 1000),
          closestPoint: vRes.closestPoint,
          isInside: vRes.isInside,
          wsInfo: wsInfo
        });
      });

      // Urutkan berdasarkan jarak terdekat (ascending)
      riverCandidates.sort((a, b) => a.distanceKm - b.distanceKm);

      // Deduplikasi nama sungai agar rekomendasi bervariasi
      const topRecommended = [];
      const seenNames = new Set();
      for (const item of riverCandidates) {
        const name = item.properties.Sungai || `Segmen-${item.id}`;
        if (!seenNames.has(name) || seenNames.size < 3) {
          seenNames.add(name);
          topRecommended.push(item);
        }
        if (topRecommended.length >= 5) break;
      }

      activeRecommendedRivers = topRecommended;
      renderRecommendedRiversUI(topRecommended, targetLat, targetLon);
      renderRecommendedRiversOnMap(topRecommended, targetLat, targetLon);

      // REVISI 1: TAMPILKAN PROKSIMITAS SUNGAI DI BILAH BAWAH (TEPAT DI ATAS TARGET BAR)
      if (topRecommended.length > 0) {
        const topRiver = topRecommended[0];
        const rName = topRiver.properties.Sungai ? `Sungai ${topRiver.properties.Sungai}` : 'Alur Sungai Terdekat';
        const dStr = topRiver.distanceM < 1000 ? `${topRiver.distanceM} m` : `${topRiver.distanceKm.toFixed(2)} km`;
        updateFloatingRiverProximityBadge(dStr, rName);
      } else {
        const rBadge = document.getElementById('floatingRiverProximityBadge');
        if (rBadge) {
          rBadge.classList.add('hidden');
          rBadge.style.display = 'none';
        }
      }
    });
  }

  function updateFloatingRiverProximityBadge(distStr, riverName) {
    const riverBadge = document.getElementById('floatingRiverProximityBadge');
    const riverText = document.getElementById('floatingRiverProximityText');
    if (riverBadge && riverText) {
      riverText.innerHTML = `<span style="color: #38bdf8; font-weight: 700;"><i class="fa-solid fa-ruler" style="margin-right: 5px;"></i>${distStr}</span> ke <strong style="color: #ffffff;">${riverName}</strong>`;
      riverBadge.classList.remove('hidden');
      riverBadge.style.display = 'inline-flex';
    }
  }

  function renderRecommendedRiversUI(rivers, targetLat, targetLon) {
    const listEl = document.getElementById('nearbyRiversList');
    if (!listEl) return;

    if (rivers.length === 0) {
      listEl.innerHTML = '<div style="padding: 8px; color: #94a3b8; font-size: 0.75rem;">Tidak ada sungai terdeteksi di sekitar titik target.</div>';
      return;
    }

    listEl.innerHTML = rivers.map((item) => {
      const p = item.properties;
      const name = p.Sungai ? `Sungai ${p.Sungai}` : 'Alur Sungai Terdekat';
      const distStr = item.distanceM < 1000 ? `${item.distanceM} m` : `${item.distanceKm.toFixed(2)} km`;
      const pKm = p.Panjang_km ? `${p.Panjang_km} km` : '-';

      return `
        <div class="nearby-river-item active" id="riverItem_${item.id}" data-river-id="${item.id}">
          <div class="river-item-info">
            <div class="river-item-title-row">
              <span class="river-item-name" title="${name}"><i class="fa-solid fa-water" style="color: #38bdf8; margin-right: 5px;"></i>${name}</span>
            </div>
            <div class="river-item-meta">
              <span class="river-dist-badge"><i class="fa-solid fa-ruler"></i> ${distStr}</span>
              <span><i class="fa-solid fa-diagram-project"></i> DAS ${p.DAS || '-'}</span>
              <span><i class="fa-solid fa-route"></i> ${pKm}</span>
            </div>
          </div>
          <div class="river-item-actions">
            <button class="btn-river-action btn-toggle-river active" data-river-id="${item.id}" title="Tampilkan/Sembunyikan sungai ini di peta">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-river-action btn-focus-river" data-river-id="${item.id}" title="Fokus & Zoom ke sungai ini">
              <i class="fa-solid fa-crosshairs"></i>
            </button>
            <button class="btn-river-action btn-info-river" data-river-id="${item.id}" title="Lihat detail atribut resmi PUSDA">
              <i class="fa-solid fa-circle-info"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners ke tombol-tombol rekomendasi sungai
    rivers.forEach(item => {
      const row = document.getElementById(`riverItem_${item.id}`);
      if (!row) return;

      const btnToggle = row.querySelector('.btn-toggle-river');
      const btnFocus = row.querySelector('.btn-focus-river');
      const btnInfo = row.querySelector('.btn-info-river');

      if (btnToggle) {
        btnToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const isVisible = toggleSingleRecommendedRiver(item.id);
          btnToggle.classList.toggle('active', isVisible);
          btnToggle.innerHTML = isVisible ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
          row.classList.toggle('active', isVisible);
        });
      }

      if (btnFocus) {
        btnFocus.addEventListener('click', (e) => {
          e.stopPropagation();
          focusOnRecommendedRiver(item.id);
        });
      }

      if (btnInfo) {
        btnInfo.addEventListener('click', (e) => {
          e.stopPropagation();
          const entry = recommendedLayerEntries.get(item.id);
          showGoogleEarthInspector(item.feature, null, entry ? entry.coreLayer : null);
        });
      }

      row.addEventListener('click', () => {
        focusOnRecommendedRiver(item.id);
      });
    });
  }

  function renderRecommendedRiversOnMap(rivers, targetLat, targetLon) {
    recommendedRiversGroup.clearLayers();
    recommendedLayerEntries.clear();

    rivers.forEach((item, index) => {
      const p = item.properties;
      const wsCfg = item.wsInfo;
      const subGroup = L.featureGroup();

      // Underlay casing dengan aksen terang (Gold untuk rank 1, Casing WS untuk lainnya)
      const highlightCasing = L.geoJSON(item.feature, {
        pane: 'recommendedRiversPane',
        style: {
          color: index === 0 ? '#fbbf24' : (wsCfg.casing || '#00e5ff'),
          weight: 6.8,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        }
      });
      subGroup.addLayer(highlightCasing);

      // Core layer Deep River Blue
      const highlightCore = L.geoJSON(item.feature, {
        pane: 'recommendedRiversPane',
        style: {
          color: '#1e40af',
          weight: 3.2,
          opacity: 1.0,
          lineCap: 'round',
          lineJoin: 'round'
        },
        onEachFeature: (feat, layer) => {
          setupRiverFeatureInteractions(feat, layer);
        }
      });
      subGroup.addLayer(highlightCore);

      // Garis proksimitas putus-putus beranimasi dari target koordinat ke titik terdekat sungai
      if (item.closestPoint) {
        const connector = L.polyline([
          [targetLat, targetLon],
          [item.closestPoint.lat, item.closestPoint.lon]
        ], {
          pane: 'recommendedRiversPane',
          color: index === 0 ? '#fbbf24' : '#38bdf8',
          weight: index === 0 ? 3.0 : 2.0,
          opacity: 0.9,
          className: 'radar-river-connector'
        });

        const distStr = item.distanceM < 1000 ? `${item.distanceM} m` : `${item.distanceKm.toFixed(2)} km`;
        connector.bindTooltip(`
          <div style="font-family: Inter, sans-serif; font-size: 0.72rem; font-weight: 700; color: #38bdf8;">
            <i class="fa-solid fa-ruler"></i> ${distStr} ke ${p.Sungai ? 'Sungai ' + p.Sungai : 'Sungai'}
          </div>
        `, { sticky: true, className: 'ge-map-tooltip' });

        subGroup.addLayer(connector);
      }

      recommendedRiversGroup.addLayer(subGroup);
      recommendedLayerEntries.set(item.id, {
        group: subGroup,
        feature: item.feature,
        coreLayer: highlightCore
      });
    });
  }

  function toggleSingleRecommendedRiver(id) {
    const entry = recommendedLayerEntries.get(id);
    if (!entry) return false;
    if (recommendedRiversGroup.hasLayer(entry.group)) {
      recommendedRiversGroup.removeLayer(entry.group);
      return false;
    } else {
      recommendedRiversGroup.addLayer(entry.group);
      return true;
    }
  }

  function focusOnRecommendedRiver(id) {
    const entry = recommendedLayerEntries.get(id);
    if (!entry) return;
    if (!recommendedRiversGroup.hasLayer(entry.group)) {
      recommendedRiversGroup.addLayer(entry.group);
      const row = document.getElementById(`riverItem_${id}`);
      if (row) {
        row.classList.add('active');
        const btnToggle = row.querySelector('.btn-toggle-river');
        if (btnToggle) {
          btnToggle.classList.add('active');
          btnToggle.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
      }
    }
    if (entry.group.getBounds && entry.group.getBounds().isValid()) {
      map.fitBounds(entry.group.getBounds(), { padding: [50, 50], maxZoom: 16, duration: 0.8 });
    }
    showGoogleEarthInspector(entry.feature, null, entry.coreLayer);
  }

  // --- TOGGLE FULL BASIN DETAIL (ORDE 1-8 ON-DEMAND) ---
  const btnToggleAllOrde = document.getElementById('btnToggleAllOrde');
  const lblToggleAllOrde = document.getElementById('lblToggleAllOrde');

  if (btnToggleAllOrde) {
    btnToggleAllOrde.addEventListener('click', () => {
      if (!activeRecommendedRivers || activeRecommendedRivers.length === 0) {
        showToast('Info Sungai', 'Silakan tentukan titik target koordinat terlebih dahulu.');
        return;
      }
      const wsSlug = activeRecommendedRivers[0].wsInfo.slug;
      const wsName = activeRecommendedRivers[0].wsInfo.name;

      isAllOrdeVisibleInActiveWs = !isAllOrdeVisibleInActiveWs;

      if (isAllOrdeVisibleInActiveWs) {
        loadFullBasinDetail(wsSlug);
        if (lblToggleAllOrde) lblToggleAllOrde.textContent = `Sembunyikan Cabang Sungai (${wsName})`;
        btnToggleAllOrde.classList.add('active');
        showToast(`Memuat ${wsName}`, 'Menampilkan seluruh jaringan cabang sungai.');
      } else {
        onDemandFullBasinGroup.clearLayers();
        if (lblToggleAllOrde) lblToggleAllOrde.textContent = 'Tampilkan Seluruh Cabang Sungai';
        btnToggleAllOrde.classList.remove('active');
        showToast('Tampilan Ringan Aktif', 'Kembali ke tampilan alur sungai utama.');
      }
    });
  }

  function loadFullBasinDetail(wsSlug) {
    const cfg = RIVERS_CONFIG[wsSlug];
    if (!cfg) return;

    loadRiverGeoJson(wsSlug, (geoJsonData) => {
      onDemandFullBasinGroup.clearLayers();

      const casingLayer = L.geoJSON(geoJsonData, {
        pane: 'riversCasingPane',
        style: () => ({
          color: cfg.casing,
          weight: 4.8,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        })
      });
      onDemandFullBasinGroup.addLayer(casingLayer);

      const coreLayer = L.geoJSON(geoJsonData, {
        pane: 'riversCorePane',
        style: (feat) => {
          const orde = (feat.properties && feat.properties.Orde) || 3;
          const w = orde === 1 ? 2.8 : (orde === 2 ? 2.2 : (orde === 3 ? 1.8 : 1.4));
          return {
            color: cfg.core,
            weight: w,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
          };
        },
        onEachFeature: (feat, layer) => {
          setupRiverFeatureInteractions(feat, layer);
        }
      });
      onDemandFullBasinGroup.addLayer(coreLayer);

      if (onDemandFullBasinGroup.getBounds && onDemandFullBasinGroup.getBounds().isValid()) {
        map.fitBounds(onDemandFullBasinGroup.getBounds(), { padding: [40, 40], maxZoom: 14, duration: 0.8 });
      }
    });
  }

  // --- UNIFIED LAYER FILTER (DI, WS, SUNGAI, ASET TANAH) CONTROLS ---
  const btnToggleDi = document.getElementById('btnToggleDi');
  const btnToggleWs = document.getElementById('btnToggleWs');
  const btnToggleRivers = document.getElementById('btnToggleRivers');
  const btnToggleAsetTanah = document.getElementById('btnToggleAsetTanah');

  const btnToggleLayerMenu = document.getElementById('btnToggleLayerMenu');
  const layerFilterDropdown = document.getElementById('layerFilterDropdown');
  const layerFilterCounter = document.getElementById('layerFilterCounter');

  const chkLayerDi = document.getElementById('chkLayerDi');
  const chkLayerWs = document.getElementById('chkLayerWs');
  const chkLayerRivers = document.getElementById('chkLayerRivers');
  const chkLayerAsetTanah = document.getElementById('chkLayerAsetTanah');

  const filterRowDi = document.getElementById('filterRowDi');
  const filterRowWs = document.getElementById('filterRowWs');
  const filterRowRivers = document.getElementById('filterRowRivers');
  const filterRowAsetTanah = document.getElementById('filterRowAsetTanah');
  const selAsetCategory = document.getElementById('selAsetCategory');

  function updateLayerCounter() {
    let count = 0;
    if (isDiVisible) count++;
    if (isWsVisible) count++;
    if (isRiversVisible) count++;
    if (isAsetTanahVisible) count++;
    if (layerFilterCounter) {
      layerFilterCounter.textContent = `${count} Aktif`;
    }
  }

  // 1. Toggle Layer DI
  function setDiVisibility(visible) {
    isDiVisible = visible;
    if (markerClusterGroup) {
      if (isDiVisible) {
        if (!map.hasLayer(markerClusterGroup)) map.addLayer(markerClusterGroup);
      } else {
        if (map.hasLayer(markerClusterGroup)) map.removeLayer(markerClusterGroup);
      }
    }
    if (btnToggleDi) btnToggleDi.classList.toggle('active', isDiVisible);
    if (chkLayerDi) chkLayerDi.checked = isDiVisible;
    if (filterRowDi) filterRowDi.classList.toggle('active', isDiVisible);
    updateLayerCounter();
    showToast(
      isDiVisible ? 'Layer DI Aktif' : 'Layer DI Disembunyikan',
      isDiVisible ? 'Sebaran 1.600+ Daerah Irigasi ditampilkan.' : 'Sebaran Daerah Irigasi disembunyikan.'
    );
  }

  // 2. Toggle Layer WS
  function setWsVisibility(visible) {
    isWsVisible = visible;
    if (wsBoundariesGroup) {
      if (isWsVisible) {
        if (!map.hasLayer(wsBoundariesGroup)) map.addLayer(wsBoundariesGroup);
        if (wsLabelsGroup && !map.hasLayer(wsLabelsGroup)) map.addLayer(wsLabelsGroup);
      } else {
        if (map.hasLayer(wsBoundariesGroup)) map.removeLayer(wsBoundariesGroup);
        if (wsLabelsGroup && map.hasLayer(wsLabelsGroup)) map.removeLayer(wsLabelsGroup);
      }
    }
    if (btnToggleWs) btnToggleWs.classList.toggle('active', isWsVisible);
    if (chkLayerWs) chkLayerWs.checked = isWsVisible;
    if (filterRowWs) filterRowWs.classList.toggle('active', isWsVisible);
    updateLayerCounter();
    showToast(
      isWsVisible ? 'Layer WS Aktif' : 'Layer WS Disembunyikan',
      isWsVisible ? 'Poligon batas 6 Wilayah Sungai ditampilkan.' : 'Poligon batas Wilayah Sungai disembunyikan.'
    );
  }

  // 3. Toggle Layer Sungai
  function setRiversVisibility(visible) {
    isRiversVisible = visible;
    if (orde1RiversGroup) {
      if (isRiversVisible) {
        if (!map.hasLayer(orde1RiversGroup)) map.addLayer(orde1RiversGroup);
      } else {
        if (map.hasLayer(orde1RiversGroup)) map.removeLayer(orde1RiversGroup);
      }
    }
    if (btnToggleRivers) btnToggleRivers.classList.toggle('active', isRiversVisible);
    if (chkLayerRivers) chkLayerRivers.checked = isRiversVisible;
    if (filterRowRivers) filterRowRivers.classList.toggle('active', isRiversVisible);
    updateLayerCounter();
    showToast(
      isRiversVisible ? 'Layer Sungai Aktif' : 'Layer Sungai Disembunyikan',
      isRiversVisible ? 'Jaringan alur sungai utama Jawa Timur ditampilkan.' : 'Alur sungai disembunyikan.'
    );
  }

  // Header quick buttons
  if (btnToggleDi) btnToggleDi.addEventListener('click', () => setDiVisibility(!isDiVisible));
  if (btnToggleWs) btnToggleWs.addEventListener('click', () => setWsVisibility(!isWsVisible));
  if (btnToggleRivers) btnToggleRivers.addEventListener('click', () => setRiversVisibility(!isRiversVisible));
  if (btnToggleAsetTanah) btnToggleAsetTanah.addEventListener('click', () => setAsetTanahVisibility(!isAsetTanahVisible));

  // Dropdown checkboxes
  if (chkLayerDi) chkLayerDi.addEventListener('change', (e) => setDiVisibility(e.target.checked));
  if (chkLayerWs) chkLayerWs.addEventListener('change', (e) => setWsVisibility(e.target.checked));
  if (chkLayerRivers) chkLayerRivers.addEventListener('change', (e) => setRiversVisibility(e.target.checked));
  if (chkLayerAsetTanah) chkLayerAsetTanah.addEventListener('change', (e) => setAsetTanahVisibility(e.target.checked));

  // Dropdown row clicks
  if (filterRowDi) {
    filterRowDi.addEventListener('click', (e) => {
      if (e.target !== chkLayerDi && !e.target.closest('.custom-switch')) {
        setDiVisibility(!isDiVisible);
      }
    });
  }
  if (filterRowWs) {
    filterRowWs.addEventListener('click', (e) => {
      if (e.target !== chkLayerWs && !e.target.closest('.custom-switch')) {
        setWsVisibility(!isWsVisible);
      }
    });
  }
  if (filterRowRivers) {
    filterRowRivers.addEventListener('click', (e) => {
      if (e.target !== chkLayerRivers && !e.target.closest('.custom-switch')) {
        setRiversVisibility(!isRiversVisible);
      }
    });
  }
  if (filterRowAsetTanah) {
    filterRowAsetTanah.addEventListener('click', (e) => {
      if (e.target !== chkLayerAsetTanah && !e.target.closest('.custom-switch') && !e.target.closest('.aset-category-filter-wrap')) {
        setAsetTanahVisibility(!isAsetTanahVisible);
      }
    });
  }
  if (selAsetCategory) {
    selAsetCategory.addEventListener('change', (e) => {
      setAsetTanahCategoryFilter(e.target.value);
    });
    selAsetCategory.addEventListener('click', (e) => e.stopPropagation());
  }

  // Dropdown Menu Toggle & Outside Click
  if (btnToggleLayerMenu && layerFilterDropdown) {
    btnToggleLayerMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCurrentlyHidden = layerFilterDropdown.classList.contains('hidden');
      if (basemapDropdown) basemapDropdown.classList.add('hidden');
      layerFilterDropdown.classList.toggle('hidden', !isCurrentlyHidden);
    });

    document.addEventListener('click', (e) => {
      if (!layerFilterDropdown.contains(e.target) && e.target !== btnToggleLayerMenu && !btnToggleLayerMenu.contains(e.target)) {
        layerFilterDropdown.classList.add('hidden');
      }
    });
  }

  // On-demand WS River Detail Buttons
  document.querySelectorAll('.river-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wsSlug = btn.getAttribute('data-ws');
      loadFullBasinDetail(wsSlug);
      if (layerFilterDropdown) layerFilterDropdown.classList.add('hidden');
    });
  });

  // START APPLICATION
  initMap();
  loadDiData();
});

