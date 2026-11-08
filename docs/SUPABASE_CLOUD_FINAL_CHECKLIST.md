# PANDUAN & CHECKLIST EKSEKUSI MIGRATION 008 DI SUPABASE CLOUD
**Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur**
**Target Project:** `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`  
**Project Reference:** `jvhzrhfzkjqzlhsvvbgy`  
**File Migrasi:** `supabase/migrations/008_security_remediation.sql`

---

## 1. Prinsip Keamanan & Batasan Operasional

Sebelum menjalankan migrasi remediasi 008, pastikan mematuhi batasan berikut:
- **DILARANG menjalankan `seed.sql` pada Supabase Cloud** (rekening resmi dan data santri operasional wajib dimasukkan melalui portal aplikasi resmi).
- **DILARANG membuat akun superadmin secara sembarangan di auth dashboard** (gunakan flow inisialisasi resmi dengan verifikasi email yayasan).
- **Pastikan Project Reference tepat**: `jvhzrhfzkjqzlhsvvbgy`.
- Seluruh isi `008_security_remediation.sql` bersifat **idempotent** dan aman dijalankan pada database yang telah memiliki migration 0001–0007.

---

## 2. Langkah-Langkah Eksekusi di Supabase Cloud

### Langkah 1: Buka Supabase SQL Editor
1. Kunjungi [Supabase Cloud Dashboard](https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy).
2. Pada panel navigasi sebelah kiri, klik **SQL Editor**.
3. Buat tab kueri baru (**New Query**).

### Langkah 2: Salin Isi File Migrasi 008
1. Buka file lokal:
   `C:\Users\Eko\.gemini\antigravity\scratch\sipeta\supabase\migrations\008_security_remediation.sql`
2. Salin seluruh isi file (Bagian 1 s.d. Bagian 3).
3. Tempelkan (*paste*) ke dalam tab SQL Editor Supabase.

### Langkah 3: Eksekusi Skrip SQL
1. Klik tombol **Run** (atau tekan `Ctrl + Enter`).
2. Pastikan pesan keluaran menampilkan:
   `Success. No rows returned` (atau laporan sukses eksekusi).

---

## 3. Checklist Verifikasi Pasca Eksekusi (Post-Flight Verification)

Jalankan kueri verifikasi berikut pada SQL Editor untuk memvalidasi keberhasilan:

### A. Verifikasi Target Role RLS pada Skema Public
```sql
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
```
- **Kriteria Keberhasilan:**
  - 47 kebijakan menampilkan role `{authenticated}`.
  - 1 kebijakan pada tabel `pengumuman` (`Pengumuman: baca publik anon`) menampilkan role `{anon}`.
  - Tidak ada lagi kebijakan yang tertinggal dengan role default `{public}`.

### B. Verifikasi Pengetatan Privasi Wali pada Riwayat Kedisiplinan
```sql
SELECT 
    policyname, 
    qual 
FROM pg_policies 
WHERE tablename = 'riwayat_perubahan_kedisiplinan';
```
- **Kriteria Keberhasilan:**
  - Ekspresi `qual` memuat klausa `c.is_published_to_wali = true`.

### C. Verifikasi Deduplikasi Storage Policies
```sql
SELECT 
    policyname, 
    cmd 
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';
```
- **Kriteria Keberhasilan:**
  - Total kebijakan berjumlah tepat **12 kebijakan** (dari sebelumnya 13).
  - Kebijakan `Storage Foto Penyerahan: upload eksklusif bendahara` sudah terhapus.
  - Kebijakan `Storage Foto Penyerahan: kelola` dan `Storage Foto Penyerahan: baca` tetap aktif.

---

## 4. Status Akhir

Setelah ketiga verifikasi di atas terpenuhi, database Supabase Cloud SIPETA berstatus:  
**`READY FOR OPERATIONAL ONBOARDING & PILOT TESTING`**.

