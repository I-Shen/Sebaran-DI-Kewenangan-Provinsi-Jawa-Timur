# Sebaran Daerah Irigasi (DI) Kewenangan Pemerintah Provinsi Jawa Timur

Portal WebGIS interaktif berbasis Leaflet untuk memetakan sebaran seluruh **Daerah Irigasi (DI)** kewenangan Pemerintah Provinsi Jawa Timur (luasan 1.000 s.d. 3.000 Ha) berdasarkan pembaruan skema data spasial tahun 2025/2026.

![WebGIS Preview](https://raw.githubusercontent.com/leaflet/Leaflet/main/docs/docs/images/logo.png)

---

## 🌟 Fitur Utama

1. **Pencarian Koordinat Multi-Metode**:
   - **Smart Copy-Paste**: Mendukung input gabungan format Desimal (contoh: `-7.718417, 112.909267`) maupun format Derajat Menit Detik / DMS (contoh: `7°43'6.30"S, 112°54'33.36"E`).
   - **Input Manual (DD)**: Form pengisian terpisah untuk Latitude & Longitude.
   - **Otomatis via GPS**: Ambil koordinat langsung dari perangkat lapangan dengan akurasi GPS tinggi (*High Accuracy Geolocation*).
2. **Sinyal Proksimitas & Radar 5 DI Terdekat**:
   - Saat menitik lokasi (melalui klik peta, koordinat, atau GPS), sistem secara otomatis menghitung jarak ke seluruh DI di Jawa Timur dengan rumus geodesik *Haversine*.
   - Memberikan sinyal visual gelombang radar (*pulsing radar signal*) dan garis koneksi ke **5 DI Terdekat**.
   - Menampilkan kartu peringkat 5 DI terdekat beserta jarak akurat dalam satuan Kilometer (`km`).
3. **Peta Dasar Satelit Resolusi Tinggi (Satellite Hybrid)**:
   - **Esri World Imagery + Clarity & Reference**: Menampilkan citra satelit tajam dengan toponimi lengkap (nama kota, kecamatan, kelurahan/desa, jalan raya, dan jaringan sungai).
   - **Google Satellite Hybrid**: Citra satelit Google Maps dengan label lengkap.
   - **OpenStreetMap** & **CartoDB Dark Matter**.
4. **Katalog & Filter Spasial**:
   - Filter berdasarkan 9 Unit Pelaksana Teknis (UPT) / Koordinator Wilayah (Korwil).
   - Pencarian instan berdasarkan nama Daerah Irigasi.
   - Popup detail berisi nama DI, UPT, koordinat desimal & DMS, jumlah file lapisan, serta tombol navigasi rute ke Google Maps.

---

## 📁 Struktur Berkas

```text
Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/
├── index.html              # Aplikasi WebGIS Utama
├── styles.css              # Sistem Desain Glassmorphism & Animasi Radar
├── app.js                  # Logika Leaflet, Geodesik Proksimitas & Parser Koordinat
├── data/
│   ├── di_jatim.json       # Database Spasial DI (Format GeoJSON/JSON)
│   └── di_jatim.js         # Wrapper JS untuk dukungan offline & file://
├── PRD.md                  # Product Requirement Document (PRD) Lengkap
├── README.md               # Dokumentasi Teknis & Panduan
└── .gitignore              # Konfigurasi Git Ignore
```

---

## 🚀 Panduan Deploy Online ke GitHub Pages (1-Klik)

Aplikasi ini dirancang menggunakan arsitektur *Client-Side Jamstack* (100% statis), sehingga **dapat di-host secara gratis dan online langsung di GitHub Pages**:

### Langkah 1: Buat Repository di Akun GitHub Anda
1. Buka [GitHub](https://github.com/new).
2. Beri nama repository: `Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur` (atau nama lain yang Anda inginkan).
3. Biarkan sebagai **Public** dan jangan centang "Initialize with README" (karena sudah ada di lokal).
4. Klik **Create repository**.

### Langkah 2: Hubungkan & Push dari Komputer Anda
Buka terminal / PowerShell di dalam folder ini, lalu jalankan:

```bash
# 1. Pastikan remote mengarah ke repository GitHub Anda
git remote add origin https://github.com/<USERNAME-ANDA>/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur.git

# 2. Push ke GitHub
git branch -M main
git push -u origin main
```

### Langkah 3: Aktifkan GitHub Pages
1. Pada halaman repository GitHub Anda, klik tab **Settings**.
2. Di menu sebelah kiri, pilih **Pages**.
3. Di bawah bagian **Build and deployment**:
   - **Source**: Pilih `Deploy from a branch`.
   - **Branch**: Pilih `main` dan folder `/(root)`.
4. Klik **Save**.
5. Tunggu 1–2 menit, tautan online WebGIS Anda akan aktif di:
   `https://<USERNAME-ANDA>.github.io/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/`

---

## 📜 Lisensi & Sumber Data
- **Data Spasial**: Dinas Pekerjaan Umum Sumber Daya Air Provinsi Jawa Timur (Skema Update 2025/2026).
- **Engine**: Leaflet.js (Open-Source BSD-2-Clause).
