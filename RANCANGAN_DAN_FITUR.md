# Rancangan Antarmuka & Spesifikasi Fitur WebGIS
## Sebaran Daerah Irigasi (DI) Kewenangan Pemerintah Provinsi Jawa Timur

---

### I. Gambaran 2D Tata Letak Antarmuka (*User Interface Layout*)

```text
+-------------------------------------------------------------------------------------------------------+
|  [LOGO SDA]  Sebaran DI Kewenangan Jawa Timur - Dinas PU SDA            [Panel]  [GPS Saya]  [Reset]  |
+-------------------------------------------------------------------------------------------------------+
|  +------------------------------+  |                                                                  |
|  | PENCARIAN KOORDINAT          |  |                                                                  |
|  | [Smart Paste] [Manual (DD)]  |  |                                (DI Klampis - Madura)             |
|  | [ -7.718417, 112.909267    ] |  |                                      *                           |
|  | [ Cari Koordinat ]           |  |                                                                  |
|  | [ Otomatis via GPS ]         |  |                                                                  |
|  +------------------------------+  |                                                                  |
|  | SINYAL 5 DI TERDEKAT         |  |                (( RADAR PULSE ))                                 |
|  | Titik: -7.7184, 112.9092     |  |                  /    |    \                                     |
|  |                              |  |                 /     |     \                                    |
|  | #1 DI Pleret       (1.82 km) |  |   (DI Pleret)  *      *      * (DI Krasak)                       |
|  |    UPT Pasuruan    [Fokus]   |  |               #1     #3      #2                                  |
|  |                              |  |                                                                  |
|  | #2 DI Krasak       (4.15 km) |  |                                                                  |
|  | #3 DI Sampean      (6.50 km) |  |                                                                  |
|  | #4 DI Jatimlerek   (8.30 km) |  |                                                                  |
|  | #5 DI Pacal       (10.12 km) |  |                                                                  |
|  +------------------------------+  |                                                                  |
|  | FILTER UPT & CARI NAMA DI    |  |                                                                  |
|  | UPT: [ Semua UPT (181 DI) v] |  |                                          +---------------------+ |
|  | Cari: [ Ketik nama DI...   ] |  |                                          | [Layer] Basemap     | |
|  +------------------------------+  |                                          | (*) Esri Satelit HD | |
|                                    |                                          | ( ) Google Satelit  | |
|                                    |                                          | ( ) Peta Jalan OSM  | |
|                                    |                                          +---------------------+ |
+-------------------------------------------------------------------------------------------------------+
```

---

### II. Rincian Fitur Lengkap dalam Sistem

| No | Modul Fitur | Fungsi Teknis & Pengalaman Pengguna (UX) |
|---|---|---|
| **1** | **Multi-Mode Coordinate Search** | • **Smart Paste**: Menempelkan koordinat langsung (mendukung Desimal `-7.71, 112.90` maupun DMS `7°43'6"S 112°54'33"E`).<br>• **Input Manual**: Form terpisah untuk nilai Latitude dan Longitude.<br>• **Deteksi GPS Satu-Klik**: Mengambil posisi riil pengguna dari satelit GPS ponsel/laptop dengan indikator akurasi (± meter). |
| **2** | **Sinyal Radar & Proksimitas Real-Time** | • Menghitung jarak geodesic (*Haversine*) seketika ke seluruh 181 DI saat titik ditentukan.<br>• Memancarkan animasi gelombang radar (*pulsing amber ring*) di titik target.<br>• Menghubungkan titik target ke 5 DI terdekat dengan garis dinamis (*dashed polylines*). |
| **3** | **Panel 5 DI Terdekat** | • Menampilkan daftar peringkat 1 s.d. 5 DI terdekat.<br>• Menampilkan jarak presisi dalam satuan Kilometer (`km`).<br>• Menampilkan nama UPT pengelola dan tombol interaktif untuk langsung mengarahkan kamera peta (*fly-to*) ke DI tersebut. |
| **4** | **Basemap Satelit Hybrid Lengkap** | • **Esri World Imagery + Clarity**: Citra satelit jernih dengan kontur lahan pertanian.<br>• **Esri Reference Overlay**: Menampilkan toponimi lengkap (nama kota, kecamatan, kelurahan/desa, jalan raya, batas wilayah, dan sungai).<br>• **Google Hybrid Satellite**, **OpenStreetMap**, dan **CartoDB Dark Matter**. |
| **5** | **Filter & Live Search Spasial** | • Filter dropdown berdasarkan 9 UPT / Korwil SDA.<br>• Kotak pencarian langsung (*live search*) berdasarkan nama Daerah Irigasi.<br>• Pengelompokan cerdas (*Marker Clustering*) agar peta tidak berat saat melihat skala seluruh Jawa Timur. |
| **6** | **Popup Informasi Detail** | • Klik pada marker DI memunculkan kartu detail: Nama DI, UPT pengelola, koordinat presisi (Desimal & DMS), jumlah lapisan file pendukung, dan tombol pintas navigasi rute ke Google Maps. |

---

### III. Kritik, Saran Strategis, dan Pertanyaan untuk Anda

1. **Titik Centroid vs Poligon Saluran & Petak KMZ Asli**:
   * *Kondisi saat ini*: Sistem menggunakan titik berat (*centroid*) dari tiap DI untuk kalkulasi jarak super cepat (<5 ms) dan visualisasi ringan 181 DI.
   * *Saran*: Karena jaringan irigasi bisa membentang sepanjang 10–20 km, apakah ke depannya Anda ingin saat suatu DI diklik, peta **otomatis memunculkan garis saluran dan petak sawah asli** yang diekstrak dari file `.kmz`-nya?

2. **Ambang Batas Jangkauan Layanan (*Proximity Radius Threshold*)**:
   * *Kondisi saat ini*: Sistem akan selalu menampilkan 5 DI terdekat meskipun titik yang diklik berada jauh di luar Jawa Timur (misalnya di Jawa Tengah atau di laut).
   * *Saran*: Apakah perlu kita beri batas radius logis (misalnya maksimal **25 km** atau **50 km**)? Jika titik berada di luar batas tersebut, sistem akan menampilkan notifikasi: *"Titik berada di luar radius layanan irigasi kewenangan provinsi"*.

3. **Integrasi Data Teknis Irigasi (Luas Baku, Luas Potensial & Sumber Air)**:
   * *Saran*: Di dalam folder sumber terdapat file Excel skema (seperti rekapitulasi bangunan & saluran). Apakah Anda ingin memasukkan data teknis seperti **Luas Baku (Ha)**, **Panjang Saluran Primer/Sekunder (m)**, dan **Nama Sungai / Sumber Air** ke dalam kartu popup informasi tiap DI?

4. **Fitur Ekspor / Laporan Lapangan Instan (WhatsApp / PDF)**:
   * *Saran*: Petugas lapangan sering kali perlu melaporkan status titik aduan ke pimpinan. Kita dapat menambahkan tombol *"Kirim Laporan via WhatsApp"* atau *"Cetak PDF Rekapitulasi"*, yang otomatis menyusun teks berisi koordinat titik, status 5 DI terdekat, dan tautan Google Maps. Apakah fitur ini akan sering dibutuhkan?

5. **Kebijakan Repositori GitHub (Publik vs Privat)**:
   * *Pertanyaan*: Repositori lokal saat ini sudah siap di-push ke GitHub. Apakah repositori ini nantinya akan dijadikan **Public** (sehingga dapat memanfaatkan hosting gratis GitHub Pages agar bisa dibuka siapa saja secara online) atau **Private** (khusus internal kedinasan)?
