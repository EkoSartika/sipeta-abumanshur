# DOKUMEN REKONSILIASI FINAL JUMLAH KEBIJAKAN RLS SIPETA
**Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur**  
**Target Database:** PostgreSQL 16 (Engine Identik Supabase Cloud)  
**Berkas Terverifikasi:** `supabase/migrations/008_security_remediation.sql`  
**Tanggal Verifikasi:** 8 November 2026  
**Keputusan Final:** **`APPROVED FOR CLOUD REVIEW`**

---

## 1. Ringkasan Eksekutif & Resolusi Ketidakkonsistenan Angka

Pemeriksaan koreksi mendalam telah dilakukan untuk menyelesaikan perbedaan angka antara **47 vs 48 policy authenticated**, **59 vs 61 total policy**, dan **1 policy anon**.

### Akar Masalah Perhitungan Sebelumnya:
1. **Asumsi Lama (Angka 47 & 59):**  
   Pada migrasi `0007`, skema `public` memiliki 48 policy. Asumsi teoretis sebelumnya menghitung bahwa 1 policy pada `pengumuman` dialihkan untuk `anon`, menyisakan 47 policy authenticated (48 - 1 = 47). Lalu 47 authenticated dijumlahkan dengan 12 storage menghasilkan angka 59.
2. **Kenyataan Arsitektur Aktual (Angka 48, 49, dan 61):**  
   Tabel `pengumuman` **tidak bisa** hanya memiliki policy `anon` untuk membaca, karena pengguna terautentikasi (Wali, Bendahara, Pengelola) tidak mewarisi hak `anon` di PostgreSQL. Agar pengguna terautentikasi dapat membaca pengumuman publik (dan Admin/Superadmin dapat membaca draft), tabel `pengumuman` **wajib** memiliki policy SELECT khusus untuk role `authenticated`.
   
   Dengan demikian, tabel `pengumuman` memiliki:
   - 1 policy SELECT untuk `anon` (`is_published = true`)
   - 1 policy SELECT untuk `authenticated` (`is_published = true OR role IN ('superadmin','admin')`)
   - 1 policy ALL untuk `authenticated` (`role IN ('superadmin','admin')`)
   Total policy pada `pengumuman` adalah **3 policy** (2 authenticated + 1 anon).

### Rekonsiliasi Angka Definitif Berdasarkan Kueri PostgreSQL:
- **Tabel Skema `public`**: Tepat **27 tabel** (seluruhnya RLS enabled).
- **Policy Skema `public` (role `authenticated`)**: Tepat **48 kebijakan** (46 pada 26 tabel + 2 pada `pengumuman`).
- **Policy Skema `public` (role `anon`)**: Tepat **1 kebijakan** (`Pengumuman: baca publik anon`).
- **Policy Skema `public` (role default `public`)**: Tepat **0 kebijakan** (bersih total).
- **Total Policy Skema `public`**: **49 kebijakan** (48 + 1).
- **Policy Skema `storage` (`storage.objects`)**: Tepat **12 kebijakan** (seluruhnya role `authenticated`).
- **Total Kebijakan Bertarget `authenticated` (public + storage)**: **60 kebijakan** (48 + 12).
- **Total Kebijakan Database Keseluruhan (public + storage)**: Tepat **61 kebijakan** (49 + 12).

---

## 2. Kueri PostgreSQL Aktual untuk Menghitung Policy

Kueri berikut dijalankan secara langsung pada database engine PostgreSQL 16 (PGlite) pasca-eksekusi migrasi `0001` s.d. `008`:

```sql
-- 1. Hitung policy skema public berdasarkan role
SELECT 
    schemaname,
    roles[1] AS target_role,
    COUNT(*) AS total_policy
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, roles[1]
ORDER BY target_role;

-- Hasil:
-- schemaname | target_role   | total_policy
-- -----------+---------------+-------------
-- public     | anon          |            1
-- public     | authenticated |           48

-- 2. Hitung policy storage.objects
SELECT 
    schemaname,
    tablename,
    roles[1] AS target_role,
    COUNT(*) AS total_policy
FROM pg_policies
WHERE schemaname = 'storage'
GROUP BY schemaname, tablename, roles[1];

-- Hasil:
-- schemaname | tablename | target_role   | total_policy
-- -----------+-----------+---------------+-------------
-- storage    | objects   | authenticated |           12

-- 3. Verifikasi ketiadaan policy berstatus default PUBLIC
SELECT COUNT(*) AS residual_public_policies
FROM pg_policies
WHERE schemaname = 'public' AND (roles = '{public}' OR roles = '{}' OR roles IS NULL);

-- Hasil:
-- residual_public_policies = 0
```

