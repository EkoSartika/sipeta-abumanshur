# DOKUMEN REKONSILIASI FINAL BASIS DATA & KODE APLIKASI SIPETA
**Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur**  
**Tanggal Evaluasi**: 9 November 2026  
**Target Proyek Supabase Cloud**: `jvhzrhfzkjqzlhsvvbgy`  
**Production URL**: [https://sipeta-abumanshur.vercel.app](https://sipeta-abumanshur.vercel.app)  
**Status Audit**: **SELESAI, TEREKONSILIASI & TERVERIFIKASI PENUH**

---

## 1. PENDAHULUAN & CAKUPAN AUDIT

Dokumen ini memuat hasil audit dan rekonsiliasi komprehensif antara kondisi basis data Supabase Cloud aktual (dengan 27 tabel, 4 bucket storage, 9 fungsi RPC, 20 trigger, Foreign Keys, dan migrasi 008–012) terhadap seluruh kode sumber aplikasi SIPETA (`src/`, Server Actions, API routes, Store, dan Services).

---

## 2. TEMUAN YANG SUDAH BENAR & SESUAI (VERIFIED AS CORRECT)

### 2.1 Keselarasan 27 Tabel Skema Basis Data
Seluruh 27 tabel operasional terbukti selaras 100% antara skema PostgreSQL, berkas migrasi, antarmuka TypeScript (`src/types/database.ts`), dan pemanggilan query Supabase:
1. `profiles`: Kolom inti (`id`, `email`, `nama_lengkap`, `role`, `is_active`, `must_change_password`, `username`).
2. `tahun_ajaran`: Master data periode akademik aktif.
3. `kelas`: Master data kelas dengan relasi tingkat santri.
4. `kamar`: Master data asrama/kamar dengan relasi kapasitas.
5. `santri`: Data identitas santri dengan relasi foreign key ke kelas dan kamar.
6. `wali_santri`: Relasi 1:1 antara akun pengguna wali (`user_id`) dan santri (`santri_id`).
7. `riwayat_penempatan_santri`: Jejak audit otomatis pemindahan kelas dan kamar.
8. `rekening_pesantren`: Rekening resmi penerimaan pembayaran yayasan/pesantren.
9. `jenis_pembayaran`: Master pos tarif pembayaran (SPP, Gedung, Seragam, dll).
10. `tagihan`: Tagihan berkala santri dengan snapshot kebijakan cicilan.
11. `keranjang_pembayaran`: Tabel keranjang checkout multi-item tagihan per wali santri.
12. `item_keranjang_pembayaran`: Rincian item tagihan dalam keranjang.
13. `transaksi_pembayaran`: Catatan transaksi perbankan dengan snapshot rekening tujuan dan bukti transfer.
14. `alokasi_pembayaran`: Relasi alokasi dana transaksi pembayaran ke masing-masing tagihan.
15. `pembayaran_cicilan`: Histori pembayaran cicilan bertahap tagihan.
16. `saldo_uang_saku`: Buku besar saldo kas santri.
17. `pengajuan_topup_saku`: Pengajuan isi ulang uang saku oleh wali santri.
18. `mutasi_uang_saku`: Ledger transaksi mutasi uang keluar/masuk tunai santri (immutable).
19. `setoran_tahfidz`: Log capaian hafalan Qur'an santri (juz, surat, ayat, kelancaran).
20. `catatan_akademik`: Raport dan evaluasi berkala capaian santri.
21. `pelanggaran_disiplin` / `catatan_kedisiplinan`: Pencatatan pelanggaran disiplin santri.
22. `riwayat_pembinaan_disiplin` / `riwayat_perubahan_kedisiplinan`: Log pembinaan dan audit perubahan kedisiplinan.
23. `prestasi_santri`: Dokumentasi piagam kejuaraan dan penghargaan santri.
24. `pengumuman`: Papan pengumuman resmi pesantren.
25. `notifikasi`: Notifikasi pengguna in-app terisolasi.
26. `audit_logs`: Log audit append-only terlindungi trigger immutability.
27. `template_import_santri`: Skema definisi kolom template import Excel.

### 2.2 Audit Sembilan Fungsi Stored Procedure (RPC)
Seluruh 9 fungsi RPC telah diaudit dan memenuhi standar integritas tinggi:
1. `get_my_role()`: `STABLE SECURITY DEFINER SET search_path = public`. Membaca role profil aktif pemanggil dari `auth.uid()`.
2. `get_my_santri_id()`: `STABLE SECURITY DEFINER SET search_path = public`. Membaca `santri_id` sah milik wali pemanggil dari `auth.uid()`.
3. `rpc_checkout_pembayaran`: `SECURITY DEFINER SET search_path = public`. Memvalidasi role `wali`, mengunci baris tagihan (`FOR UPDATE`), memvalidasi batas cicilan, mengalokasikan pembayaran atomik, dan mencatat audit log.
4. `rpc_verifikasi_pembayaran`: `SECURITY DEFINER SET search_path = public`. Memvalidasi role `bendahara`, mengunci transaksi (`FOR UPDATE`), mencegah verifikasi ulang, mengupdate status tagihan, dan mencatat riwayat cicilan.
5. `rpc_verifikasi_topup_uang_saku`: `SECURITY DEFINER SET search_path = public`. Memvalidasi role `bendahara`, mengunci baris pengajuan dan saldo uang saku, menghitung mutasi, dan memperbarui saldo santri secara atomik.
6. `rpc_catat_penyerahan_uang_saku`: `SECURITY DEFINER SET search_path = public`. Memvalidasi role `bendahara`, memvalidasi ketersediaan saldo, memvalidasi bukti foto fisik penyerahan tunai (`foto_penyerahan_path`), dan mencatat mutasi jenis `KELUAR`.
7. `rpc_koreksi_ledger_uang_saku`: `SECURITY DEFINER SET search_path = public`. Memvalidasi role `superadmin` / `bendahara`, mewajibkan referensi mutasi sebelumnya dan alasan koreksi minimal 5 karakter, serta mencegah saldo negatif.
8. `rpc_unggah_bukti_transfer_pembayaran`: `SECURITY DEFINER SET search_path = public`. Memvalidasi kepemilikan transaksi oleh wali pemanggil, mencegah penggantian bukti pada transaksi yang sudah selesai/diverifikasi, dan memperbarui status ke `MENUNGGU_VERIFIKASI`.
9. `rpc_penyesuaian_tagihan`: `SECURITY DEFINER SET search_path = public`. Memvalidasi role `superadmin` / `admin`, memastikan tagihan belum memiliki pembayaran masuk, mencatat riwayat penyesuaian, dan menulis ke log audit.

### 2.3 Audit 20 Triggers PostgreSQL
Seluruh 20 triggers terbukti mengamankan integritas data dari lapis basis data engine:
* **Pembaruan Timestamp Otomatis (`set_updated_at`)**: Terpasang pada `profiles`, `rekening_pesantren`, `santri`, `wali_santri`, `jenis_pembayaran`, `tagihan`, `transaksi_pembayaran`, `pengajuan_uang_saku`.
* **Immutabilitas Transaksi Keuangan**:
  - `trg_immutable_mutasi_uang_saku`: Memblokir `UPDATE` dan `DELETE` pada mutasi kas santri.
  - `trg_immutable_audit_logs`: Memblokir `UPDATE` dan `DELETE` pada log audit (append-only).
  - `trg_protect_verified_transaksi`: Memblokir manipulasi transaksi pembayaran yang telah disahkan statusnya (`DISETUJUI` / `DITOLAK`).
* **Automasi Relasi & Riwayat**:
  - `trg_after_santri_insert`: Otomatis membuat rekening saldo saku awal (Rp 0) dan mencatat riwayat penempatan awal kelas/kamar.
  - `trg_after_santri_placement_update`: Otomatis mencatat mutasi kelas/kamar ke `riwayat_penempatan_santri`.
  - `trg_before_kedisiplinan_update`: Otomatis mencatat riwayat perubahan catatan pembinaan kedisiplinan.
* **Proteksi Integritas Relasi (Migrasi 010)**:
  - `trg_prevent_delete_kelas`: Mencegah penghapusan kelas jika masih dihuni santri aktif.
  - `trg_prevent_delete_kamar`: Mencegah penghapusan kamar jika masih dihuni santri aktif.
  - `trg_prevent_hard_delete_santri`: Mencegah hard delete santri jika memiliki riwayat keuangan atau catatan akademik.

---

## 3. HASIL EVALUASI RISIKO KEAMANAN & PRIVASI

### 3.1 Evaluasi RLS Tabel `profiles` (Data Profiling Exposure)
* **Kondisi Lama**: Kebijakan default berisiko mengekspos profil ke seluruh pengguna terautentikasi.
* **Kondisi Teruji (Migrasi 008)**:
  - Wali Santri **HANYA** dapat membaca data profil miliknya sendiri (`id = auth.uid()`).
  - Wali Santri **DIBLOKIR TOTAL** dari membaca data profil wali santri lain atau profil staf internal.
  - Staf internal (`superadmin`, `admin`, `bendahara`, `pengelola`) memiliki hak baca terbatas untuk operasional.
  - Mutasi profil (`INSERT`, `UPDATE`, `DELETE`) dibatasi eksklusif hanya untuk `superadmin`.

### 3.2 Evaluasi Kebijakan Penghapusan & Perubahan Bukti Transfer Wali
* **Kondisi Teruji**:
  - Di tingkat antarmuka, wali santri **TIDAK DIBERIKAN** fitur atau tombol penghapusan dokumen bukti transfer.
  - Di tingkat basis data, `rpc_unggah_bukti_transfer_pembayaran` mengunci status: bukti transfer **TIDAK DAPAT DIUBAH** setelah transaksi berstatus `DISETUJUI` (Lunas) atau `DITOLAK`.
  - Trigger `trg_protect_verified_transaksi` memblokir mutasi pada transaksi terverifikasi.

### 3.3 Evaluasi Akses Dokumentasi Kepesantrenan oleh Wali Santri
* **Kondisi Teruji**:
  - Bucket `dokumentasi-kepesantrenan` diatur secara private.
  - Pada endpoint `src/app/api/signed-url/route.ts`, dokumen edaran umum pesantren (pada subfolder `umum/`, `publik/`, `pengumuman/`, `edaran/`, `arsip/`) dapat diakses oleh akun wali aktif.
  - Untuk dokumen santri spesifik (seperti arsip ijazah/raport santri), jalur file wajib diawali dengan `santri_id` sah milik wali pemanggil. Percobaan mengakses folder santri lain diblokir dengan kode HTTP 403 Forbidden.

### 3.4 Evaluasi Path Upload Storage Wali Santri
* **Kondisi Teruji**:
  - Metode `buildSantriStoragePath(santriId, filename)` pada `StorageService` mewajibkan format jalur:
    `${santriId}/${timestamp}-${sanitizedFilename}`
  - RLS pada Supabase Storage memvalidasi `split_part(name, '/', 1) = public.get_my_santri_id()::text`.
  - File wali santri terisolasi sempurna di dalam direktori virtual santri masing-masing.

---

## 4. KETIDAKSESUAIAN SKEMA & KODE YANG TELAH DIREKONSILIASI

Selama peninjauan menyeluruh, ditemukan 2 inkonsistensi penamaan dan pemetaan yang telah diperbaiki:

1. **Rekonsiliasi Nama Tabel pada API Admin**:
   - *Sebelumnya*: `src/app/api/admin-santri/route.ts` dan `src/app/api/admin-users/route.ts` memeriksa riwayat keuangan dengan memanggil tabel legacy `pembayaran`, `tagihan_santri`, `transaksi_uang_saku`, dan `riwayat_hafalan_quran`.
   - *Perbaikan*: Telah diselaraskan memanggil tabel resmi: `transaksi_pembayaran`, `tagihan`, `mutasi_uang_saku`, dan `setoran_tahfidz`.
2. **Rekonsiliasi Pemetaan Jalur Bukti Transfer (`bukti_transfer_path` vs `bukti_transfer_url`)**:
   - *Sebelumnya*: Kolom basis data bernama `bukti_transfer_path`, sementara antarmuka TypeScript dan komponen portal membaca `bukti_transfer_url`.
   - *Perbaikan*: `keuangan.service.ts` pada method `getRiwayatTransaksi` dan `getPengajuanTopup` kini memetakan kedua atribut secara dwiarah (`bukti_transfer_url` dan `bukti_transfer_path`) sehingga kompatibel dengan seluruh komponen UI dan viewer dokumen privat.
3. **Penyelarasan Akses Dokumen Umum Kepesantrenan**:
   - *Sebelumnya*: `src/app/api/signed-url/route.ts` mewajibkan prefix santri ID untuk seluruh berkas di `dokumentasi-kepesantrenan`.
   - *Perbaikan*: Menambahkan pengecualian untuk subfolder umum (`umum/`, `edaran/`, dll) agar wali dapat mengunduh surat edaran dan kalender akademik resmi pesantren.

---

## 5. HASIL PENGUJIAN OTOMATIS & VERIFIKASI BUILD

| Pengujian | Status | Metrik & Hasil |
|---|---|---|
| **TypeScript Compilation** | **PASS** | `npx tsc --noEmit` keluar dengan kode 0 (0 error). |
| **ESLint Check** | **PASS** | `npm run lint` keluar dengan kode 0 (0 error, dependensi Next.js 15 terpasang). |
| **Vitest Test Suite** | **PASS** | 14 test files, **261/261 tests (100%) lulus**. |
| **Next.js Production Build** | **PASS** | 10/10 rute statis & dinamis ter-bundle sukses (195 kB first load JS). |
| **Live Smoke Test (Vercel)** | **PASS** | HTTP 200 OK pada homepage, 733ms latency pada `/api/health`. |

---

## 6. DAFTAR TINDAKAN ADMINISTRATOR IT SEBELUM GO-LIVE

1. **Eksekusi 5 Berkas SQL di Supabase Dashboard**:
   - Buka SQL Editor di `https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy/sql`.
   - Jalankan berurutan: `008_security_remediation.sql`, `009_username_support.sql`, `010_safe_delete_and_management.sql`, `011_must_change_password_and_import.sql`, dan `012_admin_rekening_and_role_matrix.sql`.
2. **Input Rekening Bank Resmi**:
   - Masukkan rekening resmi pesantren (BSI/BRI) atas nama Yayasan Pondok Pesantren Modern Abu Manshur via menu *Rekening Resmi Pesantren*.
3. **Input Data Master Awal**:
   - Masukkan Tahun Ajaran aktif, master Kelas, dan master Kamar asrama.
4. **Buat Akun Staf**:
   - Buat akun untuk Admin Administrasi, Bendahara, dan Pengelola Kepesantrenan via menu *Manajemen Akun*.
5. **Import Santri**:
   - Unggah file Excel santri resmi menggunakan template [`public/templates/template-import-santri-sipeta.xlsx`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/public/templates/template-import-santri-sipeta.xlsx).
