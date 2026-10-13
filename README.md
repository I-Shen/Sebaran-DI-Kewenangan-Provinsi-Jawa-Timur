# WebGIS Sebaran Daerah Irigasi (DI) Kewenangan Pemerintah Provinsi Jawa Timur

Portal WebGIS Interaktif Inventarisasi dan Pemetaan Spasial Jaringan Irigasi (Saluran, Petak Sawah, dan Bangunan) Kewenangan Pemerintah Provinsi Jawa Timur berbasis standar visualisasi **Google Earth**.

[![Akses WebGIS Online](https://img.shields.io/badge/WebGIS-Online%20Portal-00b4d8?style=for-the-badge&logo=leaflet&logoColor=white)](https://i-shen.github.io/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/)
[![GitHub Pages](https://img.shields.io/badge/Deployment-GitHub%20Pages-success?style=for-the-badge&logo=github)](https://i-shen.github.io/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/)
[![Sumber Data](https://img.shields.io/badge/Sumber%20Data-Dinas%20PUSDA%20Jatim-blue?style=for-the-badge)](https://pusda.jatimprov.go.id/)

---

## 🏛️ Sumber Data Resmi

Seluruh data geospasial jaringan irigasi, batas petak sawah, dan inventarisasi bangunan dalam sistem WebGIS ini bersumber resmi dari:

* **Instansi**: **Dinas Pekerjaan Umum Sumber Daya Air (Dinas PUSDA) Pemerintah Provinsi Jawa Timur**
* **Basis Pembaruan**: **Skema Pemutakhiran Data Aset Jaringan Irigasi Provinsi Jawa Timur (Update 2025/2026)**
* **Kewenangan Wilayah Sungai & Irigasi**: Daerah Irigasi (DI) lintas kabupaten/kota dengan luasan potensial **1.000 s.d. 3.000 Hektar (Ha)** sesuai amanat Permen PUPR No. 14/PRT/M/2015.

### Rekapitulasi Cakupan Data:
* **Total Daerah Irigasi (DI)**: **181 DI**
* **Total Wilayah UPT / Korwil**: **9 Wilayah Kerja Teknis**:
  1. **Korwil Madiun**: 39 DI
  2. **Korwil Malang**: 32 DI
  3. **UPT Pasuruan**: 25 DI
  4. **UPT Kediri**: 21 DI
  5. **UPT Bojonegoro**: 18 DI
  6. **UPT Lumajang**: 14 DI
  7. **UPT Bondowoso**: 13 DI
  8. **Perwakilan Mojokerto**: 8 DI
  9. **UPT Madura**: 5 DI
* **Berkas Spasial Master**: 198 Berkas KMZ/KML Terintegrasi
* **Total Fitur Spasial Aktif**: **50.507 Unsur Geospasial** (Saluran, Petak, dan Bangunan)

---

## 🗺️ Tampilan Spasial 1 DI Utuh (Standar Google Earth)

Sesuai standar operasional Google Earth Dinas PUSDA Jawa Timur, setiap Daerah Irigasi (DI) dipetakan secara utuh ke dalam 3 komponen geometris:

```
                          ┌─────────────────────────────┐
                          │   1 DAERAH IRIGASI (DI)     │
                          └──────────────┬──────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
  ┌───────────────┐              ┌───────────────┐              ┌───────────────────┐
  │ 1. GARIS      │              │ 2. POLIGON    │              │ 3. TITIK          │
  │ Saluran Air   │              │ Petak Sawah   │              │ Bangunan Irigasi  │
  ├───────────────┤              ├───────────────┤              ├───────────────────┤
  │ • Inti: Biru  │              │ • Isi: Hijau  │              │ • Pushpin Kuning  │
  │   Muda Air    │              │   Sawah Alami │              │   Google Earth    │
  │ • Casing:     │              │ • Border:     │              │ • Ring Titik:     │
  │   Warna DI    │              │   Warna DI    │              │   Warna DI        │
  └───────────────┘              └───────────────┘              └───────────────────┘
```

1. **Garis (LineString) — Saluran Irigasi (Dual-Stroke Cartography)**:
   * Melambangkan trace alur saluran pembawa air (saluran induk/primer, sekunder, tersier, hingga pembuang).
   * **Inti Saluran (Water Core)**: Warna biru muda air alami (`#00e5ff`, *width* 2.8px) menjaga semiotika alami air di peta satelit.
   * **Garis Pembungkus (Outer Casing)**: Garis luar ganda (*dual-stroke casing*, *width* 6.2px) berwarna pembeda DI (misal: Amber Oranye `#f59e0b` pada Rank 1, Rose Magenta `#ec4899` pada Rank 2, dsb.) sehingga batas kepemilikan antar DI terlihat jelas saat perbandingan.
   * Dilengkapi informasi panjang saluran dalam satuan meter (`m`) dan kilometer (`km`).

2. **Poligon (Polygon) — Petak Sawah / Daerah Layanan**:
   * Melambangkan petak tersier dan hamparan sawah beririgasi teknis/semi teknis.
   * **Isi Poligon (Paddy Fill)**: Warna hijau sawah alami (`#22c55e`, *fill opacity* 0.35) transparan agar kontur petak citra satelit tetap terlihat.
   * **Garis Pembatas (Boundary Stroke)**: Garis batas tepi tegas (*width* 2.8px) mengikuti warna pembeda DI masing-masing.
   * Menampilkan perhitungan luas otomatis (**Area dalam m² dan Hektar / ha**) serta keliling hamparan (**Perimeter dalam meter**).

3. **Titik (Point) — Bangunan Irigasi**:
   * Melambangkan seluruh bangunan air fisik pelengkap jaringan irigasi (Bendung, Pintu Sadap, Pintu Bagi, Gorong-gorong, Talang, dsb.).
   * Ditampilkan menggunakan ikon **Google Earth Yellow Pushpin** (`assets/ylw-pushpin.png`) autentik dengan tambahan **cincin aksen (*indicator ring*)** warna DI pada titik tancap jarum.
   * Memuat data atribut lengkap: `id_di`, `k_aset` (kode aset), `nama`, `nomenklatur`, `norec`, dan koordinat presisi.

---

## 🔍 Panel Inspeksi Objek (Google Earth Inspector Card)

Ketika pengguna mengeklik elemen apa pun di peta (baik petak sawah, saluran, maupun pin bangunan), sistem akan memunculkan **Panel Kartu Notifikasi & Inspeksi Google Earth** di sisi kanan layar:

* **Header Objek**:
  * Ikon jenis geometri (Poligon Petak, Saluran, atau Titik Pushpin).
  * Nama/Nomenklatur objek (contoh: `TK.1.Ka (6,27 ha)` atau `Sadap B.BD.1`).
  * Subjudul Daerah Irigasi & UPT pengampu.
* **Metrik Spasial**:
  * `Area` (m² & ha) dengan indikator dropdown lipat.
  * `Perimeter` (m) atau `Panjang Saluran` (m & km).
* **Tabel Atribut Standar PUSDA**:
  * `id_di`: Nomor ID unik Daerah Irigasi (contoh: `27935`).
  * `k_aset`: Kode klasifikasi aset irigasi (contoh: `F41`, `P03`, `C06`, `B01`).
  * `nama`: Nama objek lapangan.
  * `nomenklatur`: Nomenklatur teknis hidraulik resmi.
  * `norec`: Nomor rekaman inventarisasi aset.
  * `Daerah Irigasi` & `UPT / Wilayah`.
* **Tombol Aksi**:
  * `Edit / Salin Data`: Menyalin seluruh rangkuman atribut teknis ke papan klip (*clipboard*).
  * `Fokus Objek`: Mengarahkan dan memperbesar (*zoom-in*) kamera peta langsung ke objek bersangkutan.

---

## ⚡ Fitur Cerdas Lainnya

1. **Pemilihan Cepat DI (Google Earth 1 Layar Utuh)**:
   * Dropdown cepat di navigasi atas untuk berpindah seketika ke salah satu dari 181 DI Jawa Timur.
   * Peta otomatis melakukan *auto-fit bounds* ke seluruh geometri DI tersebut dengan pembesaran optimal.

2. **Pencarian Koordinat Multi-Metode**:
   * **Smart Copy-Paste**: Mendukung input koordinat tunggal maupun pasangan dalam format Desimal (`-7.740856, 112.883835`) maupun Derajat Menit Detik / DMS (`7°44'27.08"S, 112°53'1.81"E`).
   * **Input Manual Terpisah**: Kolom Latitude & Longitude terpisah.
   * **Pengambilan GPS Otomatis**: Deteksi lokasi terkini dari satelit GPS perangkat secara langsung (*High Accuracy Geolocation*).

3. **Sinyal Radar Proksimitas 5 DI Terdekat**:
   * Begitu titik target ditentukan di peta, sistem menghitung jarak geodesik ke seluruh DI di Jawa Timur menggunakan formula *Haversine*.
   * Menggambar garis koneksi putus-putus (*signal ray*) ke **5 Daerah Irigasi terdekat**.
   * Menampilkan kartu ranking 5 DI terdekat beserta jarak akurat dalam satuan kilometer (`km`).
   * Otomatis memuat dan merender jaringan DI terdekat ke layar.

4. **Pilihan Basemap Satelit Resolusi Tinggi**:
   * **Esri World Imagery + Clarity & Reference**: Citra satelit jernih dilengkapi toponimi batas provinsi, kabupaten/kota, kecamatan, desa/kelurahan, jalan raya, dan nama sungai.
   * **Google Satellite Hybrid**: Citra satelit Google Maps resolusi tinggi.
   * **OpenStreetMap** dan **CartoDB Dark Matter**.

---

## 💻 Panduan Menjalankan Sistem

### Akses Langsung Online (GitHub Pages)
Aplikasi telah terpasang dan dapat langsung diakses publik secara online tanpa instalasi:
👉 **[https://i-shen.github.io/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/](https://i-shen.github.io/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/)**

### Menjalankan di Komputer Lokal
1. Clone repositori ini:
   ```bash
   git clone https://github.com/I-Shen/Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur.git
   cd Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur
   ```
2. Jalankan server lokal sederhana (menggunakan Python):
   ```bash
   python -m http.server 8000
   ```
3. Buka peramban (*browser*) pada alamat:
   `http://localhost:8000`

---

## 📂 Struktur Repositori

```text
Sebaran-DI-Kewenangan-Provinsi-Jawa-Timur/
├── index.html              # Antarmuka WebGIS Utama & Panel Notifikasi
├── styles.css              # Sistem Desain Glassmorphism & Tampilan Google Earth
├── app.js                  # Engine Leaflet, Renderer Google Earth & Analisis Proksimitas
├── assets/
│   └── ylw-pushpin.png     # Ikon Yellow Pushpin Resmi Standar Google Earth
├── data/
│   ├── di_jatim.json       # Database Induk 181 DI Kewenangan Provinsi Jatim
│   ├── di_jatim.js         # Wrapper JS untuk kompatibilitas offline
│   └── geojson/            # 181 Berkas Vektor Lengkap (Saluran, Petak, Bangunan)
│       ├── 1.json / 1.js   # DI Bedilan (Korwil Madiun)
│       ├── 66.json / 66.js # DI Sumber Tekik (Korwil Malang - Sampel Gambar 2 & 3)
│       └── ...             # Seluruh 181 DI Lainnya
├── PRD.md                  # Dokumen Kebutuhan Produk (PRD) Lengkap
└── README.md               # Dokumentasi Teknis & Uraian Proyek
```

---

## 📜 Hak Cipta & Lisensi
* **Data Spasial**: Hak cipta data milik **Dinas Pekerjaan Umum Sumber Daya Air Pemerintah Provinsi Jawa Timur**.
* **Pengembangan WebGIS**: Dibuat untuk keperluan visualisasi, pemantauan, dan analisis spasial daerah irigasi.
* **Perpustakaan Peta**: [Leaflet.js](https://leafletjs.com/) (Lisensi BSD-2-Clause).
