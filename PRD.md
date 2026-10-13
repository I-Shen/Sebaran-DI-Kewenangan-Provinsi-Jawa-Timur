# Product Requirement Document (PRD)
## Sistem Informasi Geospasial (WebGIS) Sebaran Daerah Irigasi (DI) Kewenangan Pemerintah Provinsi Jawa Timur

---

### 1. Informasi Dokumen
- **Nama Produk / Proyek**: Sebaran DI Kewenangan Provinsi Jawa Timur (WebGIS Portal)
- **Versi**: 1.0.0 (Release Update Skema 2025/2026)
- **Status**: Final Draft
- **Target Deployment**: GitHub Repository & GitHub Pages (100% Client-Side WebGIS)
- **Lingkup Wilayah**: Provinsi Jawa Timur (9 UPT / Korwil Pengelolaan Sumber Daya Air)

---

### 2. Latar Belakang & Visi Produk

#### 2.1 Latar Belakang
Pemerintah Provinsi Jawa Timur melalui Dinas Pekerjaan Umum Sumber Daya Air (PU SDA) memiliki kewenangan pengelolaan terhadap Daerah Irigasi (DI) dengan luasan 1.000 hingga 3.000 Hektar (berdasarkan Permen PUPR No. 14/PRT/M/2015). Data spasial jaringan irigasi, petak tersier, dan sosiohidro tersebar dalam ratusan file format `.kmz` dan `.kml` yang terbagi ke dalam 9 Unit Pelaksana Teknis (UPT) / Koordinator Wilayah (Korwil).

Kendala yang dihadapi:
1. Akses data lapangan memerlukan instalasi software GIS berat (Google Earth Pro / ArcGIS / QGIS).
2. Petugas lapangan sulit melakukan verifikasi instan ketika berada di suatu koordinat titik lokasi untuk mengetahui DI mana yang melayani atau paling dekat dengan titik tersebut.
3. Ketiadaan sistem pencarian koordinat cepat yang fleksibel mendukung berbagai format penulisan koordinat (DMS, Desimal, maupun GPS ponsel langsung).

#### 2.2 Visi Produk
Membangun portal WebGIS interaktif, modern, cepat, dan ringan (*zero backend requirement*) yang dapat diakses secara daring melalui GitHub Pages oleh seluruh stakeholder (pimpinan, staf teknis, petugas lapangan, dan akademisi) untuk memvisualisasikan, mencari, serta menganalisis proksimitas lokasi terhadap seluruh Daerah Irigasi Provinsi Jawa Timur secara *real-time*.

---

### 3. Persona Pengguna (*User Personas*)

1. **Petugas Operasi & Pemeliharaan (O&P) Lapangan**:
   - *Tujuan*: Mengaktifkan GPS di ponsel untuk langsung mengetahui DI terdekat dalam radius kilometer saat survei bendung atau saluran.
2. **Staf Teknis & Perencanaan Dinas PU SDA / UPT**:
   - *Tujuan*: Menginput koordinat aduan masyarakat / proyek (bisa format DMS atau Desimal) dan mengecek apakah titik tersebut masuk kewenangan DI provinsi atau bukan.
3. **Pimpinan & Stakeholder Eksekutif**:
   - *Tujuan*: Melihat dashboard sebaran spasial 166+ DI se-Jawa Timur dengan citra satelit resolusi tinggi beserta batas administrasi dan sungai.

---

### 4. Fitur Utama & Spesifikasi Fungsional

#### 4.1 Modul Pencarian Koordinat Multi-Metode (Core Feature 1)
Sistem harus menyediakan formulir pencarian koordinat fleksibel yang mendukung:
- **Pencarian Manual Input Terpisah**: Field Latitude dan Field Longitude.
- **Pencarian Format Bebas (Copy-Paste Pintar)**: Menginput satu baris string gabungan, misalnya:
  - Format Desimal: `-7.718417, 112.909267`
  - Format DMS: `7°43'6.30"S, 112°54'33.36"E` atau `7 43 6.30 S, 112 54 33.36 E`
  - Parser otomatis mendeteksi arah Lintang Selatan (S/LS = negatif) dan Bujur Timur (E/BT = positif).
- **Deteksi Otomatis GPS (Geolocation API)**: Tombol satu klik *"Gunakan Lokasi GPS Saya"* yang mengambil koordinat riil perangkat mobile/desktop dengan indikator akurasi.

#### 4.2 Analisis Proksimitas Real-Time & Sinyal Radar 5 DI Terdekat (Core Feature 2)
Saat pengguna menentukan titik lokasi (melalui klik peta, input koordinat, atau GPS):
- **Perhitungan Geodesik Instan (Formula Haversine)**:
  $$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  dengan $R = 6.371\text{ km}$.
- **Sinyal Visual Radar**:
  - Muncul penanda lokasi titik target dengan efek animasi gelombang radar (*pulsing signal ring*).
  - Garis konektor dinamis (*polyline*) yang membentang dari titik target ke **5 Daerah Irigasi Terdekat**.
