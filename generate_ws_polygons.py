import json
import os
import shapely
import shapely.geometry as sg
from shapely.ops import unary_union

sungai_dir = r"data\sungai"

ws_configs = [
    {
        "slug": "bengawan_solo",
        "name": "WS Bengawan Solo",
        "code": "WS-01",
        "casing": "#10b981", # Emerald
        "fill": "#10b981",
        "kabupaten": "Ngawi, Madiun, Magetan, Ponorogo, Bojonegoro, Tuban, Lamongan, Gresik",
        "ratio": 0.22
    },
    {
        "slug": "brantas",
        "name": "WS Brantas",
        "code": "WS-02",
        "casing": "#f59e0b", # Amber Gold
        "fill": "#f59e0b",
        "kabupaten": "Malang, Blitar, Tulungagung, Kediri, Jombang, Mojokerto, Surabaya, Sidoarjo",
        "ratio": 0.22
    },
    {
        "slug": "welang_pekalen",
        "name": "WS Welang Pekalen",
        "code": "WS-03",
        "casing": "#8b5cf6", # Electric Violet
        "fill": "#8b5cf6",
        "kabupaten": "Pasuruan, Probolinggo",
        "ratio": 0.25
    },
    {
        "slug": "bondoyudo_baru",
        "name": "WS Bondoyudo Baru",
        "code": "WS-04",
        "casing": "#ec4899", # Vivid Rose
        "fill": "#ec4899",
        "kabupaten": "Lumajang, Jember",
        "ratio": 0.22
    },
    {
        "slug": "sampean_setail",
        "name": "WS Sampean Setail",
        "code": "WS-05",
        "casing": "#f97316", # Sunset Orange
        "fill": "#f97316",
        "kabupaten": "Bondowoso, Situbondo, Banyuwangi",
        "ratio": 0.25
    },
    {
        "slug": "madura",
        "name": "WS Kepulauan Madura",
        "code": "WS-06",
        "casing": "#00e5ff", # Aqua Cyan
        "fill": "#00e5ff",
        "kabupaten": "Bangkalan, Sampang, Pamekasan, Sumenep dan Kepulauan",
        "ratio": 0.25
    }
]

def clean_geom(geom):
    geom = shapely.make_valid(geom)
    if geom.geom_type == 'Polygon':
        return geom.buffer(0)
    elif geom.geom_type == 'MultiPolygon':
        valid_geoms = [g.buffer(0) for g in geom.geoms if g.area > 1e-5]
        if len(valid_geoms) == 1:
            return valid_geoms[0]
        return sg.MultiPolygon(valid_geoms)
    elif geom.geom_type == 'GeometryCollection':
        polys = []
        for g in geom.geoms:
            if g.geom_type == 'Polygon':
                polys.append(g.buffer(0))
            elif g.geom_type == 'MultiPolygon':
                polys.extend([sub_g.buffer(0) for sub_g in g.geoms if sub_g.area > 1e-5])
        if not polys: return sg.Polygon()
        u = unary_union(polys)
        return clean_geom(u)
    return geom

raw_polygons = {}
stats = {}

