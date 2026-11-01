# -*- coding: utf-8 -*-
"""
Script Generator Data Dummy Poligon Aset Tanah (Sempadan & Aset Milik Pemerintah)
Untuk Keperluan Stress Test WebGIS Sebaran DI Kewenangan Provinsi Jawa Timur.

Memuat 18 Kategori Resmi:
1. SUNGAI
2. BEKAS SUNGAI
3. BENDUNGAN
4. BENDUNG
5. EMBUNG
6. BEKAS EMBUNG
7. WADUK
8. BEKAS WADUK
9. SALURAN PRIMER
10. BEKAS SALURAN PRIMER
11. SALURAN SEKUNDER
12. BEKAS SALURAN SEKUNDER
13. SALURAN PEMBUANG/AVFOUR
14. BEKAS SALURAN PEMBUANG/AVFOUR
15. SALURAN TERSIER/KUARTER
16. BEKAS SALURAN TERSIER/KUARTER
17. NON JARINGAN IRIGASI/SUNGAI
18. MATA AIR
"""

import json
import math
import random
import os

random.seed(42)  # Deterministic seed for reproducible stress-test data

# 1. Load Real Anchor Points from di_jatim.json and sungai_orde1.json
with open('data/di_jatim.json', 'r', encoding='utf-8') as f:
    di_list = json.load(f)

with open('data/sungai/sungai_orde1.json', 'r', encoding='utf-8') as f:
    rivers_fc = json.load(f)

# Extract real river segments
river_segments = []
for feat in rivers_fc.get('features', []):
    geom = feat.get('geometry', {})
    props = feat.get('properties', {})
    g_type = geom.get('type')
    coords = geom.get('coordinates', [])
    if g_type == 'LineString' and len(coords) >= 4:
        river_segments.append((coords, props))
    elif g_type == 'MultiLineString':
        for line in coords:
            if len(line) >= 4:
                river_segments.append((line, props))

print(f"Loaded {len(di_list)} DIs and {len(river_segments)} river lines as anchors.")

CATEGORIES = [
    "SUNGAI",
    "BEKAS SUNGAI",
    "BENDUNGAN",
    "BENDUNG",
    "EMBUNG",
    "BEKAS EMBUNG",
    "WADUK",
    "BEKAS WADUK",
    "SALURAN PRIMER",
    "BEKAS SALURAN PRIMER",
    "SALURAN SEKUNDER",
    "BEKAS SALURAN SEKUNDER",
    "SALURAN PEMBUANG/AVFOUR",
    "BEKAS SALURAN PEMBUANG/AVFOUR",
    "SALURAN TERSIER/KUARTER",
    "BEKAS SALURAN TERSIER/KUARTER",
    "NON JARINGAN IRIGASI/SUNGAI",
    "MATA AIR"
]

# Color & Style Palette for each category
CATEGORY_STYLES = {
    "SUNGAI": {"fillColor": "#0284c7", "color": "#0369a1", "dashArray": None},
    "BEKAS SUNGAI": {"fillColor": "#78716c", "color": "#57534e", "dashArray": "5, 5"},
    "BENDUNGAN": {"fillColor": "#4338ca", "color": "#312e81", "dashArray": None},
    "BENDUNG": {"fillColor": "#6366f1", "color": "#4f46e5", "dashArray": None},
    "EMBUNG": {"fillColor": "#06b6d4", "color": "#0891b2", "dashArray": None},
    "BEKAS EMBUNG": {"fillColor": "#a8a29e", "color": "#78716c", "dashArray": "5, 5"},
    "WADUK": {"fillColor": "#2563eb", "color": "#1d4ed8", "dashArray": None},
    "BEKAS WADUK": {"fillColor": "#94a3b8", "color": "#64748b", "dashArray": "5, 5"},
    "SALURAN PRIMER": {"fillColor": "#059669", "color": "#047857", "dashArray": None},
    "BEKAS SALURAN PRIMER": {"fillColor": "#b45309", "color": "#92400e", "dashArray": "5, 5"},
    "SALURAN SEKUNDER": {"fillColor": "#10b981", "color": "#059669", "dashArray": None},
    "BEKAS SALURAN SEKUNDER": {"fillColor": "#d97706", "color": "#b45309", "dashArray": "5, 5"},
    "SALURAN PEMBUANG/AVFOUR": {"fillColor": "#e11d48", "color": "#be123c", "dashArray": None},
    "BEKAS SALURAN PEMBUANG/AVFOUR": {"fillColor": "#f43f5e", "color": "#9f1239", "dashArray": "5, 5"},
    "SALURAN TERSIER/KUARTER": {"fillColor": "#14b8a6", "color": "#0f766e", "dashArray": None},
    "BEKAS SALURAN TERSIER/KUARTER": {"fillColor": "#ea580c", "color": "#c2410c", "dashArray": "5, 5"},
    "NON JARINGAN IRIGASI/SUNGAI": {"fillColor": "#8b5cf6", "color": "#7c3aed", "dashArray": None},
    "MATA AIR": {"fillColor": "#0d9488", "color": "#115e59", "dashArray": None}
}

