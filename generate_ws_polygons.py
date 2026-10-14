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

def clean_poly(geom):
    geom = shapely.make_valid(geom)
    if geom.geom_type == 'Polygon':
        return geom.buffer(0)
    elif geom.geom_type == 'MultiPolygon':
        largest = max(geom.geoms, key=lambda g: g.area)
        return largest.buffer(0)
    elif geom.geom_type == 'GeometryCollection':
        polys = [g for g in geom.geoms if g.geom_type in ('Polygon', 'MultiPolygon')]
        if not polys: return sg.Polygon()
        u = unary_union(polys)
        return clean_poly(u)
    return sg.Polygon()

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

    multi_pt = sg.MultiPoint(all_points)
    hull = shapely.concave_hull(multi_pt, ratio=ws["ratio"], allow_holes=False)
    poly = hull.buffer(0.015).simplify(0.003)
    poly = clean_poly(poly)
    raw_polygons[slug] = poly
    stats[slug] = {
        "count": len(data['features']),
        "km": round(tot_len, 1)
    }

# Pairwise Voronoi cut between neighboring centroids
slugs = [w["slug"] for w in ws_configs]
for i in range(len(slugs)):
    for j in range(i + 1, len(slugs)):
        s1, s2 = slugs[i], slugs[j]
        p1, p2 = raw_polygons[s1], raw_polygons[s2]
        if p1.intersects(p2):
            inter = p1.intersection(p2)
            if inter.area > 1e-7:
                c1, c2 = p1.centroid, p2.centroid
                vor = shapely.voronoi_polygons(sg.MultiPoint([c1, c2]), extend_to=p1.union(p2))
                half1 = vor.geoms[0] if vor.geoms[0].contains(c1) else vor.geoms[1]
                half2 = vor.geoms[1] if half1 == vor.geoms[0] else vor.geoms[0]

                raw_polygons[s1] = clean_poly(p1.difference(inter).union(inter.intersection(half1)))
                raw_polygons[s2] = clean_poly(p2.difference(inter).union(inter.intersection(half2)))

# Enforce strict zero overlap via difference
for i in range(len(slugs)):
    for j in range(i + 1, len(slugs)):
        s1, s2 = slugs[i], slugs[j]
        p1, p2 = raw_polygons[s1], raw_polygons[s2]
        if p1.intersects(p2):
            inter = p1.intersection(p2)
            if inter.area > 1e-9:
                raw_polygons[s2] = clean_poly(p2.difference(p1))

# Final validation & guarantee single valid polygon without self-intersection
final_polygons = {}
for slug in slugs:
    p = clean_poly(raw_polygons[slug])
    # Ensure it is a valid Polygon
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

    # Use higher precision to avoid self-intersection on rounding, or clean rounded poly
    coords = [[round(x, 5), round(y, 5)] for x, y in poly.exterior.coords]
    # Check if rounded coordinates form a valid polygon
    test_p = sg.Polygon(coords)
    if not test_p.is_valid:
        test_p = test_p.buffer(0)
        coords = [[round(x, 5), round(y, 5)] for x, y in test_p.exterior.coords]

    poly_coords = [coords]

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
            "total_rivers": stats[slug]["count"],
            "total_km": stats[slug]["km"],
            "bounds": [round(b, 5) for b in poly.bounds]
        }
    }
    features.append(feature)
    print(f"WS {ws['name']}: {len(coords)} vertices, valid: {sg.Polygon(coords).is_valid}")

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
