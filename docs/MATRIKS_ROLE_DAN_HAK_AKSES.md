# MATRIKS ROLE DAN HAK AKSES SISTEM SIPETA
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur

---

## 1. PENDAHULUAN & PRINSIP KEAMANAN

SIPETA menerapkan prinsip *Least Privilege* dan pemisahan kewenangan (*Separation of Duties*) yang ketat. Pengamanan sistem diterapkan berlapis (*Defense in Depth*):
1. **Lapisan Database (PostgreSQL RLS & Triggers)**: Pengecekan hak akses dijalankan di tingkat database menggunakan `public.get_my_role()`.
2. **Lapisan Server & API**: Endpoint server memverifikasi sesi aktif dan role pemanggil sebelum menjalankan operasi mutasi.
3. **Lapisan Antarmuka (UI)**: Menu kerja disesuaikan berdasarkan identitas peran tanpa mengandalkan penyembunyian menu semata sebagai pengamanan.

---

## 2. TABEL MATRIKS HAK AKSES PERAN (5 PERAN RESMI)

| Modul & Entitas Bisnis | Superadmin | Admin Administrasi | Bendahara Pesantren | Pengelola Kepesantrenan | Orang Tua / Wali Santri |
|---|:---:|:---:|:---:|:---:|:---:|
| **Identitas Login** | Email Resmi (`sipetaabumanshur@gmail.com`) | Username (`admin..`) | Username (`bendahara..`) | Username (`pengelola..`) | Username: NIS<br>Password: NIS |
| **Wajib Ganti Sandi Awal** | Tidak | Tidak | Tidak | Tidak | **Ya (Pertama Kali)** |
| **Manajemen Pengguna Internal** | **CRUD Penuh** (Admin, Bendahara, Pengelola) | Tidak Berwenang | Tidak Berwenang | Tidak Berwenang | Tidak Berwenang |
| **Pembuatan Akun Wali Santri** | Dibatasi (Otomatis via Santri) | **CRUD Penuh** (Registrasi & Excel) | Tidak Berwenang | Tidak Berwenang | Tidak Berwenang |
| **Master Santri** | Lihat Semua | **CRUD Penuh** | Lihat Semua | Lihat Semua | Hanya Santri Asuhan (1:1) |
| **Import & Ekspor Excel Santri** | Ekspor Laporan | **CRUD Penuh** (Import & Ekspor) | Ekspor Keuangan | Tidak Berwenang | Tidak Berwenang |
| **Master Kelas & Kamar** | Lihat | **CRUD Penuh** (Safe Delete) | Lihat | Lihat | Lihat |
| **Rekening Resmi Pesantren** | **Kelola Penuh (ALL)** | **Kelola Penuh (ALL)** *(Migrasi 012)* | Lihat Saja (SELECT) *(Migrasi 012)* | Lihat Saja (SELECT) *(Migrasi 012)* | Lihat Saja (SELECT) *(Migrasi 012)* |
| **Generator Tagihan Santri** | Lihat | **CRUD Penuh** | Lihat & Kelola | Tidak Berwenang | Lihat Tagihan Santri Asuhan |
| **Verifikasi Pembayaran & Cicilan** | Lihat | Lihat | **Verifikasi Penuh** (Approve/Reject) | Tidak Berwenang | Mengajukan Pembayaran |
| **Ledger Uang Saku Santri** | Lihat | Lihat | **Kelola & Salurkan** (Wajib Foto) | Tidak Berwenang | Memantau Saldo & Top-up |
| **Catatan Tahfidz & Mengaji** | Lihat | Lihat | Tidak Berwenang | **CRUD Penuh** | Memantau Anak Asuhan |
| **Catatan Kedisiplinan & Prestasi** | Lihat | Lihat | Tidak Berwenang | **CRUD Penuh** | Memantau Anak Asuhan |
| **Pengumuman Publik Pesantren** | Lihat | **CRUD Penuh** | Lihat | Lihat | Lihat |
| **Jejak Audit (Audit Log)** | **Lihat Penuh (Read-Only)** | Tidak Berwenang | Tidak Berwenang | Tidak Berwenang | Tidak Berwenang |

---

## 3. RINCIAN KEWENANGAN SETIAP ROLE

### A. Superadmin (Pimpinan Pesantren)
- **Identitas**: Email resmi tunggal pesantren: `sipetaabumanshur@gmail.com`.
- **Kewenangan Utama**:
  1. Membuat, mengedit profil/username, mereset password, dan menonaktifkan akun staf internal (Admin Administrasi, Bendahara, Pengelola Kepesantrenan).
  2. Mengonfigurasi rekening bank resmi BSI pesantren bersama Admin Administrasi.
  3. Memantau seluruh jejak audit sistem (*Audit Log*) secara *immutable* (tidak dapat dimanipulasi).
  4. Melihat pusat laporan dan analitik konsolidasi pesantren.