REAL_DAMS = [
    {"nama": "Bendungan Sutami (Karangkates)", "lat": -8.163333, "lon": 112.449722, "kab": "Malang", "upt": "Korwil Malang"},
    {"nama": "Bendungan Selorejo", "lat": -7.868889, "lon": 112.355278, "kab": "Malang", "upt": "Korwil Malang"},
    {"nama": "Bendungan Wonorejo", "lat": -7.986944, "lon": 111.838889, "kab": "Tulungagung", "upt": "UPT Kediri"},
    {"nama": "Bendungan Bening Widas", "lat": -7.534722, "lon": 111.794444, "kab": "Madiun", "upt": "Korwil Madiun"},
    {"nama": "Bendungan Semantok", "lat": -7.534167, "lon": 111.905833, "kab": "Nganjuk", "upt": "UPT Kediri"},
    {"nama": "Bendungan Bajulmati", "lat": -7.940556, "lon": 114.380556, "kab": "Banyuwangi", "upt": "UPT Bondowoso"},
    {"nama": "Bendungan Gongseng", "lat": -7.276389, "lon": 111.802778, "kab": "Bojonegoro", "upt": "UPT Bojonegoro"},
    {"nama": "Bendungan Pacal", "lat": -7.363889, "lon": 111.875000, "kab": "Bojonegoro", "upt": "UPT Bojonegoro"},
    {"nama": "Bendungan Nipah", "lat": -7.037500, "lon": 113.190833, "kab": "Sampang", "upt": "UPT Madura"},
    {"nama": "Bendungan Tukul", "lat": -8.086389, "lon": 111.206667, "kab": "Pacitan", "upt": "Korwil Madiun"},
    {"nama": "Bendungan Bendo", "lat": -7.941667, "lon": 111.569444, "kab": "Ponorogo", "upt": "Korwil Madiun"},
    {"nama": "Bendung Gerak Bojonegoro", "lat": -7.143611, "lon": 111.849722, "kab": "Bojonegoro", "upt": "UPT Bojonegoro"},
    {"nama": "Bendung Lengkong Baru", "lat": -7.472222, "lon": 112.463889, "kab": "Mojokerto", "upt": "Perwakilan Mojokerto"},
    {"nama": "Bendung Gerak Karangnongko", "lat": -7.170278, "lon": 111.583333, "kab": "Bojonegoro", "upt": "UPT Bojonegoro"},
    {"nama": "Bendung Sampean Baru", "lat": -7.838889, "lon": 113.916667, "kab": "Bondowoso", "upt": "UPT Bondowoso"},
    {"nama": "Bendung Lodoyo", "lat": -8.188889, "lon": 112.222222, "kab": "Blitar", "upt": "UPT Kediri"},
    {"nama": "Bendung Tiudan", "lat": -8.033333, "lon": 111.850000, "kab": "Tulungagung", "upt": "UPT Kediri"},
    {"nama": "Bendung Mrican", "lat": -7.783333, "lon": 112.016667, "kab": "Kediri", "upt": "UPT Kediri"},
    {"nama": "Bendung Siman", "lat": -7.866667, "lon": 112.283333, "kab": "Kediri", "upt": "UPT Kediri"},
    {"nama": "Bendung Klampis", "lat": -7.050000, "lon": 113.250000, "kab": "Sampang", "upt": "UPT Madura"}
]

