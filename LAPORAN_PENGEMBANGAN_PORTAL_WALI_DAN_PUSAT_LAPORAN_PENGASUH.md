# LAPORAN PENGEMBANGAN PORTAL ORANG TUA / WALI SANTRI DAN PUSAT LAPORAN PENGASUH
## SISTEM INFORMASI PELAYANTERPADU (SIPETA) — PONDOK PESANTREN MODERN ABU MANSHUR

**Tanggal Pelaksanaan:** 14 November 2026  
**Repository:** `https://github.com/EkoSartika/sipeta-abumanshur.git`  
**Branch:** `main`  
**Production URL:** `https://sipetaabumanshur.vercel.app`  
**Vercel Project:** `sipeta-abumanshur` (Project ID: `prj_U55WvgB8orQ3UMP28FtvZAbeiSI8`)  
**Commit Acuan Rilis:** `feat(portal): enable guardian student profile editing and pengasuh reports`

---

## 1. RINGKASAN EKSEKUTIF

Pengembangan ini berhasil merealisasikan dua modul strategis pada SIPETA:
1. **Pembaruan Identitas Santri & Penentuan Penanggung Jawab Utama** pada Portal Orang Tua/Wali Santri.
2. **Pusat Laporan & Monitoring Komprehensif** untuk role Pengasuh Pondok Pesantren, mencakup 6 kategori laporan terstruktur serta kapabilitas ekspor dan cetak PDF standar **A4 Portrait** ber-kop surat resmi pesantren.

Seluruh pengembangan diselesaikan dengan kepatuhan penuh terhadap arsitektur keamanan:
- **Proteksi Akses (Least Privilege):** Wali Santri hanya memiliki wewenang untuk memperbarui data santri binaan miliknya sendiri. Field administrasi inti (`NIS`, `Kelas`, `Kamar Asrama`, dan `Status Santri`) dikunci secara ketat dan berlabel jelas *"Hanya dapat diubah oleh Tata Usaha / Admin Pesantren"*.
- **Hak Akses Pengasuh:** Dibatasi sebagai *read-only monitoring & analitik*, tanpa tombol mutasi keuangan atau manipulasi data di luar kewenangannya.
- **Zero Schema Change:** Integrasi metadata keluarga (Ayah, Ibu, Wali, dan Penanggung Jawab Utama) memanfaatkan utilitas `packWaliAlamatWithFamilyMetadata` tanpa mengubah skema tabel Supabase Cloud yang berpotensi menimbulkan downtime.

---

## 2. RINCIAN PENGEMBANGAN BAGIAN A: PORTAL ORANG TUA / WALI SANTRI

### 2.1 Formulir Pembaruan Identitas Santri
Pada modul Wali Santri (`src/modules/wali/wali-portal.tsx`), tab `profil_santri` kini dilengkapi tombol interaktif **"Ubah Identitas Santri & Keluarga"** dengan transisi mulus ke formulir pengeditan:

1. **Bagian 1 — Data Diri Santri:**
   - **Editable Fields:**
     - Nama Lengkap Santri (validasi minimal 3 karakter).
     - Jenis Kelamin (`L` / `P`).
     - Tempat Lahir (validasi wajib terisi).
     - Tanggal Lahir (validasi regex format `YYYY-MM-DD`).
     - Alamat Asal Santri (validasi minimal 5 karakter).
   - **Locked Fields (Read-Only dengan latar netral & badge informatif):**
     - Nomor Induk Santri (NIS).
     - Kelas Saat Ini.
     - Kamar Asrama & Gedung.
     - Status Santri.

2. **Bagian 2 — Identitas Orang Tua / Wali:**
   - **Pilihan Penanggung Jawab Utama:** Radio selector interaktif untuk menentukan pihak penanggung jawab utama (`Ayah`, `Ibu`, atau `Wali`).
   - **Data Ayah Kandung:** Nama Lengkap, Nomor HP/WhatsApp, dan Pekerjaan Ayah.
   - **Data Ibu Kandung:** Nama Lengkap, Nomor HP/WhatsApp, dan Pekerjaan Ibu.
   - **Data Wali Santri (Opsional):** Nama Wali, Hubungan Kekerabatan (contoh: Paman, Kakek, Bibi), dan Nomor HP/WhatsApp.
   - **Validasi Kontak:** Jika pihak terpilih adalah Ayah, nomor HP dan nama Ayah wajib terisi minimal. Ketentuan yang sama berlaku untuk Ibu atau Wali jika dipilih sebagai penanggung jawab utama.

### 2.2 Keamanan & Sinkronisasi Server (`PATCH /api/admin-santri`)
- Endpoint server memeriksa role pemanggil. Jika pemanggil adalah `wali`, server memverifikasi relasi akun via `public.wali_santri` (`user_id === callerUser.id` dan `santri_id === id`).
- Payload server memvalidasi penolakan keras (HTTP 403) jika terdapat upaya perubahan pada `nis`, `kelas_id`, `kamar_id`, `status`, atau `tahun_masuk` oleh Wali Santri.
- Sinkronisasi instan memperbarui baris `public.santri`, `public.wali_santri`, dan profil akun login `public.profiles`.

---

## 3. RINCIAN PENGEMBANGAN BAGIAN B: PUSAT LAPORAN PENGASUH

