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

    // Click map to trigger pinpoint & proximity
    map.on('click', (e) => {
      setPinpointLocation(e.latlng.lat, e.latlng.lng, 'Titik Klik di Peta');
    });

    // Inisialisasi Custom Panes, Batas WS (Poligon & Notasi) & Sungai Orde 1-2
    initWsAndRivers();
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

  // SHOW GOOGLE EARTH INSPECTOR CARD (GAMBAR 3 & SUNGAI JATIM)
  function showGoogleEarthInspector(feature, di, layer) {
    const p = feature.properties || {};
    const geomType = feature.geometry ? feature.geometry.type : '';
    const isRiver = Boolean(p.ws_slug || p.Sungai || p.WS);
    const tipe = isRiver ? 'sungai' : (p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan')));

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
    } else {
      iconContainer.innerHTML = '<i class="fa-solid fa-map-pin" style="color: #eab308;"></i>';
    }

    // Title
    const title = isRiver
      ? (p.Sungai ? `Sungai ${p.Sungai}` : 'Alur Sungai Jatim')
      : (p.name || p.nomenklatur || p.nama || (tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi')));
    document.getElementById('geTitle').textContent = title;
    document.getElementById('geTitle').title = title;

    // Subtitle
    const subLabel = isRiver 
      ? `${p.ws_name || p.WS || 'Wilayah Sungai'} • DAS ${p.DAS || '-'}`
      : `${tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi')} • ${p.di_name || (di ? di.nama_di : 'Daerah Irigasi')}`;
    document.getElementById('geSubTitle').textContent = subLabel;

    // Metrics Group
    const areaRow = document.getElementById('geAreaRow');
    const perimeterRow = document.getElementById('gePerimeterRow');
    const perimeterLabel = document.getElementById('gePerimeterLabel');

    if (tipe === 'petak') {
      areaRow.style.display = 'block';
      document.getElementById('geAreaVal').textContent = p.area_m2 || '-';
      document.getElementById('geAreaHaVal').textContent = p.area_ha || '-';
      perimeterLabel.textContent = 'Perimeter';
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

    // Attributes list
    if (isRiver) {
      document.getElementById('geAttrIdDi').textContent = p.ws_name || p.WS || '-';
      document.getElementById('geAttrKAset').textContent = p.Orde ? `Orde ${p.Orde}` : '-';
      document.getElementById('geAttrNama').textContent = p.Sungai || '-';
      document.getElementById('geAttrNomenklatur').textContent = p.Induk ? `Induk: ${p.Induk}` : (p.Nomenklatr || '-');
      document.getElementById('geAttrNorec').textContent = p.Kabupaten || '-';
      document.getElementById('geAttrDi').textContent = p.DAS ? `DAS ${p.DAS}` : '-';
      document.getElementById('geAttrUpt').textContent = p.keterangan || 'Wilayah Sungai PUSDA Jatim';
    } else {
      document.getElementById('geAttrIdDi').textContent = p.id_di || (di ? di.id : '-');
      document.getElementById('geAttrKAset').textContent = p.k_aset || '-';
      document.getElementById('geAttrNama').textContent = p.nama || p.name || '-';
      document.getElementById('geAttrNomenklatur').textContent = p.nomenklatur || '-';
      document.getElementById('geAttrNorec').textContent = p.norec || '-';
      document.getElementById('geAttrDi').textContent = p.di_name || (di ? di.nama_di : '-');
      document.getElementById('geAttrUpt').textContent = p.upt || (di ? di.upt : '-');
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
          opacity: layer.options.opacity
        };
      }
      if (tipe === 'saluran' || tipe === 'sungai') {
        layer.setStyle({ color: '#ffffff', weight: 4.8, opacity: 1.0 });
      } else if (tipe === 'petak') {
        layer.setStyle({ fillColor: '#4ade80', fillOpacity: 0.65, weight: 3.8, color: '#ffffff' });
      }
    }

    // Store active feature
    window.currentGeActiveFeature = { feature, di, layer, isRiver };

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

      // 1. UNDERLAY CASING LAYER: Garis Luar Pembungkus Saluran Irigasi (Opsi A - Gambar 1)
      const casingLayer = L.geoJSON(geoJsonData, {
        pane: 'diHighlightPane',
        filter: function(feature) {
          const geomType = feature.geometry ? feature.geometry.type : '';
          const p = feature.properties || {};
          const tipe = p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'));
          return tipe === 'saluran' || geomType === 'LineString' || geomType === 'MultiLineString';
        },
        style: function() {
          return {
            color: colorCfg.color, // Warna pembeda DI di tepi saluran (contoh: amber orange Gambar 1)
            weight: 6.2,           // Casing lebar membungkus inti air
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false     // Mouse event tembus langsung ke inti saluran
          };
        }
      });
      casingLayer.addTo(diFeatureGroup);

      // 2. MAIN INTERACTIVE VECTOR LAYER (Inti Saluran Air, Petak Sawah, Bangunan)
      const mainLayer = L.geoJSON(geoJsonData, {
        pane: 'diHighlightPane',
        style: function(feature) {
          const p = feature.properties || {};
          const geomType = feature.geometry ? feature.geometry.type : '';
          const tipe = p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'));

          if (tipe === 'saluran' || geomType === 'LineString' || geomType === 'MultiLineString') {
            countSaluran++;
            return {
              color: '#00e5ff', // Inti saluran: Biru muda air alami (Gambar 1)
              weight: 2.8,
              opacity: 1.0,
              lineCap: 'round',
              lineJoin: 'round'
            };
          } else {
            countPetak++;
            return {
              fillColor: '#22c55e',  // Warna petak sawah: Hijau alami (Gambar 1)
              fillOpacity: 0.35,      // Transparan agar tekstur citra satelit tetap terlihat
              color: colorCfg.color, // Border petak sawah: Warna pembeda DI (Gambar 1)
              weight: 2.8,
              opacity: 1.0,
              lineCap: 'round',
              lineJoin: 'round'
            };
          }
        },
        pointToLayer: function(feature, latlng) {
          countBangunan++;
          return L.marker(latlng, { icon: pushpinIcon });
        },
        onEachFeature: function(feature, featLayer) {
          const p = feature.properties || {};
          const geomType = feature.geometry ? feature.geometry.type : '';
          const tipe = p.tipe || (geomType === 'Polygon' ? 'petak' : (geomType === 'LineString' ? 'saluran' : 'bangunan'));
          const title = p.name || p.nomenklatur || p.nama || (tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi'));

          // Simpan original style agar tidak rusak saat di-hover / di-klik
          if (featLayer.options) {
            featLayer._originalStyle = {
              color: featLayer.options.color,
              weight: featLayer.options.weight,
              fillColor: featLayer.options.fillColor,
              fillOpacity: featLayer.options.fillOpacity,
              opacity: featLayer.options.opacity
            };
          }

          // Tooltip on hover dengan identitas DI & rank color badge
          featLayer.bindTooltip(`
            <div style="font-family: Inter, sans-serif;">
              <span style="display: inline-block; background: ${colorCfg.badgeBg}; color: ${colorCfg.badgeText}; font-size: 0.65rem; font-weight: 800; padding: 1px 6px; border-radius: 3px; margin-bottom: 2px;">#${rankIndex + 1} ${di.nama_di}</span><br>
              <strong>${title}</strong><br>
              <small style="color: #94a3b8;">${tipe === 'petak' ? 'Petak Sawah' : (tipe === 'saluran' ? 'Saluran Irigasi' : 'Bangunan Irigasi')}</small>
            </div>
          `, { sticky: true, className: 'ge-map-tooltip' });

          // Click event membuka Google Earth Inspector Card (Gambar 3)
          featLayer.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            showGoogleEarthInspector(feature, di, featLayer);
          });

          if (!firstInteractiveFeature && (tipe === 'petak' || tipe === 'saluran')) {
            firstInteractiveFeature = feature;
            firstInteractiveLayer = featLayer;
          }
        }
      });
      mainLayer.addTo(diFeatureGroup);

      diFeatureGroup.addTo(map);

      activeHighlightedDis.set(diId, {
        di,
        layer: diFeatureGroup,
        mainLayer,
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
        const targetLayer = entry.mainLayer || entry.layer;
        targetLayer.eachLayer((featLayer) => {
          if (!window.currentGeActiveFeature && featLayer.feature) {
            showGoogleEarthInspector(featLayer.feature, entry.di, featLayer);
          }
        });
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

  // 8. PINPOINT & PROXIMITY SIGNAL (RADAR CORE FEATURE)
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

    // Draw animated connection polylines to Top 5 with matching rank color
    nearest5.forEach((di, index) => {
      const isNearest = index === 0;
      const rankColor = NEAREST_RANK_COLORS[index % NEAREST_RANK_COLORS.length].color;
      const polyline = L.polyline([[lat, lon], [di.lat, di.lon]], {
        color: rankColor,
        weight: isNearest ? 3.5 : 2.0,
        opacity: isNearest ? 0.95 : 0.75,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(map);

      radarPolylines.push(polyline);
    });

    // Populate Sidebar 5 DI Terdekat
    renderNearestList(nearest5);

    // Auto-highlight DI #1 terdekat sebagai perbandingan awal
    clearAllHighlightedDis();
    loadAndAddDiHighlight(nearest5[0].id, 0, false);

    // Hitung & Rekomendasikan Sungai Terdekat (Orde 1-8) On-Demand
    findNearbyRiversAndRecommend(lat, lon);

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
          <div class="dist-badge" style="border: 1px solid ${colorCfg.color}; color: ${colorCfg.color};">${item.distance.toFixed(2)} km</div>
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

  // 13. SIDEBAR TOGGLE & RESET VIEW
  const sidebar = document.getElementById('sidebar');
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
  });
  document.getElementById('btnCloseSidebar').addEventListener('click', () => {
    sidebar.classList.add('hidden');
  });

  document.getElementById('btnResetView').addEventListener('click', () => {
    clearAllHighlightedDis();
    map.fitBounds(EAST_JAVA_BOUNDS, { padding: [20, 20], duration: 1.0 });
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
  let orde12RiversGroup;
  let recommendedRiversGroup;
  let onDemandFullBasinGroup;

  let isWsVisible = true;
  let isOrde12Visible = true;
  let activeRecommendedRivers = [];
  let recommendedLayerEntries = new Map();
  let isAllOrdeVisibleInActiveWs = false;

  function initRiverPanes() {
    if (!map.getPane('wsBoundsPane')) {
      const wsPane = map.createPane('wsBoundsPane');
      wsPane.style.zIndex = 405; // Di bawah sungai dan DI, di atas basemap
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
    if (!map.getPane('diHighlightPane')) {
      const diPane = map.createPane('diHighlightPane');
      diPane.style.zIndex = 450;
    }
  }

  function initWsAndRivers() {
    initRiverPanes();

    wsBoundariesGroup = L.featureGroup().addTo(map);
    wsLabelsGroup = L.featureGroup().addTo(map);
    orde12RiversGroup = L.featureGroup().addTo(map);
    recommendedRiversGroup = L.featureGroup().addTo(map);
    onDemandFullBasinGroup = L.featureGroup().addTo(map);

    // 1. Render Batas 6 Wilayah Sungai (Poligon & Label Notasi Semi-Transparan)
    renderWsBoundaries();

    // 2. Render Jaringan Sungai Ringan Awal (HANYA Orde 1 & 2)
    renderOrde12Rivers();
  }

  // --- FEATURE 1: BATAS WILAYAH SUNGAI (WS) & NOTASI TEXT ---
  function renderWsBoundaries() {
    function drawWsFeatures(fc) {
      if (!fc || !fc.features) return;
      wsBoundariesGroup.clearLayers();
      wsLabelsGroup.clearLayers();

      const wsLayer = L.geoJSON(fc, {
        pane: 'wsBoundsPane',
        style: function(feat) {
          const p = feat.properties || {};
          return {
            color: '#0f172a',      // Garis tepi tegas gelap persis batas administrasi/WS
            weight: 3.2,
            opacity: 0.9,
            fillColor: p.casing || '#3b82f6',
            fillOpacity: 0.14,     // Tint warna semi-transparan agar citra satelit tetap terbaca
            lineCap: 'round',
            lineJoin: 'round'
          };
        },
        onEachFeature: function(feat, layer) {
          const p = feat.properties || {};

          layer.on('mouseover', () => {
            layer.setStyle({ fillOpacity: 0.24, weight: 3.8 });
          });
          layer.on('mouseout', () => {
            layer.setStyle({ fillOpacity: 0.14, weight: 3.2 });
          });

          layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (layer.getBounds && layer.getBounds().isValid()) {
              map.fitBounds(layer.getBounds(), { padding: [40, 40], duration: 0.8 });
            }
            showToast(p.name, `Wilayah: ${p.kabupaten} • ${p.total_rivers} segmen sungai (${p.total_km} km)`);
          });

          layer.bindTooltip(`
            <div style="font-family: Inter, sans-serif; padding: 4px;">
              <strong style="color: ${p.casing}; font-size: 0.85rem;">${p.name}</strong><br>
              <span style="font-size: 0.72rem; color: #cbd5e1;">Cakupan: ${p.kabupaten}</span><br>
              <small style="color: #94a3b8;">${p.total_rivers} segmen sungai • ${p.total_km} km</small>
            </div>
          `, { sticky: true, className: 'ge-map-tooltip' });

          // Notasi Text Semi-Transparan di Centroid Poligon WS
          if (p.centroid && Array.isArray(p.centroid)) {
            const labelIcon = L.divIcon({
              className: 'ws-centroid-label',
              html: `
                <div class="ws-label-pill" style="border-color: ${p.casing};">
                  <span class="ws-label-code" style="background: ${p.casing};">${p.code || 'WS'}</span>
                  <span class="ws-label-title">${p.name.toUpperCase()}</span>
                </div>
              `,
              iconSize: [160, 32],
              iconAnchor: [80, 16]
            });

            const marker = L.marker([p.centroid[1], p.centroid[0]], {
              icon: labelIcon,
              interactive: false,
              pane: 'wsBoundsPane'
            });
            wsLabelsGroup.addLayer(marker);
          }
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

  // --- FEATURE 2: SUNGAI ORDE 1 & 2 SAJA PADA AWAL HALAMAN ---
  function renderOrde12Rivers() {
    function drawOrde12(fc) {
      if (!fc || !fc.features) return;
      orde12RiversGroup.clearLayers();

      // 1. Casing Layer (Dual-Stroke)
      const casingLayer = L.geoJSON(fc, {
        pane: 'riversCasingPane',
        style: function(feat) {
          const p = feat.properties || {};
          const orde = p.Orde || 2;
          return {
            color: p.casing_color || '#38bdf8',
            weight: orde === 1 ? 4.8 : 3.6,
            opacity: 0.92,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
          };
        }
      });
      orde12RiversGroup.addLayer(casingLayer);

      // 2. Core Layer (Deep River Blue)
      const coreLayer = L.geoJSON(fc, {
        pane: 'riversCorePane',
        style: function(feat) {
          const p = feat.properties || {};
          const orde = p.Orde || 2;
          return {
            color: p.core_color || '#1e40af',
            weight: orde === 1 ? 2.8 : 2.0,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
          };
        },
        onEachFeature: function(feat, layer) {
          setupRiverFeatureInteractions(feat, layer);
        }
      });
      orde12RiversGroup.addLayer(coreLayer);
    }

    if (window.RIVER_ORDE1_2_DATA && window.RIVER_ORDE1_2_DATA.features) {
      drawOrde12(window.RIVER_ORDE1_2_DATA);
    } else {
      fetch('data/sungai/sungai_orde1_2.json')
        .then(res => res.json())
        .then(data => {
          window.RIVER_ORDE1_2_DATA = data;
          drawOrde12(data);
        })
        .catch(err => console.warn('Gagal memuat sungai orde 1-2:', err));
    }
  }

  function setupRiverFeatureInteractions(feat, layer) {
    const p = feat.properties || {};
    const title = p.Sungai ? `Sungai ${p.Sungai}` : 'Alur Sungai Jatim';
    const pKm = p.Panjang_km ? `${p.Panjang_km} km` : '';

    layer.bindTooltip(`
      <div style="font-family: Inter, sans-serif;">
        <span style="display: inline-block; background: ${p.casing_color || '#38bdf8'}; color: #070d1e; font-size: 0.65rem; font-weight: 800; padding: 1px 6px; border-radius: 3px; margin-bottom: 2px;">${p.ws_name || p.WS || 'Jawa Timur'}</span><br>
        <strong>${title}</strong><br>
        <small style="color: #94a3b8;">DAS ${p.DAS || '-'} • Orde ${p.Orde || '-'} ${pKm ? '• ' + pKm : ''}</small>
      </div>
    `, { sticky: true, className: 'ge-map-tooltip' });

    layer.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      showGoogleEarthInspector(feat, null, layer);
    });
  }

  // --- GEOMETRIC HELPERS (POINT IN POLYGON & LINE PROJECTION) ---
  function isPointInsidePolygon(point, polygon) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function findWsForCoordinate(lat, lon) {
    if (!window.BATAS_WS_DATA || !window.BATAS_WS_DATA.features) return null;

    for (const feat of window.BATAS_WS_DATA.features) {
      const coords = feat.geometry.coordinates[0];
      if (isPointInsidePolygon([lon, lat], coords)) {
        return feat.properties;
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

  function getMinDistanceToLine(targetLat, targetLon, coords) {
    let minD = Infinity;
    let bestPt = null;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const proj = projectPointToSegment(targetLat, targetLon, p1[1], p1[0], p2[1], p2[0]);
      const dist = calculateDistanceKm(targetLat, targetLon, proj.lat, proj.lon);
      if (dist < minD) {
        minD = dist;
        bestPt = proj;
      }
    }
    return { distanceKm: minD, closestPoint: bestPt };
  }

  function projectPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { lat: x1, lon: y1 };

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { lat: x1 + t * dx, lon: y1 + t * dy };
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
          Menganalisis jaringan sungai (Orde 1–8) di ${wsInfo.name}...
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
        let minDist = Infinity;
        let bestPoint = null;

        if (geom.type === 'LineString') {
          const res = getMinDistanceToLine(targetLat, targetLon, geom.coordinates);
          minDist = res.distanceKm;
          bestPoint = res.closestPoint;
        } else if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach(lineCoords => {
            const res = getMinDistanceToLine(targetLat, targetLon, lineCoords);
            if (res.distanceKm < minDist) {
              minDist = res.distanceKm;
              bestPoint = res.closestPoint;
            }
          });
        }

        riverCandidates.push({
          id: `river_${wsInfo.slug}_${idx}`,
          feature: feat,
          properties: p,
          distanceKm: minDist,
          distanceM: Math.round(minDist * 1000),
          closestPoint: bestPoint,
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
    });
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
      const orde = p.Orde || 3;
      const distStr = item.distanceM < 1000 ? `${item.distanceM} m` : `${item.distanceKm.toFixed(2)} km`;
      const pKm = p.Panjang_km ? `${p.Panjang_km} km` : '-';

      return `
        <div class="nearby-river-item active" id="riverItem_${item.id}" data-river-id="${item.id}">
          <div class="river-item-info">
            <div class="river-item-title-row">
              <span class="river-badge-orde orde-${orde}">Orde ${orde}</span>
              <span class="river-item-name" title="${name}">${name}</span>
            </div>
            <div class="river-item-meta">
              <span class="river-dist-badge"><i class="fa-solid fa-ruler"></i> ${distStr}</span>
              <span><i class="fa-solid fa-water"></i> DAS ${p.DAS || '-'}</span>
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
        `, { permanent: index === 0, direction: 'center', className: 'ge-map-tooltip' });

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
        if (lblToggleAllOrde) lblToggleAllOrde.textContent = `Sembunyikan Orde 3–8 (${wsName})`;
        btnToggleAllOrde.classList.add('active');
        showToast(`Memuat ${wsName}`, 'Menampilkan seluruh jaringan sungai orde 1 hingga 8.');
      } else {
        onDemandFullBasinGroup.clearLayers();
        if (lblToggleAllOrde) lblToggleAllOrde.textContent = 'Tampilkan Semua Orde di WS Ini';
        btnToggleAllOrde.classList.remove('active');
        showToast('Tampilan Ringan Aktif', 'Kembali ke tampilan sungai utama Orde 1 & 2.');
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

  // --- TOP NAVBAR & MENU TOGGLE CONTROLS ---
  // 1. Toggle Batas WS
  const btnToggleWs = document.getElementById('btnToggleWs');
  const menuToggleWsBounds = document.getElementById('menuToggleWsBounds');

  function toggleWsBoundariesVisibility() {
    isWsVisible = !isWsVisible;
    if (isWsVisible) {
      if (!map.hasLayer(wsBoundariesGroup)) map.addLayer(wsBoundariesGroup);
      if (!map.hasLayer(wsLabelsGroup)) map.addLayer(wsLabelsGroup);
      if (btnToggleWs) btnToggleWs.classList.add('active');
      if (menuToggleWsBounds) menuToggleWsBounds.classList.add('active');
      showToast('Batas WS Aktif', 'Poligon batas 6 Wilayah Sungai dan label notasi ditampilkan.');
    } else {
      if (map.hasLayer(wsBoundariesGroup)) map.removeLayer(wsBoundariesGroup);
      if (map.hasLayer(wsLabelsGroup)) map.removeLayer(wsLabelsGroup);
      if (btnToggleWs) btnToggleWs.classList.remove('active');
      if (menuToggleWsBounds) menuToggleWsBounds.classList.remove('active');
      showToast('Batas WS Disembunyikan', 'Poligon batas Wilayah Sungai disembunyikan.');
    }
  }

  if (btnToggleWs) btnToggleWs.addEventListener('click', toggleWsBoundariesVisibility);
  if (menuToggleWsBounds) menuToggleWsBounds.addEventListener('click', toggleWsBoundariesVisibility);

  // 2. Toggle Sungai Orde 1 & 2
  const btnToggleRivers = document.getElementById('btnToggleRivers');
  const menuToggleOrde12 = document.getElementById('menuToggleOrde12');

  function toggleOrde12Visibility() {
    isOrde12Visible = !isOrde12Visible;
    if (isOrde12Visible) {
      if (!map.hasLayer(orde12RiversGroup)) map.addLayer(orde12RiversGroup);
      if (btnToggleRivers) btnToggleRivers.classList.add('active');
      if (menuToggleOrde12) menuToggleOrde12.classList.add('active');
      showToast('Sungai Orde 1-2 Aktif', 'Alur sungai utama dan percabangan besar ditampilkan.');
    } else {
      if (map.hasLayer(orde12RiversGroup)) map.removeLayer(orde12RiversGroup);
      if (btnToggleRivers) btnToggleRivers.classList.remove('active');
      if (menuToggleOrde12) menuToggleOrde12.classList.remove('active');
      showToast('Sungai Orde 1-2 Disembunyikan', 'Jaringan sungai utama sementara disembunyikan.');
    }
  }

  if (btnToggleRivers) btnToggleRivers.addEventListener('click', toggleOrde12Visibility);
  if (menuToggleOrde12) menuToggleOrde12.addEventListener('click', toggleOrde12Visibility);

  // 3. River Dropdown Menu
  const btnToggleRiverMenu = document.getElementById('btnToggleRiverMenu');
  const riverDropdown = document.getElementById('riverDropdown');
  if (btnToggleRiverMenu && riverDropdown) {
    btnToggleRiverMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      riverDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!riverDropdown.contains(e.target) && e.target !== btnToggleRiverMenu) {
        riverDropdown.classList.add('hidden');
      }
    });
  }

  document.querySelectorAll('.river-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const wsSlug = btn.getAttribute('data-ws');
      loadFullBasinDetail(wsSlug);
      if (riverDropdown) riverDropdown.classList.add('hidden');
    });
  });

  // START APPLICATION
  initMap();
  loadDiData();
});

