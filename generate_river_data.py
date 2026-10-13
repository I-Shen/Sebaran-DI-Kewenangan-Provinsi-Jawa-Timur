import os
import struct
import json

base_dir = r"C:\Users\REALxShiron\Downloads\SHP Sungai-20261013T052243Z-1-001\SHP Sungai"
out_dir = r"d:\Antigravity Google AI\Project\Buat Testing atau Tanya Random\Sebaran DI Kewenangan Provinsi Jawa Timur\data\sungai"
os.makedirs(out_dir, exist_ok=True)

WS_CONFIG = {
    "SUNGAI-BRANTAS-20260812": {
        "slug": "brantas",
        "name": "WS Brantas",
        "casing": "#f59e0b",       # Amber Gold
        "core": "#1e40af",         # Deep River Blue
        "badgeBg": "#f59e0b",
        "badgeText": "#451a03",
        "desc": "Malang, Blitar, Tulungagung, Kediri, Jombang, Mojokerto, Surabaya, Sidoarjo"
    },
    "SUNGAI-BENGAWAN SOLO-20260812": {
        "slug": "bengawan_solo",
        "name": "WS Bengawan Solo",
        "casing": "#10b981",       # Emerald Green
        "core": "#1e40af",
        "badgeBg": "#10b981",
        "badgeText": "#022c22",
        "desc": "Ngawi, Madiun, Magetan, Ponorogo, Bojonegoro, Tuban, Lamongan, Gresik"
    },
    "SUNGAI-BONDOYUDO BARU-20260812": {
        "slug": "bondoyudo_baru",
        "name": "WS Bondoyudo Baru",
        "casing": "#ec4899",       # Vivid Rose / Magenta
        "core": "#1e40af",
        "badgeBg": "#ec4899",
        "badgeText": "#500724",
        "desc": "Lumajang, Jember"
    },
    "SUNGAI-WELANG PEKALEN-20260812": {
        "slug": "welang_pekalen",
        "name": "WS Welang Pekalen",
        "casing": "#8b5cf6",       # Electric Violet
        "core": "#1e40af",
        "badgeBg": "#8b5cf6",
        "badgeText": "#2e1065",
        "desc": "Pasuruan, Probolinggo"
    },
    "SUNGAI-SAMPEAN SETAIL-20260812": {
        "slug": "sampean_setail",
        "name": "WS Sampean Setail",
        "casing": "#f97316",       # Sunset Orange
        "core": "#1e40af",
        "badgeBg": "#f97316",
        "badgeText": "#431407",
        "desc": "Bondowoso, Situbondo, Banyuwangi"
    },
    "SUNGAI-KEPULAUAN MADURA-20260812": {
        "slug": "madura",
        "name": "WS Kepulauan Madura",
        "casing": "#00e5ff",       # Vibrant Cyan
        "core": "#1e40af",
        "badgeBg": "#00e5ff",
        "badgeText": "#082f49",
        "desc": "Bangkalan, Sampang, Pamekasan, Sumenep dan Kepulauan"
    }
}

def rdp_simplify(pts, epsilon=0.00015):
    if len(pts) <= 2:
        return pts
    x1, y1 = pts[0]
    x2, y2 = pts[-1]
    dx = x2 - x1
    dy = y2 - y1
    dist_sq = dx * dx + dy * dy
    max_d = 0.0
    index = 0
    if dist_sq > 0:
        for i in range(1, len(pts) - 1):
            px, py = pts[i]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / (dist_sq ** 0.5)
            if d > max_d:
                max_d = d
                index = i
    if max_d > epsilon:
        left = rdp_simplify(pts[:index + 1], epsilon)
        right = rdp_simplify(pts[index:], epsilon)
        return left[:-1] + right
    else:
        return [pts[0], pts[-1]]

index_data = []