---

## 3. Daftar Lengkap 61 Kebijakan RLS (Nama, Tabel, Command, & Target Role)

Berikut adalah daftar lengkap 61 kebijakan hasil query aktual dari `pg_policies`:

| No | Skema & Tabel | Nama Kebijakan | Command | Target Role |
| :---: | :--- | :--- | :---: | :---: |
| 1 | `public.alokasi_pembayaran` | Alokasi Pembayaran: baca sesuai akses transaksi | `SELECT` | `authenticated` |
| 2 | `public.audit_logs` | Audit Logs: HANYA Superadmin yang dapat melihat | `SELECT` | `authenticated` |
| 3 | `public.catatan_kedisiplinan` | Kedisiplinan: kelola oleh pengelola & superadmin | `ALL` | `authenticated` |
| 4 | `public.catatan_kedisiplinan` | Kedisiplinan: baca oleh superadmin, admin, pengelola, atau wali | `SELECT` | `authenticated` |
| 5 | `public.jenis_pembayaran` | Jenis Pembayaran: kelola oleh admin & superadmin | `ALL` | `authenticated` |
| 6 | `public.jenis_pembayaran` | Jenis Pembayaran: baca untuk superadmin, admin, bendahara, wali | `SELECT` | `authenticated` |
| 7 | `public.kamar` | Master Kamar: kelola | `ALL` | `authenticated` |
| 8 | `public.kamar` | Master Kamar: baca | `SELECT` | `authenticated` |
| 9 | `public.kelas` | Master Kelas: kelola | `ALL` | `authenticated` |
| 10 | `public.kelas` | Master Kelas: baca | `SELECT` | `authenticated` |
| 11 | `public.keranjang_pembayaran` | Keranjang: wali hanya kelola keranjang santri miliknya | `ALL` | `authenticated` |
| 12 | `public.master_kategori_pelanggaran` | Master Kategori Pelanggaran: kelola oleh pengelola, admin & superadmin | `ALL` | `authenticated` |
| 13 | `public.master_kategori_pelanggaran` | Master Kategori Pelanggaran: baca oleh akun aktif terautentikasi | `SELECT` | `authenticated` |
| 14 | `public.mutasi_uang_saku` | Mutasi Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik | `SELECT` | `authenticated` |
| 15 | `public.notifikasi` | Notifikasi: hanya pemilik akun yang dapat membaca dan menandai dibaca | `SELECT` | `authenticated` |
| 16 | `public.notifikasi` | Notifikasi: pemilik akun update is_read | `UPDATE` | `authenticated` |
| 17 | `public.pengajuan_uang_saku` | Pengajuan Uang Saku: wali ajukan untuk santri miliknya | `INSERT` | `authenticated` |
| 18 | `public.pengajuan_uang_saku` | Pengajuan Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik | `SELECT` | `authenticated` |
| 19 | `public.pengumuman` | Pengumuman: kelola oleh admin & superadmin | `ALL` | `authenticated` |
| 20 | `public.pengumuman` | Pengumuman: baca oleh akun authenticated | `SELECT` | `authenticated` |
| 21 | `public.pengumuman` | Pengumuman: baca publik anon | `SELECT` | `anon` |
| 22 | `public.perkembangan_mengaji` | Mengaji: kelola oleh pengelola & superadmin | `ALL` | `authenticated` |
| 23 | `public.perkembangan_mengaji` | Mengaji: baca oleh superadmin, admin, pengelola, atau wali pemilik | `SELECT` | `authenticated` |
| 24 | `public.prestasi_santri` | Prestasi: kelola oleh pengelola & superadmin | `ALL` | `authenticated` |
| 25 | `public.prestasi_santri` | Prestasi: baca oleh superadmin, admin, pengelola, atau wali pemilik | `SELECT` | `authenticated` |
| 26 | `public.profiles` | Profiles: superadmin kelola semua akun | `ALL` | `authenticated` |
| 27 | `public.profiles` | Profiles: baca profil sendiri atau petugas internal | `SELECT` | `authenticated` |
| 28 | `public.rekening_pesantren` | Rekening Pesantren: hanya superadmin yang dapat mengelola | `ALL` | `authenticated` |
| 29 | `public.rekening_pesantren` | Rekening Pesantren: akun aktif terdaftar dapat melihat rekening aktif | `SELECT` | `authenticated` |
| 30 | `public.riwayat_penempatan_santri` | Riwayat Penempatan: admin & superadmin kelola | `INSERT` | `authenticated` |
| 31 | `public.riwayat_penempatan_santri` | Riwayat Penempatan: baca oleh petugas atau wali terkait | `SELECT` | `authenticated` |
| 32 | `public.riwayat_penyesuaian_tagihan` | Riwayat Penyesuaian Tagihan: catat oleh admin & superadmin | `INSERT` | `authenticated` |
| 33 | `public.riwayat_penyesuaian_tagihan` | Riwayat Penyesuaian Tagihan: baca untuk petugas admin dan bendahara | `SELECT` | `authenticated` |
| 34 | `public.riwayat_perubahan_kedisiplinan` | Riwayat Kedisiplinan: baca sesuai akses kedisiplinan | `SELECT` | `authenticated` |
| 35 | `public.saldo_uang_saku` | Saldo Uang Saku: baca oleh superadmin, bendahara, atau wali santri terkait | `SELECT` | `authenticated` |
| 36 | `public.santri` | Santri: admin & superadmin kelola data santri | `ALL` | `authenticated` |
| 37 | `public.santri` | Santri: petugas baca semua, wali HANYA baca santri yang terhubung | `SELECT` | `authenticated` |
| 38 | `public.setoran_tahfidz` | Tahfidz: kelola oleh pengelola & superadmin | `ALL` | `authenticated` |
| 39 | `public.setoran_tahfidz` | Tahfidz: baca oleh superadmin, admin, pengelola, atau wali pemilik | `SELECT` | `authenticated` |
| 40 | `public.tagihan` | Tagihan: admin & superadmin buat tagihan | `INSERT` | `authenticated` |
| 41 | `public.tagihan` | Tagihan: petugas keuangan/admin baca semua, wali hanya baca santri miliknya | `SELECT` | `authenticated` |
| 42 | `public.tagihan` | Tagihan: admin & superadmin ubah/sesuaikan tagihan | `UPDATE` | `authenticated` |
| 43 | `public.tahun_ajaran` | Master TahunAjaran: admin & superadmin kelola | `ALL` | `authenticated` |
| 44 | `public.tahun_ajaran` | Master TahunAjaran: baca oleh akun aktif berwenang | `SELECT` | `authenticated` |
| 45 | `public.target_tahfidz` | Target Tahfidz: kelola oleh pengelola, admin & superadmin | `ALL` | `authenticated` |
| 46 | `public.target_tahfidz` | Target Tahfidz: baca oleh akun aktif terautentikasi | `SELECT` | `authenticated` |
| 47 | `public.transaksi_pembayaran` | Transaksi Pembayaran: baca untuk superadmin, admin, bendahara, atau wali pemilik | `SELECT` | `authenticated` |
| 48 | `public.wali_santri` | Wali Santri: admin & superadmin kelola | `ALL` | `authenticated` |
| 49 | `public.wali_santri` | Wali Santri: baca data sendiri atau admin/superadmin/bendahara | `SELECT` | `authenticated` |
| 50 | `storage.objects` | Storage Foto Penyerahan: kelola | `ALL` | `authenticated` |
| 51 | `storage.objects` | Storage Kepesantrenan: upload dan kelola | `ALL` | `authenticated` |
| 52 | `storage.objects` | Storage Bukti Pembayaran: delete | `DELETE` | `authenticated` |
| 53 | `storage.objects` | Storage Bukti Uang Saku: delete | `DELETE` | `authenticated` |
| 54 | `storage.objects` | Storage Bukti Pembayaran: upload | `INSERT` | `authenticated` |
| 55 | `storage.objects` | Storage Bukti Uang Saku: upload | `INSERT` | `authenticated` |
| 56 | `storage.objects` | Storage Bukti Pembayaran: baca | `SELECT` | `authenticated` |
| 57 | `storage.objects` | Storage Bukti Uang Saku: baca | `SELECT` | `authenticated` |
| 58 | `storage.objects` | Storage Foto Penyerahan: baca | `SELECT` | `authenticated` |
| 59 | `storage.objects` | Storage Kepesantrenan: baca oleh akun aktif | `SELECT` | `authenticated` |
| 60 | `storage.objects` | Storage Bukti Pembayaran: update | `UPDATE` | `authenticated` |
| 61 | `storage.objects` | Storage Bukti Uang Saku: update | `UPDATE` | `authenticated` |

