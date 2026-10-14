import json
import os

sungai_dir = r"d:\Antigravity Google AI\Project\Buat Testing atau Tanya Random\Sebaran DI Kewenangan Provinsi Jawa Timur\data\sungai"

slugs = [
    "bengawan_solo",
    "brantas",
    "welang_pekalen",
    "bondoyudo_baru",
    "sampean_setail",
    "madura"
]

all_features = []
stats = {}

for slug in slugs:
    fpath = os.path.join(sungai_dir, f"{slug}.json")
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    ws_feats = []
    for feat in data['features']:
        p = feat.get('properties', {})
        orde = p.get('Orde', 0)
        
        # Keep ONLY Orde 1 and 2
        if orde in (1, 2):
            # Check outlier in sampean_setail
            if slug == "sampean_setail":
                coords = feat['geometry']['coordinates']
                gtype = feat['geometry']['type']
                if gtype == 'LineString' and any(pt[0] < 113.5 for pt in coords):
                    continue
                if gtype == 'MultiLineString' and any(any(pt[0] < 113.5 for pt in line) for line in coords):
                    continue
            ws_feats.append(feat)
            all_features.append(feat)

    stats[slug] = len(ws_feats)
    print(f"WS {slug}: {len(ws_feats)} segmen Orde 1 & 2")

fc = {
    "type": "FeatureCollection",
    "features": all_features
}

out_json = os.path.join(sungai_dir, "sungai_orde1_2.json")
with open(out_json, 'w', encoding='utf-8') as f:
    json.dump(fc, f, separators=(',', ':'))

out_js = os.path.join(sungai_dir, "sungai_orde1_2.js")
with open(out_js, 'w', encoding='utf-8') as f:
    f.write("window.RIVER_ORDE1_2_DATA = ")
    json.dump(fc, f, separators=(',', ':'))
    f.write(";\n")

print(f"\nTotal Orde 1 & 2 features: {len(all_features)}")
print(f"File size: {round(os.path.getsize(out_json) / 1024, 1)} KB")