- **Batasan**:
  - Superadmin **tidak diperbolehkan** membuat akun Wali Santri secara langsung melalui menu Manajemen Akun. Akun Wali harus dibuat oleh Admin melalui registrasi santri atau impor Excel untuk menjaga relasi 1:1.
  - Superadmin **tidak dapat** mengubah saldo ledger uang saku santri secara langsung tanpa dokumen jurnal penyesuaian.

### B. Admin Administrasi Pesantren
- **Identitas**: Username alfanumerik (contoh: `admin_santri`).
- **Kewenangan Utama**:
  1. Mendaftarkan santri baru dan mengelola data induk santri.
  2. Melakukan impor massal santri dari file Excel resmi beserta pembuatan akun wali berbasis NIS secara otomatis.
  3. Mengekspor data santri ke format Excel standar pesantren.
  4. Mengelola data master tahun ajaran, kelas, dan asrama/kamar (dilindungi fitur *Safe Delete*).
  5. Mengelola data master jenis pembayaran dan membuat tagihan santri massal.
  6. Mengelola rekening bank resmi pesantren (Sesuai *Migrasi 012*).
  7. Menerbitkan pengumuman publik untuk wali santri dan asatidz.
- **Batasan**:
  - Admin **tidak memiliki wewenang** memverifikasi atau mengesahkan transaksi pembayaran SPP dan uang saku.
  - Admin **tidak dapat** menghapus data catatan audit sistem.

### C. Bendahara Pesantren
- **Identitas**: Username alfanumerik (contoh: `bendahara_keuangan`).
- **Kewenangan Utama**:
  1. Memverifikasi bukti transfer pembayaran tagihan/SPP yang diunggah oleh wali santri (Setujui atau Tolak dengan alasan).
  2. Menerima pembayaran cicilan tagihan tunai secara langsung di kantor bendahara.
  3. Memverifikasi pengajuan top-up saldo uang saku santri.
  4. Mencatat penyerahan uang saku tunai ke santri dengan **wajib mengunggah foto bukti fisik penyerahan**.
  5. Mengunduh laporan rekapitulasi penerimaan kas dan keuangan pesantren.
  6. Melihat rekening resmi pesantren berstatus aktif (*Read-Only*).
- **Batasan**:
  - Bendahara **tidak dapat mengubah atau mengganti** nomor rekening resmi pesantren (hanya Superadmin dan Admin).
  - Bendahara **tidak dapat menghapus** catatan mutasi uang saku (bersifat *append-only*).
  - Bendahara **tidak memiliki akses** ke data riwayat pelanggaran kedisiplinan santri.

### D. Pengelola Kepesantrenan & Asrama
- **Identitas**: Username alfanumerik (contoh: `pengelola_asrama`).
- **Kewenangan Utama**:
  1. Mencatat setoran hafalan Al-Qur'an (Tahfidz) kategori *Hafalan Baru* dan *Muroja'ah* (Juz, Surat, Ayat, Nilai Kelancaran, Tajwid).
  2. Mencatat mutaba'ah mengaji kitab kuning dan capaian harian santri.
  3. Mencatat prestasi santri di bidang akademik, tahfidz, seni, dan olahraga.
  4. Mencatat pelanggaran kedisiplinan santri (Ringan, Sedang, Berat) beserta riwayat pembinaan (*coaching record*).
- **Batasan**:
  - Pengelola **sama sekali tidak memiliki akses** ke informasi keuangan, rincian pembayaran SPP, maupun ledger uang saku santri.
  - Pengelola **tidak dapat mengubah** data penempatan kelas dan kamar santri (kewenangan Admin).

### E. Orang Tua / Wali Santri
- **Identitas**:
  - **Username**: NIS Santri (contoh: `20260001`).
  - **Password Awal**: NIS Santri (contoh: `20260001`).
  - **Kewajiban Login Pertama**: Wajib mengganti password baru yang berbeda dengan NIS sebelum dapat membuka data santri.
- **Kewenangan Utama (Relasi 1:1)**:
  1. Melihat dashboard terpadu perkembangan satu orang santri asuhan yang terhubung.
  2. Melihat rincian tagihan pesantren dan melakukan pembayaran/cicilan transfer ke rekening resmi BSI pesantren.
  3. Mengunggah bukti struk transfer pembayaran.
  4. Mengajukan top-up uang saku santri dan melihat riwayat mutasi saldo.
  5. Melihat bukti foto fisik saat uang saku diserahkan oleh bendahara kepada santri.
  6. Memantau capaian tahfidz, mutaba'ah mengaji, prestasi, dan catatan kedisiplinan anak.
- **Batasan**:
  - Wali Santri **hanya dapat melihat data santri asuhannya sendiri**. Kebijakan RLS database memblokir akses ke santri lain maupun wali lain.
  - Wali Santri **tidak dapat mengedit** data capaian akademik, tagihan, atau status verifikasi.

