# PANDUAN SETUP PROJECT SUPABASE KHUSUS SIPETA
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur
**Tanggal:** 8 November 2026  
**Status:** Dokumen Panduan Deployment Resmi  
**Target Database:** Supabase PostgreSQL Dedicated Project

---

## 1. Pendahuluan

Dokumen ini merupakan panduan langkah-demi-langkah bagi administrator/pengembang untuk menyiapkan **Project Supabase Resmi SIPETA**.

**Informasi Project Resmi:**
- **Project URL:** `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`
- **Project Reference:** `jvhzrhfzkjqzlhsvvbgy`

---

## 2. Langkah 1: Pembuatan Project Baru di Supabase Dashboard

1. Kunjungi [Supabase Dashboard](https://supabase.com/dashboard) dan masuk ke akun pengelola resmi pesantren.
2. Klik tombol **New Project**.
3. Pilih **Organization** resmi Yayasan Pondok Pesantren Modern Abu Manshur.
4. Masukkan konfigurasi project:
   - **Name:** `sipeta-pesantren-abumanshur`
   - **Database Password:** Buat kata sandi database yang kuat (minimal 16 karakter, simpan di password manager aman).
   - **Region:** Pilih **Singapore (`ap-southeast-1`)** untuk latensi terendah dari Indonesia.
   - **Pricing Plan:** Free Tier atau Pro Tier (sesuai kuota penyimpanan santri).
5. Klik **Create new project** dan tunggu proses inisialisasi selesai (sekitar 1–2 menit).

---

## 3. Langkah 2: Menjalankan Migrasi Database SQL (0001 s.d. 0007)

Buka menu **SQL Editor** pada Supabase Dashboard, kemudian jalankan berkas migrasi SQL secara **berurutan satu per satu**:

1. [**`0001_enums_and_extensions.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/0001_enums_and_extensions.sql)
   - Membuat enum tipe data (`user_role`, `status_santri`, `kebijakan_cicilan`, `status_transaksi`, `jenis_mutasi_saku`, dll.) dan ekstensi UUID.
2. [**`0002_core_admin_tables.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/0002_core_admin_tables.sql)
   - Membuat tabel master `profiles`, `rekening_pesantren`, `tahun_ajaran`, `kelas`, `kamar`, `santri`, `wali_santri`, dan `riwayat_penempatan_santri`.
3. [**`0003_payment_and_billing_tables.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/0003_payment_and_billing_tables.sql)
   - Membuat tabel `jenis_pembayaran`, `tagihan`, `keranjang_pembayaran`, `transaksi_pembayaran`, dan `alokasi_pembayaran`.
4. [**`0004_pocket_money_ledger_tables.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/0004_pocket_money_ledger_tables.sql)
   - Membuat tabel `saldo_uang_saku`, `pengajuan_uang_saku`, dan `mutasi_uang_saku`.
5. [**`0005_kepesantrenan_and_audit_tables.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/0005_kepesantrenan_and_audit_tables.sql)
   - Membuat tabel `perkembangan_mengaji`, `setoran_tahfidz`, `prestasi_santri`, `catatan_kedisiplinan`, `pengumuman`, `notifikasi`, dan `audit_logs`.
6. [**`0006_atomic_rpcs_and_triggers.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/0006_atomic_rpcs_and_triggers.sql)
   - Menginstal seluruh Stored Procedure (RPC atomik checkout, verifikasi, uang saku, penyesuaian) dan trigger immutability.
7. [**`0007_rls_and_storage_policies.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/0007_rls_and_storage_policies.sql)
   - Mengaktifkan Row Level Security (RLS) pada 27 tabel dan kebijakan akses storage.

---

## 4. Langkah 3: Menjalankan Seed Data Awal

Setelah seluruh migrasi berhasil dieksekusi:
1. Buka berkas [**`supabase/seed.sql`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/seed.sql).
2. Salin dan jalankan di **SQL Editor**.
3. Ini akan mengisikan rekening resmi BSI, tahun ajaran aktif 2026/2027, master kelas, asrama kamar, kategori pelanggaran, dan master jenis pembayaran awal.

---

## 5. Langkah 4: Pembuatan 4 Private Storage Buckets

Buka menu **Storage** pada Supabase Dashboard:
1. Klik **Create Bucket**.
2. Buat empat bucket dengan konfigurasi berikut:

| Nama Bucket | Public Bucket | File Size Limit | Allowed MIME Types |
|---|---|---|---|
| `bukti-pembayaran` | **TIDAK (Private)** | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| `bukti-uang-saku` | **TIDAK (Private)** | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| `foto-penyerahan-saku` | **TIDAK (Private)** | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| `dokumentasi-kepesantrenan` | **TIDAK (Private)** | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |

> [!NOTE]
> Seluruh bucket harus berstatus **Private**. Akses pembacaan hanya diberikan melalui Signed URLs temporer atau kebijakan RLS Storage yang telah terpasang di migrasi `0007`.

---

## 6. Langkah 5: Konfigurasi Environment Variables

Buka menu **Project Settings -> API** pada Supabase Dashboard:
1. Salin **Project URL**.
2. Salin **anon public key**.
3. Salin **service_role secret key**.
4. Buat file `.env.local` pada folder project SIPETA:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://jvhzrhfzkjqzlhsvvbgy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[ANON_PUBLIC_KEY]
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_SECRET_KEY]
NEXT_PUBLIC_APP_NAME="SIPETA - Pondok Pesantren Modern Abu Manshur"
```

5. Jika melakukan deployment ke **Vercel**, masukkan variabel yang sama pada menu **Settings -> Environment Variables** di dashboard Vercel.

---

## 7. Langkah 6: Verifikasi Koneksi Aktual (Health Check)

Setelah konfigurasi environment variable dipasang:
1. Jalankan aplikasi (`npm run dev` atau buka deployment URL).
2. Periksa endpoint kesehatan di browser:
   ```
   GET /api/health
   ```
3. Indikator di pojok kanan atas aplikasi SIPETA akan berubah dari:
   `Mode Simulasi Mandiri (Menunggu Project Supabase Khusus)`
   menjadi:
   `Supabase Project Khusus Terhubung` (Hijau Berkedip dengan catatan latensi milidetik).
4. Lakukan pengujian login menggunakan akun Superadmin resmi yang telah didaftarkan.