---

## 4. Pemeriksaan Khusus Tabel `pengumuman`

Tabel `public.pengumuman` diverifikasi memiliki 3 kebijakan terpisah dengan fungsi spesifik tanpa ada tumpang tindih berbahaya:

1. **`Pengumuman: baca oleh akun authenticated`**
   - **Command:** `SELECT`
   - **Target Role:** `authenticated`
   - **Syarat `USING`:** `is_published = true OR public.get_my_role() IN ('superadmin', 'admin')`
   - **Analisis Keamanan:** Wali, Bendahara, dan Pengelola yang sudah login hanya dapat membaca pengumuman resmi yang sudah terbit (`is_published = true`). Superadmin dan Admin dapat melihat seluruh pengumuman (termasuk draf yang belum terbit).
2. **`Pengumuman: baca publik anon`**
   - **Command:** `SELECT`
   - **Target Role:** `anon`
   - **Syarat `USING`:** `is_published = true`
   - **Analisis Keamanan:** Pengunjung landing page tanpa akun hanya dapat membaca pengumuman publik. Kueri draft internal (`is_published = false`) dari luar menghasilkan 0 baris (*zero data leakage*).
3. **`Pengumuman: kelola oleh admin & superadmin`**
   - **Command:** `ALL` (`INSERT`, `UPDATE`, `DELETE`, `SELECT`)
   - **Target Role:** `authenticated`
   - **Syarat `USING` / `WITH CHECK`:** `public.get_my_role() IN ('superadmin', 'admin')`
   - **Analisis Keamanan:** Hak membuat, menyunting, dan menghapus pengumuman dikunci eksklusif untuk Admin dan Superadmin. Wali, Bendahara, maupun Pengelola ditolak melakukan modifikasi data pengumuman.