for folder_name, cfg in WS_CONFIG.items():
    slug = cfg["slug"]
    folder_path = os.path.join(base_dir, folder_name)
    shp_path = os.path.join(folder_path, "river.shp")
    dbf_path = os.path.join(folder_path, "river.dbf")
    
    records = []
    with open(dbf_path, 'rb') as f:
        f.seek(4)
        num_records, header_len, record_len = struct.unpack('<IHH', f.read(8))
        f.seek(32)
        fields = []
        while True:
            b = f.read(1)
            if not b or b == b'\r':
                break
            fd = b + f.read(31)
            name = fd[:11].split(b'\x00')[0].decode('ascii', errors='ignore').strip()
            fields.append((name, chr(fd[11]), fd[16]))
        
        f.seek(header_len)
        for _ in range(num_records):
            f.read(1)
            rec = {}
            for fn, ft, fl in fields:
                raw = f.read(fl).decode('utf-8', errors='replace').strip()
                if fn in ('Panjang_km', 'Panjang_m'):
                    try:
                        rec[fn] = round(float(raw), 2)
                    except ValueError:
                        rec[fn] = raw
                elif fn == 'Orde':
                    try:
                        rec[fn] = int(raw)
                    except ValueError:
                        rec[fn] = raw
                elif fn in ('Sungai', 'WS', 'DAS', 'Kabupaten', 'Induk', 'Nomenklatr', 'keterangan'):
                    rec[fn] = raw
            records.append(rec)

    features = []
    tot_len_km = 0.0
    with open(shp_path, 'rb') as f:
        f.seek(100)
        rec_idx = 0
        while rec_idx < len(records):
            head = f.read(8)
            if len(head) < 8:
                break
            _, clen = struct.unpack('>II', head)
            content = f.read(clen * 2)
            if len(content) < 4:
                break
            stype, = struct.unpack('<I', content[:4])
            if stype == 3:
                num_parts, num_points = struct.unpack('<II', content[36:44])
                parts = struct.unpack(f'<{num_parts}I', content[44:44 + num_parts * 4])
                offset = 44 + num_parts * 4
                raw_pts = struct.unpack(f'<{num_points * 2}d', content[offset:offset + num_points * 16])
                parts_list = list(parts) + [num_points]
                
                lines_simplified = []
                for p in range(num_parts):
                    s = parts_list[p]
                    e = parts_list[p + 1]
                    raw_line = [[round(raw_pts[i * 2], 5), round(raw_pts[i * 2 + 1], 5)] for i in range(s, e)]
                    if len(raw_line) > 2:
                        s_line = rdp_simplify(raw_line, epsilon=0.00015)
                    else:
                        s_line = raw_line
                    if s_line:
                        lines_simplified.append(s_line)
                
                coords = lines_simplified[0] if len(lines_simplified) == 1 else lines_simplified
                gtype = "LineString" if len(lines_simplified) == 1 else "MultiLineString"
                
                p_km = records[rec_idx].get('Panjang_km', 0)
                if isinstance(p_km, (int, float)):
                    tot_len_km += p_km
                    
                features.append({
                    "type": "Feature",
                    "geometry": { "type": gtype, "coordinates": coords },
                    "properties": {
                        **records[rec_idx],
                        "ws_slug": slug,
                        "ws_name": cfg["name"],
                        "casing_color": cfg["casing"],
                        "core_color": cfg["core"]
                    }
                })
            rec_idx += 1

    geojson_obj = { "type": "FeatureCollection", "features": features }
    
    # Save .json
    json_path = os.path.join(out_dir, f"{slug}.json")
    with open(json_path, 'w', encoding='utf-8') as jf:
        json.dump(geojson_obj, jf, separators=(',', ':'))
        
    # Save .js fallback
    js_path = os.path.join(out_dir, f"{slug}.js")
    with open(js_path, 'w', encoding='utf-8') as jsf:
        jsf.write(f"window.RIVER_CACHE = window.RIVER_CACHE || {{}};\n")
        jsf.write(f"window.RIVER_CACHE['{slug}'] = ")
        json.dump(geojson_obj, jsf, separators=(',', ':'))
        jsf.write(";\n")

    index_data.append({
        "slug": slug,
        "name": cfg["name"],
        "casing": cfg["casing"],
        "core": cfg["core"],
        "badgeBg": cfg["badgeBg"],
        "badgeText": cfg["badgeText"],
        "desc": cfg["desc"],
        "count": len(features),
        "total_km": round(tot_len_km, 1),
        "json_size_kb": round(os.path.getsize(json_path) / 1024, 1)
    })
    print(f"Done {cfg['name']}: {len(features)} segmen, {round(tot_len_km, 1)} km, {round(os.path.getsize(json_path) / 1024, 1)} KB")

# Save index
with open(os.path.join(out_dir, "index.json"), 'w', encoding='utf-8') as f:
    json.dump(index_data, f, indent=2)

with open(os.path.join(out_dir, "index.js"), 'w', encoding='utf-8') as f:
    f.write("window.RIVER_INDEX_DATA = ")
    json.dump(index_data, f, indent=2)
    f.write(";\n")

print("All Wilayah Sungai data and index generated successfully!")
