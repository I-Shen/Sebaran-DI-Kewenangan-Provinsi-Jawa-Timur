import json
import os
import shapely
import shapely.geometry as sg
from shapely.ops import unary_union

sungai_dir = r"d:\Antigravity Google AI\Project\Buat Testing atau Tanya Random\Sebaran DI Kewenangan Provinsi Jawa Timur\data\sungai"

ws_list = [
    {
        "slug": "bengawan_solo",
        "name": "WS Bengawan Solo",
        "code": "WS-01",
        "casing": "#10b981", # Emerald
        "fill": "#10b981",
        "kabupaten": "Ngawi, Madiun, Magetan, Ponorogo, Bojonegoro, Tuban, Lamongan, Gresik",
        "ratio": 0.12,
        "buffer": 0.035
    },
    {
        "slug": "brantas",
        "name": "WS Brantas",
        "code": "WS-02",
        "casing": "#f59e0b", # Amber Gold
        "fill": "#f59e0b",
        "kabupaten": "Malang, Blitar, Tulungagung, Kediri, Jombang, Mojokerto, Surabaya, Sidoarjo",
        "ratio": 0.12,
        "buffer": 0.035
    },
    {
        "slug": "welang_pekalen",
        "name": "WS Welang Pekalen",
        "code": "WS-03",
        "casing": "#8b5cf6", # Electric Violet
        "fill": "#8b5cf6",
        "kabupaten": "Pasuruan, Probolinggo",
        "ratio": 0.15,
        "buffer": 0.035
    },
    {
        "slug": "bondoyudo_baru",
        "name": "WS Bondoyudo Baru",
        "code": "WS-04",
        "casing": "#ec4899", # Vivid Rose
        "fill": "#ec4899",
        "kabupaten": "Lumajang, Jember",
        "ratio": 0.15,
        "buffer": 0.035
    },
    {
        "slug": "sampean_setail",
        "name": "WS Sampean Setail",
        "code": "WS-05",
        "casing": "#f97316", # Sunset Orange
        "fill": "#f97316",
        "kabupaten": "Bondowoso, Situbondo, Banyuwangi",
        "ratio": 0.15,
        "buffer": 0.035
    },
    {
        "slug": "madura",
        "name": "WS Kepulauan Madura",
        "code": "WS-06",
        "casing": "#00e5ff", # Aqua Cyan
        "fill": "#00e5ff",
        "kabupaten": "Bangkalan, Sampang, Pamekasan, Sumenep dan Kepulauan",
        "ratio": 0.18,
        "buffer": 0.035
    }
]

features = []

for ws in ws_list:
    slug = ws["slug"]
    fpath = os.path.join(sungai_dir, f"{slug}.json")
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    lines = []
    tot_len = 0.0
    for feat in data['features']:
        p = feat['properties']
        tot_len += float(p.get('Panjang_km', 0) or 0)
        coords = feat['geometry']['coordinates']
        gtype = feat['geometry']['type']
        
        # Outlier filter for sampean_setail
        if slug == "sampean_setail":
            if gtype == 'LineString' and any(pt[0] < 113.5 for pt in coords):
                continue
            if gtype == 'MultiLineString' and any(any(pt[0] < 113.5 for pt in line) for line in coords):
                continue

        try:
            geom = sg.shape(feat['geometry'])
            if geom.is_valid:
                lines.append(geom)
            else:
                lines.append(geom.buffer(0))
        except:
            pass

    # Extract all points
    all_points = []
    for line in lines:
        if line.geom_type == 'LineString':
            all_points.extend(line.coords)
        elif line.geom_type == 'MultiLineString':
            for l in line.geoms:
                all_points.extend(l.coords)

    # Generate concave hull of points
    multi_pt = sg.MultiPoint(all_points)
    hull = shapely.concave_hull(multi_pt, ratio=ws["ratio"], allow_holes=False)
    
    # Smooth and buffer slightly
    hull_smooth = hull.buffer(0.015).simplify(0.003)
    if hull_smooth.geom_type == 'MultiPolygon':
        # Keep largest polygon or valid components
        hull_smooth = max(hull_smooth.geoms, key=lambda g: g.area)
        
    centroid = hull_smooth.centroid
    
    # Coordinates in GeoJSON
    poly_coords = [
        [[round(x, 5), round(y, 5)] for x, y in hull_smooth.exterior.coords]
    ]
    
    feature = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": poly_coords
        },
        "properties": {
            "slug": slug,
            "name": ws["name"],
            "code": ws["code"],
            "casing": ws["casing"],
            "fill": ws["fill"],
            "kabupaten": ws["kabupaten"],
            "centroid": [round(centroid.x, 5), round(centroid.y, 5)],
            "total_rivers": len(lines),
            "total_km": round(tot_len, 1),
            "bounds": [round(b, 5) for b in hull_smooth.bounds]
        }
    }
    features.append(feature)
    print(f"Generated WS {ws['name']}: {len(poly_coords[0])} vertices, Centroid: {feature['properties']['centroid']}")

fc = {
    "type": "FeatureCollection",
    "features": features
}

out_json = os.path.join(sungai_dir, "batas_ws.json")
with open(out_json, 'w', encoding='utf-8') as f:
    json.dump(fc, f, indent=2)

out_js = os.path.join(sungai_dir, "batas_ws.js")
with open(out_js, 'w', encoding='utf-8') as f:
    f.write("window.BATAS_WS_DATA = ")
    json.dump(fc, f, indent=2)
    f.write(";\n")

print(f"Saved batas_ws.json and batas_ws.js ({os.path.getsize(out_json)} bytes)")
