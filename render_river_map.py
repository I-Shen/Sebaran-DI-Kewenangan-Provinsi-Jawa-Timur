import os, glob, json
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

# Paths
river_dir = r"d:\Antigravity Google AI\Project\Buat Testing atau Tanya Random\Sebaran DI Kewenangan Provinsi Jawa Timur\data\sungai"
major_files = glob.glob(os.path.join(river_dir, "*_major.json"))
output_img = r"C:\Users\REALxShiron\.gemini\antigravity-ide\brain\a07db7e2-3b16-4a26-848c-ad2e635b9ac2\peta_vektor_sungai_utama_jatim.png"

fig, ax = plt.subplots(figsize=(16, 9), dpi=300)
fig.patch.set_facecolor('#0f172a')  # Dark sleek background
ax.set_facecolor('#090d16')

# Title & Subtitle
plt.suptitle("PETA JARINGAN SUNGAI UTAMA PROVINSI JAWA TIMUR", 
             fontsize=18, fontweight='bold', color='#f8fafc', y=0.96, fontfamily='sans-serif')
ax.set_title("Ekstraksi Spasial Vektor Sungai Utama (Orde 1 & 2) — Dinas PU Sumber Daya Air Prov. Jawa Timur", 
             fontsize=11, color='#94a3b8', pad=12, fontfamily='sans-serif')

ws_palette = {
    'brantas': {'casing': '#f59e0b', 'label': 'WS Brantas (Kali Brantas & Cabang Utama)'},
    'bengawan_solo': {'casing': '#10b981', 'label': 'WS Bengawan Solo (Bengawan Solo & Madiun)'},
    'bondoyudo_baru': {'casing': '#ec4899', 'label': 'WS Bondoyudo Baru (Bondoyudo, Bedadung, Mayang)'},
    'welang_pekalen': {'casing': '#8b5cf6', 'label': 'WS Welang Pekalen (Welang, Rejoso, Pekalen)'},
    'sampean_setail': {'casing': '#f97316', 'label': 'WS Sampean Setail (Sampean, Setail, Banyuputih)'},
    'madura': {'casing': '#00e5ff', 'label': 'WS Kepulauan Madura (Kemuning, Blega, Saroka)'}
}

total_major_segments = 0

# Step 1: Draw Dual-Stroke Casing
for mf in major_files:
    slug = os.path.basename(mf).replace('_major.json', '')
    cfg = ws_palette.get(slug, {'casing': '#0284c7', 'label': slug})
    
    with open(mf, 'r', encoding='utf-8') as f:
        data = json.load(f)
        for feat in data.get('features', []):
            total_major_segments += 1
            geom = feat.get('geometry', {})
            coords = geom.get('coordinates', [])
            gtype = geom.get('type')
            
            lines = []
            if gtype == 'LineString':
                lines = [coords]
            elif gtype == 'MultiLineString':
                lines = coords
                
            for line in lines:
                if len(line) >= 2:
                    xs = [pt[0] for pt in line]
                    ys = [pt[1] for pt in line]
                    # Draw Outer Casing first
                    ax.plot(xs, ys, color=cfg['casing'], linewidth=2.8, alpha=0.75, zorder=2)

# Step 2: Draw Deep Blue Core on top
for mf in major_files:
    with open(mf, 'r', encoding='utf-8') as f:
        data = json.load(f)
        for feat in data.get('features', []):
            geom = feat.get('geometry', {})
            coords = geom.get('coordinates', [])
            gtype = geom.get('type')
            
            lines = []
            if gtype == 'LineString':
                lines = [coords]
            elif gtype == 'MultiLineString':
                lines = coords
                
            for line in lines:
                if len(line) >= 2:
                    xs = [pt[0] for pt in line]
                    ys = [pt[1] for pt in line]
                    # Draw Deep Dark Blue Core (#1e40af / #1d4ed8)
                    ax.plot(xs, ys, color='#1d4ed8', linewidth=1.5, alpha=0.95, zorder=3)

# Formatting axes
ax.set_xlim(111.0, 116.0)
ax.set_ylim(-9.0, -6.6)
ax.set_xlabel("Bujur Timur (Longitude °E)", color='#94a3b8', fontsize=10, labelpad=8)
ax.set_ylabel("Lintang Selatan (Latitude °S)", color='#94a3b8', fontsize=10, labelpad=8)

# Grid styling
ax.grid(color='#334155', linestyle='--', linewidth=0.5, alpha=0.5, zorder=1)
ax.tick_params(colors='#94a3b8', labelsize=9)
for spine in ax.spines.values():
    spine.set_color('#334155')

# Annotations of key geographic landmarks
landmarks = [
    (112.75, -7.25, "Surabaya (Muara Brantas)"),
    (112.63, -7.98, "Malang (Hulu Brantas)"),
    (111.45, -7.42, "Ngawi (Pertemuan Solo & Madiun)"),
    (113.70, -8.17, "Jember (DAS Bedadung/Mayang)"),
    (113.22, -8.13, "Lumajang (DAS Bondoyudo)"),
    (114.37, -8.22, "Banyuwangi (Selat Bali)"),
    (113.25, -7.05, "Bangkalan / Sampang (Madura)")
]

for lon, lat, name in landmarks:
    ax.scatter(lon, lat, color='#f8fafc', s=24, edgecolors='#0284c7', linewidth=1.5, zorder=4)
    ax.text(lon + 0.08, lat + 0.04, name, color='#cbd5e1', fontsize=8, fontweight='bold', zorder=5)

# Custom Legend
legend_patches = []
# River Core Legend
legend_patches.append(mpatches.Patch(color='#1d4ed8', label='Inti Sungai Utama (Deep Dark Blue #1e40af)'))
for slug, info in ws_palette.items():
    legend_patches.append(mpatches.Patch(color=info['casing'], label=f"Casing WS: {info['label']}"))

leg = ax.legend(handles=legend_patches, loc='lower left', facecolor='#0f172a', edgecolor='#334155', 
          fontsize=8.5, labelcolor='#e2e8f0', framealpha=0.9, title="Legenda Kartografi Sungai:")
leg.get_title().set_color('#38bdf8')
leg.get_title().set_fontweight('bold')

# Watermark / Info Box in upper right
info_text = (
    f"Total Segmen Sungai Utama: {total_major_segments:,}\n"
    "Cakupan: 6 Wilayah Sungai (WS)\n"
    "Proyeksi: WGS 84 (EPSG:4326)\n"
    "Standar: Kartografi Garis Ganda (Dual-Stroke)"
)
ax.text(0.98, 0.96, info_text, transform=ax.transAxes, fontsize=8.5,
        verticalalignment='top', horizontalalignment='right',
        bbox=dict(boxstyle='round,pad=0.6', facecolor='#0f172a', edgecolor='#334155', alpha=0.9),
        color='#94a3b8', fontfamily='monospace')

plt.tight_layout()
plt.savefig(output_img, facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
plt.close()
print(f"Vector map generated successfully at: {output_img}")