**Kesimpulan:** Tidak ada duplikasi yang berlebihan atau celah eskalasi izin. Struktur 3 kebijakan ini adalah desain paling bersih dan aman dalam arsitektur Supabase RLS.

---

## 5. Pemeriksaan Ketiadaan Role Default `PUBLIC`

Berdasarkan pengecekan katalog `pg_policies`:
- **0 kebijakan** yang memiliki target default `{public}`.
- Seluruh 48 kebijakan public lama pada migrasi `0007` yang semula berstatus `{public}` telah digantikan dengan target peran eksplisit.

---

## 6. Hasil Pengujian Otomatis Menyeluruh Pasca-Rekonsiliasi

Seluruh test suite dijalankan ulang:

```
 RUN  v3.2.7 C:/Users/Eko/.gemini/antigravity/scratch/sipeta

 ✓ tests/sipeta-comprehensive-audit.test.ts (19 tests) 28ms
 ✓ tests/sipeta-business-rules.test.ts (11 tests) 24ms
 ✓ tests/supabase-backend-integration.test.ts (23 tests) 10ms
 ✓ tests/migration-008-audit.test.ts (12 tests) 1980ms
 ✓ tests/supabase-real-postgres.test.ts (40 tests) 2110ms

 Test Files: 5 passed (5)
 Tests:      105 passed (105)
 Duration:   3.45s
```

Pemeriksaan kompilasi & tipe:
- `npm run typecheck`: **Exit code 0 (0 error)**
- `npm run build`: **Compiled successfully in 8.5s (Exit code 0)**

---

## 7. Keputusan Akhir

### **KEPUTUSAN: `APPROVED FOR CLOUD REVIEW`**

Seluruh angka policy telah direkonsiliasi dengan bukti kueri PostgreSQL aktual:
- **48 policy authenticated pada skema public**
- **1 policy anon pada skema public**
- **49 policy total pada skema public**
- **12 policy pada skema storage**
- **60 policy bertarget authenticated total (public + storage)**
- **61 policy aktif keseluruhan di database**
- **0 policy bertarget default public**

Migration `supabase/migrations/008_security_remediation.sql` dinyatakan **LULUS REVIEW** dan siap diajukan untuk dieksekusi di Supabase Cloud.

*(Peringatan: Status ini secara tegas **BUKAN** `READY FOR PRODUCTION` sampai migrasi diterapkan di Cloud dan nomor rekening resmi yayasan diverifikasi oleh pimpinan pesantren).*