REAL_SPRINGS = [
    {"nama": "Mata Air Wendit", "lat": -7.955556, "lon": 112.684167, "kab": "Malang", "upt": "Korwil Malang"},
    {"nama": "Mata Air Banyubiru", "lat": -7.711111, "lon": 112.875000, "kab": "Pasuruan", "upt": "UPT Pasuruan"},
    {"nama": "Mata Air Umbul Jolotundo", "lat": -7.608333, "lon": 112.591667, "kab": "Mojokerto", "upt": "Perwakilan Mojokerto"},
    {"nama": "Mata Air Kakek Bodo", "lat": -7.697222, "lon": 112.631944, "kab": "Pasuruan", "upt": "UPT Pasuruan"},
    {"nama": "Mata Air Sumber Maron", "lat": -8.175000, "lon": 112.583333, "kab": "Malang", "upt": "Korwil Malang"},
    {"nama": "Mata Air Songgoriti", "lat": -7.861111, "lon": 112.488889, "kab": "Batu", "upt": "Korwil Malang"},
    {"nama": "Mata Air Sumber Ubalan", "lat": -7.950000, "lon": 112.133333, "kab": "Kediri", "upt": "UPT Kediri"},
    {"nama": "Mata Air Sendang Made", "lat": -7.383333, "lon": 112.233333, "kab": "Jombang", "upt": "Perwakilan Mojokerto"},
    {"nama": "Mata Air Umbul Ponggok", "lat": -7.683333, "lon": 112.750000, "kab": "Pasuruan", "upt": "UPT Pasuruan"},
    {"nama": "Mata Air Sumber Nira", "lat": -8.183333, "lon": 112.716667, "kab": "Malang", "upt": "Korwil Malang"},
    {"nama": "Mata Air Sumber Jenon", "lat": -8.066667, "lon": 112.750000, "kab": "Malang", "upt": "Korwil Malang"},
    {"nama": "Mata Air Sumber Sirah", "lat": -8.141667, "lon": 112.608333, "kab": "Malang", "upt": "Korwil Malang"}
]

def geodesic_area_perimeter(coords):
    """Calculate approximate area in m2 and perimeter in meters for small geographic polygons."""
    if len(coords) < 3:
        return 0.0, 0.0
    # Center lat for projection
    lat0 = sum(c[1] for c in coords) / len(coords)
    cos_lat = math.cos(math.radians(lat0))
    m_per_deg_lat = 111132.954
    m_per_deg_lon = 111412.84 * cos_lat

    # Convert to meters relative to first point
    p0 = coords[0]
    pts = [((c[0] - p0[0]) * m_per_deg_lon, (c[1] - p0[1]) * m_per_deg_lat) for c in coords]

    # Shoelace formula for area
    area = 0.0
    perim = 0.0
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
        dx = pts[j][0] - pts[i][0]
        dy = pts[j][1] - pts[i][1]
        perim += math.hypot(dx, dy)
    return abs(area) * 0.5, perim

def make_ribbon_polygon(centerline_points, width_m=15.0):
    """Generate a corridor/ribbon polygon buffered along a polyline."""
    if len(centerline_points) < 2:
        return None
    lat0 = centerline_points[0][1]
    cos_lat = math.cos(math.radians(lat0))
    deg_per_m_lat = 1.0 / 111132.954
    deg_per_m_lon = 1.0 / (111412.84 * cos_lat)

    half_w = width_m / 2.0
    left_side = []
    right_side = []

    for i in range(len(centerline_points)):
        p = centerline_points[i]
        if i == 0:
            p_next = centerline_points[1]
            dx = (p_next[0] - p[0]) / deg_per_m_lon
            dy = (p_next[1] - p[1]) / deg_per_m_lat
        elif i == len(centerline_points) - 1:
            p_prev = centerline_points[i - 1]
            dx = (p[0] - p_prev[0]) / deg_per_m_lon
            dy = (p[1] - p_prev[1]) / deg_per_m_lat
        else:
            p_prev = centerline_points[i - 1]
            p_next = centerline_points[i + 1]
            dx = (p_next[0] - p_prev[0]) / deg_per_m_lon
            dy = (p_next[1] - p_prev[1]) / deg_per_m_lat

        dist = math.hypot(dx, dy)
        if dist == 0:
            nx, ny = 0, 1
        else:
            # Perpendicular normal (-dy, dx)
            nx = -dy / dist
            ny = dx / dist

        # Add slight organic width variation (+/- 20%)
        w = half_w * random.uniform(0.85, 1.15)
        left_side.append([round(p[0] + nx * w * deg_per_m_lon, 7), round(p[1] + ny * w * deg_per_m_lat, 7)])
        right_side.append([round(p[0] - nx * w * deg_per_m_lon, 7), round(p[1] - ny * w * deg_per_m_lat, 7)])

    # Polygon loop: left forward, right backward, close
    poly = left_side + list(reversed(right_side)) + [left_side[0]]
    return poly