Pada halaman laporan Pengasuh (`src/modules/laporan/laporan-portal.tsx`), navigasi telah direstrukturisasi menjadi 6 kategori laporan utama yang mencakup seluruh aspek operasional pesantren:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   PUSAT LAPORAN & MONITORING PENGASUH                      │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────┬───────┤
│1. Pembayaran │2. Uang Saku  │3. Mengaji    │4. Tahfidz    │5.Disiplin│6.Pres │
└──────────────┴──────────────┴──────────────┴──────────────┴─────────┴───────┘
```

1. **Laporan Pembayaran & Kewajiban Tagihan:**
   - Ringkasan kartu metrik: Total Tagihan Terbit, Total Pembayaran Masuk, dan Total Sisa Tunggakan.
   - Rincian tabel per baris: No, NIS & Nama Santri, Kelas/Kamar, Jenis Tagihan & Jatuh Tempo, Nominal Tagihan, Terbayar, Sisa Tunggakan, dan Status Tagihan (`LUNAS`, `DIBAYAR_SEBAGIAN`, `BELUM_BAYAR`).
2. **Laporan Uang Saku & Saldo Keuangan:**
   - Rincian tabel per santri: Total Uang Masuk, Total Penarikan, Penyesuaian/Koreksi, dan Saldo Terkini.
3. **Laporan Perkembangan Mengaji:**
   - Rincian pencatatan per santri: Tanggal, NIS & Nama, Kelas, Tingkat Jilid/Kitab, Materi Terakhir, Status Kelancaran, dan Catatan Pembimbing Asatidz.
4. **Laporan Capaian & Setoran Tahfidz:**
   - Rincian hafalan santri: Tanggal, Nama Surah, Juz, Rentang Ayat, Jumlah Ayat, dan Kualitas Hafalan/Predikat.
5. **Laporan Catatan Kedisiplinan & Karakter:**
   - Rekapitulasi indisipliner: Tanggal & Waktu Kejadian, Kategori Pelanggaran, Tingkat (`RINGAN`, `SEDANG`, `BERAT`), Deskripsi, Tindak Lanjut Pembinaan, dan Status Penanganan.
6. **Laporan Prestasi Santri:**
   - Rekapitulasi kejuaraan: Tanggal, Nama Kegiatan, Kategori, Tingkat Prestasi (`PESANTREN`, `KECAMATAN`, `KABUPATEN`, `PROVINSI`, `NASIONAL`, `INTERNASIONAL`), dan Peringkat Juara.

### Fitur Filter Dinamis
- Filter Kelas Santri.
- Filter Kamar Asrama.
- Filter Rentang Tanggal (Dari Tanggal — Sampai Tanggal).
- Pencarian Nama Santri atau NIS.
- Filter Status Pembayaran Tagihan (khusus kategori Pembayaran).

---

## 4. FORMAT CETAK DOKUMEN PDF (A4 PORTRAIT) DENGAN KOP RESMI

Modul laporan terintegrasi dengan print CSS standar percetakan:
- **Ukuran Kertas:** `@page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }`.
- **Kop Surat Resmi:**
  - Logo resmi Pesantren Modern Abu Manshur (`/images/logo-abu-manshur.png`).
  - Identitas Yayasan & Pondok Pesantren Modern Abu Manshur.
  - Alamat lengkap: *Jl. Nyi Ageng Serang, Desa Kaliwadas, Kec. Plered, Kab. Cirebon, Jawa Barat 45154*.
  - Kontak resmi: Email, telepon, dan website resmi.
  - Garis ganda pembatas kop surat resmi.
- **Elemen Dokumen:**
  - Judul Laporan Spesifik sesuai kategori aktif.
  - Metadata: Tahun Pelajaran Aktif, Semester, Tanggal & Waktu Cetak, serta Nama Petugas Pengasuh.
  - Bagian tanda tangan resmi di bagian bawah: Pimpinan Pondok Pesantren dan Pengasuh/Petugas Pencatat dengan proteksi page-break (`break-inside: avoid`).
  - Kelas `.no-print` secara otomatis menyembunyikan navigasi sidebar, tombol unduh, filter bar, dan footer web saat dialog cetak/simpan PDF peramban aktif.

---

## 5. HASIL VERIFIKASI & PENGUJIAN OTOMATIS

| No | Pengujian | Hasil | Keterangan |
|:---|:---|:---:|:---|
| 1 | **Unit Test: Family Metadata Packaging** | **PASSED** | Fungsi packing & unpacking metadata keluarga bekerja konsisten tanpa merusak format string alamat |
| 2 | **Unit Test: WaliPortal Profile Render** | **PASSED** | Tab `profil_santri` merender informasi keluarga, penanggung jawab, dan tombol ubah identitas |
| 3 | **Unit Test: LaporanPortal 6 Categories** | **PASSED** | 6 kategori laporan pengasuh dan kop surat resmi terverifikasi pada DOM render |
| 4 | **TypeScript Strict Typecheck (`npx tsc`)** | **PASSED** | 0 error kompilasi pada seluruh proyek Next.js |
| 5 | **ESLint Syntax & Rule Verification** | **PASSED** | Bebas dari syntax error |
| 6 | **Production Build (`next build`)** | **PASSED** | 28 rute statis & dinamis terkompilasi optimal |

---

## 6. STATUS RILIS & DEPLOYMENT

1. **Commit Message:** `feat(portal): enable guardian student profile editing and pengasuh reports`
2. **Git Branch:** `main` (sinkron dengan `origin/main`)
3. **Deployment Vercel:** Target project `sipeta-abumanshur` dengan domain resmi `https://sipetaabumanshur.vercel.app`.