for ws in ws_configs:
    slug = ws["slug"]
    fpath = os.path.join(sungai_dir, f"{slug}.json")
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    all_points = []
    tot_len = 0.0
    for feat in data['features']:
        p = feat['properties']
        tot_len += float(p.get('Panjang_km', 0) or 0)
        coords = feat['geometry']['coordinates']
        gtype = feat['geometry']['type']

        if slug == "sampean_setail":
            if gtype == 'LineString' and any(pt[0] < 113.5 for pt in coords): continue
            if gtype == 'MultiLineString' and any(any(pt[0] < 113.5 for pt in line) for line in coords): continue

        if gtype == 'LineString':
            all_points.extend(coords)
        elif gtype == 'MultiLineString':
            for line in coords:
                all_points.extend(line)

    if slug == "madura":
        # OPSI 1: MultiPolygon Kepulauan Tanpa Jembatan Laut
        groups = {
            'mainland': [p for p in all_points if p[1] <= -6.2 and p[0] < 114.20],
            'bawean': [p for p in all_points if p[1] > -6.2],
            'kangean': [p for p in all_points if p[0] > 115.0],
            'sapudi_raas': [p for p in all_points if 114.20 <= p[0] <= 115.0 and p[1] <= -6.8]
        }
        polys = []
        for gname, gpts in groups.items():
            if not gpts: continue
            mp = sg.MultiPoint(gpts)
            ratio = 0.25 if gname == 'mainland' else 0.4
            hull = shapely.concave_hull(mp, ratio=ratio, allow_holes=False)
            poly = hull.buffer(0.012).simplify(0.003)
            polys.append(poly)
        u = unary_union(polys)
        raw_polygons[slug] = clean_geom(u)
    else:
        multi_pt = sg.MultiPoint(all_points)
        hull = shapely.concave_hull(multi_pt, ratio=ws["ratio"], allow_holes=False)
        poly = hull.buffer(0.012).simplify(0.003)
        raw_polygons[slug] = clean_geom(poly)

    stats[slug] = {
        "count": len(data['features']),
        "km": round(tot_len, 1)
    }

# Enforce strict zero overlap via natural boundary difference (No Voronoi knife cuts)
slugs = [w["slug"] for w in ws_configs]
for i in range(len(slugs)):
    for j in range(i + 1, len(slugs)):
        s1, s2 = slugs[i], slugs[j]
        p1, p2 = raw_polygons[s1], raw_polygons[s2]
        if p1.intersects(p2):
            inter = p1.intersection(p2)
            if inter.area > 1e-9:
                raw_polygons[s2] = clean_geom(p2.difference(p1))

# Final validation & guarantee valid polygon / multipolygon without self-intersection
final_polygons = {}
for slug in slugs:
    p = clean_geom(raw_polygons[slug])
    if not p.is_valid:
        p = shapely.make_valid(p).buffer(0)
    final_polygons[slug] = p
    print(f"Slug: {slug:15s} | Valid: {p.is_valid} | Type: {p.geom_type} | Area: {p.area:.4f}")

# Overlap check
max_overlap = 0.0
for i in range(len(slugs)):
    for j in range(i + 1, len(slugs)):
        inter = final_polygons[slugs[i]].intersection(final_polygons[slugs[j]])
        if inter.area > max_overlap:
            max_overlap = inter.area
        if inter.area > 1e-9:
            print(f"WARNING: Overlap {slugs[i]} & {slugs[j]}: {inter.area:.10f}")

print(f"\nFinal maximum pairwise overlap: {max_overlap:.10f}")

features = []
for ws in ws_configs:
    slug = ws["slug"]
    poly = final_polygons[slug]
    centroid = poly.centroid

    if poly.geom_type == 'Polygon':
        coords = [[[round(x, 5), round(y, 5)] for x, y in poly.exterior.coords]]
        geom_type = "Polygon"
        print(f"WS {ws['name']}: Polygon with {len(coords[0])} vertices")
    elif poly.geom_type == 'MultiPolygon':
        coords = [
            [[[round(x, 5), round(y, 5)] for x, y in part.exterior.coords]]
            for part in poly.geoms
        ]
        geom_type = "MultiPolygon"
        print(f"WS {ws['name']}: MultiPolygon with {len(coords)} island parts")

    feature = {
        "type": "Feature",
        "geometry": {
            "type": geom_type,
            "coordinates": coords
        },
        "properties": {
            "slug": slug,
            "name": ws["name"],
            "code": ws["code"],
            "casing": ws["casing"],
            "fill": ws["fill"],
            "kabupaten": ws["kabupaten"],
            "centroid": [round(centroid.x, 5), round(centroid.y, 5)],
            "total_rivers": stats[slug]["count"],
            "total_km": stats[slug]["km"],
            "bounds": [round(b, 5) for b in poly.bounds]
        }
    }
    features.append(feature)

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

print("Generated batas_ws.json and batas_ws.js successfully!")