def make_parcel_polygon(center_lon, center_lat, radius_m=40.0, num_vertices=6, irregularity=0.3):
    """Generate a realistic cadastral/parcel land polygon around a center point."""
    cos_lat = math.cos(math.radians(center_lat))
    deg_per_m_lat = 1.0 / 111132.954
    deg_per_m_lon = 1.0 / (111412.84 * cos_lat)

    angle_step = 2 * math.pi / num_vertices
    pts = []
    base_rotation = random.uniform(0, math.pi * 2)

    for i in range(num_vertices):
        angle = base_rotation + i * angle_step + random.uniform(-angle_step * 0.25, angle_step * 0.25)
        r = radius_m * random.uniform(1.0 - irregularity, 1.0 + irregularity)
        x = center_lon + r * math.cos(angle) * deg_per_m_lon
        y = center_lat + r * math.sin(angle) * deg_per_m_lat
        pts.append([round(x, 7), round(y, 7)])

    pts.append(pts[0])  # Close loop
    return pts

print("Building features across 18 categories...")

all_features = []
feature_counter = 1
TARGET_PER_CATEGORY = 100  # 100 polygons per category -> 1800 polygons total for stress testing!

STATUS_OPTIONS = [
    "Sertifikat Hak Pakai Pemprov Jatim",
    "Sertifikat Hak Pengelolaan (HPL) PU SDA",
    "Proses Sertifikasi PTSL BPN",
    "Terdaftar KIB A No. Registrasi Resmi",
    "Tanah Sempadan Bebas Sengketa"
]

KONDISI_OPTIONS = [
    "Tanggul Terawat & Jalan Inspeksi Paving/Aspal",
    "Bantaran Rumput Alami & Pematok Beton BM Terpasang",
    "Papan Peringatan Larangan Mendirikan Bangunan Aktif",
    "Saluran Normalisasi Bersih dari Sedimen",
    "Zona Sabuk Hijau Konservasi Sumber Daya Air",
    "Sebagian Dimanfaatkan Petani untuk Tanaman Semusim (SIPPA)"
]