- **Notifikasi Sistem & Panel Kartu 5 DI Terdekat**:
  - Menampilkan daftar peringkat 1 s.d. 5 DI terdekat beserta jarak akurat dalam satuan Kilometer (contoh: `2.45 km`).
  - Menampilkan nama UPT pengelola.
  - Tombol aksi *"Fokus Lokasi"* (*fly-to animation*) untuk mengarahkan kamera peta langsung ke DI tersebut.

#### 4.3 Peta Dasar Satelit Resolusi Tinggi & Layer Administrasi (Core Feature 3)
Menggunakan Leaflet.js dengan pilihan basemap:
1. **Google Satellite Hybrid**: Citra satelit Google Maps dilengkapi jalan raya, nama kota/kecamatan, dan toponimi.
2. **Esri World Imagery + Clarity**: Citra satelit resolusi tinggi dengan detail geomorfologi dan saluran air.
3. **Esri Boundaries & Places Overlay**: Layer pelengkap batas administrasi (Provinsi, Kabupaten/Kota, Kecamatan, Kelurahan/Desa) serta jaringan transportasi dan sungai.
4. **CartoDB Dark Matter / Voyager**: Alternatif tampilan bersih untuk analisis malam/kantor.
5. **OpenStreetMap**: Peta jalan dan hidrologi umum.

#### 4.4 Katalog & Filter Spasial Sebaran DI (Core Feature 4)
- **Filter Berdasarkan UPT / Korwil**:
  - Seluruh Jawa Timur (All)
  - Korwil Madiun (39 DI)
  - Korwil Malang (32 DI)
  - Perwakilan Mojokerto (8 DI)
  - UPT Bojonegoro (18 DI)
  - UPT Bondowoso (13 DI)
  - UPT Kediri (21 DI)
  - UPT Lumajang (14 DI)
  - UPT Madura (5 DI)
  - UPT Pasuruan (25 DI)
- **Pencarian Cepat Nama DI**: Live search box untuk menyaring nama DI secara instan.
- **Popup Informasi Komprehensif**: Klik pada marker DI menampilkan:
  - Nama Daerah Irigasi
  - UPT / Wilayah Kerja
  - Koordinat Centroid (DMS & Desimal)
  - Daftar Layer / File Asli (.KMZ / .KML)
  - Jarak dari posisi pinpoint aktif (jika ada)
  - Tombol rute Google Maps langsung.

---

### 5. Arsitektur Teknis & Standar Desain

#### 5.1 Arsitektur Aplikasi (Jamstack / Client-Side WebGIS)
- **Frontend Stack**: Pure Semantic HTML5, CSS3 Modern (Glassmorphism & CSS Variables), Vanilla JavaScript (ES6+).
- **GIS Engine**: Leaflet.js v1.9.4 dengan Leaflet MarkerCluster plugin.
- **Data Layer**: JSON terstruktur (`data/di_jatim.json`) yang memuat data spasial seluruh DI hasil ekstraksi 198 file KMZ Jawa Timur.
- **Hosting / Deployment**: GitHub Pages (Static hosting gratis, HTTPS otomatis, performa tinggi global CDN).

#### 5.2 Standar Estetika UI/UX
- **Theme**: Dark Glassmorphism bernuansa *Geospatial Command Center* (Navy/Slate #0b132b, Emerald Cyan #00f2fe untuk hidrologi, Gold #f59e0b untuk aksen titik pantau).
- **Typography**: Inter (Google Fonts) untuk keterbacaan data numerik koordinat yang presisi.
- **Responsivitas**: Optimal di layar desktop ultra-wide, laptop, tablet, hingga smartphone lapangan.

---

### 6. Panduan Deployment GitHub & GitHub Pages

1. **Struktur Repository**:
   ```text
   Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/
   ├── index.html              # Aplikasi WebGIS Utama
   ├── styles.css              # Sistem Desain & Glassmorphism UI
   ├── app.js                  # Logika Leaflet, Parser Koordinat & Radar Proksimitas
   ├── data/
   │   └── di_jatim.json       # Database Spasial DI Jatim
   ├── PRD.md                  # Dokumen Kebutuhan Produk (PRD)
   ├── README.md               # Dokumentasi Teknis & Panduan
   └── .gitignore              # Konfigurasi Git
   ```

2. **Langkah Publikasi ke GitHub**:
   - Buat repositori baru di akun GitHub Anda dengan nama `Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur`.
   - Hubungkan remote origin dan lakukan `git push -u origin main`.
   - Buka menu **Settings** > **Pages** di repositori GitHub.
   - Pada bagian **Build and deployment**, pilih Source: **Deploy from a branch**, Branch: **main** / **/(root)**, lalu klik **Save**.
   - URL WebGIS online akan aktif dalam 1-2 menit (contoh: `https://<username>.github.io/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/`).

---

### 7. Metrik Keberhasilan (Success Metrics)
- **Waktu Muat (Load Time)**: < 1.5 detik untuk memuat seluruh 166+ DI se-Jawa Timur.
- **Akurasi Proksimitas**: Perhitungan jarak Haversine instan (< 10 ms) untuk 5 DI terdekat.
- **Kemudahan Akses**: Tanpa perlu instalasi software pihak ketiga, dapat dibuka langsung melalui peramban web (*browser*) apa pun.