for cat_idx, category in enumerate(CATEGORIES):
    style_info = CATEGORY_STYLES[category]
    is_bekas = "BEKAS" in category
    
    for item_idx in range(TARGET_PER_CATEGORY):
        f_id = f"AST-{feature_counter:04d}"
        feature_counter += 1
        
        # Pick anchor based on category logic
        coords = None
        upt_val = "UPT Kediri"
        kab_val = "Kediri"
        di_name = "-"
        
        if "SUNGAI" in category:
            # Pick a river segment
            seg_coords, seg_props = random.choice(river_segments)
            # Pick a subslice of 4-8 points
            start_idx = random.randint(0, max(0, len(seg_coords) - 6))
            sub_seg = seg_coords[start_idx:start_idx + random.randint(4, 7)]
            river_name = seg_props.get("Sungai", "Sungai")
            kab_val = seg_props.get("Kabupaten", "Jawa Timur")
            ws_val = seg_props.get("WS", "Brantas")
            upt_val = "UPT Pasuruan" if "Welang" in ws_val else ("UPT Bojonegoro" if "Bengawan" in ws_val else "UPT Kediri")
            
            width = random.uniform(20.0, 45.0) if not is_bekas else random.uniform(15.0, 30.0)
            if is_bekas:
                # Add lateral offset to simulate old oxbow / cut-off river bend
                offset_lon = random.uniform(0.001, 0.004) * (1 if random.random() > 0.5 else -1)
                offset_lat = random.uniform(0.001, 0.004) * (1 if random.random() > 0.5 else -1)
                sub_seg = [[p[0] + offset_lon, p[1] + offset_lat] for p in sub_seg]
                name_val = f"Tanah Bekas Alur Sungai {river_name} (Oxbow Bend #{item_idx+1})"
            else:
                name_val = f"Sempadan Sungai {river_name} Ruas #{item_idx+1}"
            
            coords = make_ribbon_polygon(sub_seg, width_m=width)

        elif "BENDUNGAN" in category or "BENDUNG" in category:
            dam = random.choice(REAL_DAMS)
            lat = dam["lat"] + random.uniform(-0.005, 0.005)
            lon = dam["lon"] + random.uniform(-0.005, 0.005)
            kab_val = dam["kab"]
            upt_val = dam["upt"]
            radius = random.uniform(50.0, 140.0) if "BENDUNGAN" in category else random.uniform(35.0, 75.0)
            coords = make_parcel_polygon(lon, lat, radius_m=radius, num_vertices=random.randint(6, 9))
            name_val = f"Tanah Tapak & Sempadan {dam['nama']} Blok {chr(65 + (item_idx % 8))}-{item_idx+1}"

        elif "WADUK" in category:
            dam = random.choice([d for d in REAL_DAMS if "Waduk" in d["nama"] or "Bendungan" in d["nama"]])
            lat = dam["lat"] + random.uniform(-0.008, 0.008)
            lon = dam["lon"] + random.uniform(-0.008, 0.008)
            kab_val = dam["kab"]
            upt_val = dam["upt"]
            radius = random.uniform(60.0, 160.0)
            coords = make_parcel_polygon(lon, lat, radius_m=radius, num_vertices=random.randint(7, 10))
            if is_bekas:
                name_val = f"Lahan Eks-Genangan Pasang Surut {dam['nama']} #{item_idx+1}"
            else:
                name_val = f"Sempadan Sabuk Hijau {dam['nama']} Zona {item_idx+1}"

        elif "EMBUNG" in category:
            # Placed in dry areas (Bojonegoro, Madura, Lamongan)
            di_target = random.choice([d for d in di_list if any(k in d['upt'] for k in ['Bojonegoro', 'Madura', 'Bondowoso', 'Pasuruan'])])
            lat = di_target['lat'] + random.uniform(-0.02, 0.02)
            lon = di_target['lon'] + random.uniform(-0.02, 0.02)
            kab_val = di_target.get('kabupaten', di_target['upt'].replace('UPT ', ''))
            upt_val = di_target['upt']
            di_name = di_target['nama_di']
            radius = random.uniform(25.0, 60.0)
            coords = make_parcel_polygon(lon, lat, radius_m=radius, num_vertices=random.randint(5, 8))
            if is_bekas:
                name_val = f"Tanah Bekas Embung Konservasi {di_name} Blok #{item_idx+1}"
            else:
                name_val = f"Tanah Sempadan Tampungan Embung {di_name} #{item_idx+1}"

        elif "MATA AIR" in category:
            spring = random.choice(REAL_SPRINGS)
            lat = spring["lat"] + random.uniform(-0.003, 0.003)
            lon = spring["lon"] + random.uniform(-0.003, 0.003)
            kab_val = spring["kab"]
            upt_val = spring["upt"]
            radius = random.uniform(30.0, 70.0)
            coords = make_parcel_polygon(lon, lat, radius_m=radius, num_vertices=8, irregularity=0.15)
            name_val = f"Zona Lindung Sempadan {spring['nama']} Ring #{item_idx+1}"

        elif "NON JARINGAN" in category:
            di_target = random.choice(di_list)
            lat = di_target['lat'] + random.uniform(-0.015, 0.015)
            lon = di_target['lon'] + random.uniform(-0.015, 0.015)
            kab_val = di_target.get('kabupaten', 'Jawa Timur')
            upt_val = di_target['upt']
            di_name = di_target['nama_di']
            radius = random.uniform(25.0, 50.0)
            coords = make_parcel_polygon(lon, lat, radius_m=radius, num_vertices=4, irregularity=0.1) # Rectangular building plot
            name_val = f"Tanah Kantor Juru Pengairan & Rumah Dinas {di_name} #{item_idx+1}"

        else:
            # Saluran Primer, Saluran Sekunder, Saluran Tersier, Saluran Pembuang / Avfour
            di_target = random.choice(di_list)
            lat = di_target['lat'] + random.uniform(-0.01, 0.01)
            lon = di_target['lon'] + random.uniform(-0.01, 0.01)
            kab_val = di_target.get('kabupaten', di_target['upt'].replace('UPT ', '').replace('Korwil ', ''))
            upt_val = di_target['upt']
            di_name = di_target['nama_di']
            
            # Create a 4-5 point curved canal line
            angle = random.uniform(0, math.pi * 2)
            seg_len = random.uniform(0.002, 0.006)
            line = []
            curr_lon, curr_lat = lon, lat
            for pt_idx in range(5):
                line.append([round(curr_lon, 7), round(curr_lat, 7)])
                angle += random.uniform(-0.35, 0.35)
                step_m = random.uniform(80.0, 180.0)
                curr_lon += (step_m / (111412.84 * math.cos(math.radians(curr_lat)))) * math.cos(angle)
                curr_lat += (step_m / 111132.954) * math.sin(angle)
            
            w_m = 18.0 if "PRIMER" in category else (12.0 if "SEKUNDER" in category else (22.0 if "AVFOUR" in category else 8.0))
            if is_bekas:
                name_val = f"Tanah Eks-{category.replace('BEKAS ', '').title()} DI {di_name} Trase #{item_idx+1}"
            else:
                name_val = f"Sempadan {category.title()} DI {di_name} Ruas #{item_idx+1}"
                
            coords = make_ribbon_polygon(line, width_m=w_m)

        # Geometry fallback
        if not coords or len(coords) < 4:
            di_target = random.choice(di_list)
            coords = make_parcel_polygon(di_target['lon'], di_target['lat'], radius_m=40.0)

        area_m2, perim_m = geodesic_area_perimeter(coords)
        area_ha = area_m2 / 10000.0

        kib_code = f"KIB-A.35.{random.randint(10, 99)}.{random.randint(1, 9)}.{random.randint(2018, 2024)}.{item_idx+1:04d}"
        no_sert = f"HP-{random.randint(1000, 9999)}/Pemprov" if random.random() > 0.25 else "Proses Sertifikasi KIB-A"

        feat = {
            "type": "Feature",
            "id": f_id,
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords]
            },
            "properties": {
                "id": f_id,
                "kode_aset": kib_code,
                "kategori": category,
                "nama_aset": name_val,
                "status_tanah": random.choice(STATUS_OPTIONS),
                "no_sertifikat": no_sert,
                "luas_m2": round(area_m2, 1),
                "luas_ha": f"{area_ha:.2f} ha" if area_ha >= 0.1 else f"{area_ha:.3f} ha",
                "perimeter_m": f"{round(perim_m):,} m",
                "upt": upt_val,
                "kabupaten": kab_val,
                "di_name": di_name if di_name != "-" else name_val,
                "kondisi_fisik": random.choice(KONDISI_OPTIONS),
                "tipe": "aset_tanah",
                "is_bekas": is_bekas,
                "fillColor": style_info["fillColor"],
                "color": style_info["color"],
                "dashArray": style_info["dashArray"]
            }
        }
        all_features.append(feat)

print(f"Successfully generated {len(all_features)} polygon features.")

geojson_data = {
    "type": "FeatureCollection",
    "name": "Aset_Tanah_Sempadan_Jatim",
    "crs": {
        "type": "name",
        "properties": {
            "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
    },
    "features": all_features
}

# Save as data/aset_tanah.json
json_path = 'data/aset_tanah.json'
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(geojson_data, f, ensure_ascii=False)
print(f"Saved {json_path} (size: {os.path.getsize(json_path):,} bytes)")

# Save as data/aset_tanah.js
js_path = 'data/aset_tanah.js'
with open(js_path, 'w', encoding='utf-8') as f:
    f.write('window.ASET_TANAH_DATA = ')
    json.dump(geojson_data, f, ensure_ascii=False)
    f.write(';\n')
print(f"Saved {js_path} (size: {os.path.getsize(js_path):,} bytes)")
