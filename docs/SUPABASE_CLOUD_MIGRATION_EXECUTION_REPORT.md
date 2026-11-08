# LAPORAN PELAKSANAAN PREFLIGHT MIGRASI SUPABASE CLOUD — SIPETA
**Pondok Pesantren Modern Abu Manshur**  
**Target Project Reference**: `jvhzrhfzkjqzlhsvvbgy`  
**Target Project URL**: `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`  
**Waktu Pemeriksaan Preflight**: 8 November 2026, 20:10 WIB  
**Status Tahap**: **PREFLIGHT COMPLETED — MENUNGGU AKSES KONEKSI DATABASE DDL**

---

## 1. Rangkuman Preflight Pemeriksaan Awal

Sesuai dengan instruksi Bagian B (Preflight — Wajib Sebelum Eksekusi), telah dilakukan pemeriksaan menyeluruh terhadap kesiapan lingkungan eksekusi migrasi cloud:

| Parameter Preflight | Hasil Pemeriksaan Aktual | Evaluasi & Status |
| :--- | :--- | :--- |
| **Project Reference** | `jvhzrhfzkjqzlhsvvbgy` | **Valid & Sesuai** |
| **Target Project URL** | `https://jvhzrhfzkjqzlhsvvbgy.supabase.co` | **Valid & Sesuai** |
| **Supabase CLI** | Tidak terpasang di sistem (`CommandNotFoundException`) | **CLI Belum Tersedia** |
| **CLI Authentication / Link** | Belum tertaut ke `jvhzrhfzkjqzlhsvvbgy` | **Belum Tertaut** |
| **Kredensial DDL Database** | Publishable & Secret Key tersedia di `.env.local`, namun `DATABASE_URL` / password PostgreSQL belum ada | **Kredensial DDL Diperlukan** |
| **Kondisi Awal Database Cloud** | Skema `public` bersih (PostgREST HTTP 404 `PGRST205`), 0 akun terdaftar | **`CONNECTED_EMPTY_SCHEMA` (Steril)** |
| **Status Storage Buckets Cloud** | 0 bucket SIPETA dibuat | **Steril** |
| **Integritas Migration 0001–0007** | 7 Berkas kanonikal final remediasi C-01, H-01, M-01, L-01 | **Valid & Checksum Dicatat** |
| **Kepatuhan Batasan** | Tidak ada `seed.sql`, akun Superadmin, atau deployment dijalankan | **100% Patuh** |

---

## 2. Inventarisasi dan Checksum SHA-256 Berkas Migrasi Final

Seluruh berkas migrasi telah diverifikasi bebas dari nomor rekening placeholder (C-01), memiliki isolasi folder per santri (H-01), mencabut hak akses anon pada rekening (M-01), dan memblokir akun nonaktif pada master data (L-01):

| No | Berkas Migrasi | Algoritma | Nilai Checksum SHA-256 |
| :---: | :--- | :---: | :--- |
| **1** | `0001_enums_and_extensions.sql` | SHA-256 | `524DB73A93511EA6FCB02B689771653D3B415D86F78DFCE179072E18D7F76C64` |
| **2** | `0002_core_admin_tables.sql` | SHA-256 | `354B453E2D4BBFC55D769A52B19FBDB4680310111D9D873E5498D8E02A9B42E3` |
| **3** | `0003_payment_and_billing_tables.sql` | SHA-256 | `FE8CA9DE9FC9B16B8260D091928D0307E0BB84C8E739303D8D9CCE24E7D1F2AB` |
| **4** | `0004_pocket_money_ledger_tables.sql` | SHA-256 | `50A333D08F791B06A64FC153D9A46B41B0CB0DA472A1E5BF654EA881D23AA349` |
| **5** | `0005_kepesantrenan_and_audit_tables.sql`| SHA-256 | `92936FFB351D4D9BA14F397F21BE8C937FD2ED48EFAEB7A1840924C531433417` |
| **6** | `0006_atomic_rpcs_and_triggers.sql` | SHA-256 | `3EE92FFEA2F7B59095B8EED3050B63E3D7F11B94C9216EA3DCCC20C11DD8B0D8` |
| **7** | `0007_rls_and_storage_policies.sql` | SHA-256 | `CC167372BECBF8CDED8F1F9A6E14CC61E3249CB646A8719FA446276FD245B954` |

---

## 3. Kondisi Awal Database Cloud (Read-Only)

Melalui verifikasi jaringan ke Kong Gateway dan PostgREST:
1. **Skema Tabel**: Endpoint PostgREST merespons HTTP `404 Not Found` dengan kode `PGRST205` (*"Could not find the table 'public.rekening_pesantren' in the schema cache"*). Menandakan database belum memiliki tabel sama sekali.
2. **Migration History**: Belum ada riwayat migrasi Supabase yang tercatat.
3. **Pengguna Terdaftar**: Endpoint GoTrue Auth Admin melaporkan `0` pengguna.
4. **Storage Buckets**: Belum ada bucket privat SIPETA (`bukti-pembayaran`, `bukti-uang-saku`, `foto-penyerahan-saku`, `dokumentasi-kepesantrenan`).
5. **Objek yang Harus Dipertahankan**: Tidak ada objek asing atau tabel tak dikenal yang perlu dipertahankan. Skema 100% bersih.

---

## 4. Temuan Kebutuhan Akses DDL (Sesuai Aturan Preflight Bagian B)

Sesuai instruksi mutlak:
> *"Publishable key dan Secret API key bukan password PostgreSQL. Jangan menganggap keberadaan kedua key tersebut otomatis memberikan akses eksekusi SQL.*  
> *Jika kredensial database, akses CLI, atau autentikasi project belum tersedia, BERHENTI dan laporkan kebutuhan akses. Jangan meminta pengguna mengirim password atau secret ke percakapan."*

### Penjelasan Teknis:
1. Kunci `SUPABASE_SECRET_KEY` (service role) yang ada di `.env.local` memberikan akses administratif penuh ke PostgREST API (CRUD data) dan GoTrue Auth API, tetapi **PostgREST tidak menyediakan endpoint eksekusi DDL sembarang** (`CREATE TABLE`, `CREATE TYPE`, `CREATE POLICY`).
2. Untuk mengeksekusi berkas migrasi `0001` s.d. `0007` ke Supabase Cloud PostgreSQL, diperlukan jalur koneksi DDL:
   - **Opsi 1 (Disarankan via `.env.local`)**: Tambahkan variabel `DATABASE_URL` pada berkas `.env.local` secara lokal mandiri (tanpa mengirimkan ke chat percakapan):
     ```
     DATABASE_URL=postgresql://postgres:[PASSWORD-DATABASE]@db.jvhzrhfzkjqzlhsvvbgy.supabase.co:5432/postgres
     ```
     *(atau via port 6543 Pooler Supabase).*
   - **Opsi 2 (Via Supabase CLI)**: Pasang Supabase CLI dan jalankan autentikasi lokal:
     ```bash
     supabase login
     supabase link --project-ref jvhzrhfzkjqzlhsvvbgy
     ```
   - **Opsi 3 (Via Dashboard Web Supabase)**: Eksekusi berkas `0001` s.d. `0007` satu per satu melalui fitur **SQL Editor** pada Supabase Dashboard pengguna.

---

## 5. Kepatuhan Batasan Operasional
- [x] **TIDAK** menjalankan `seed.sql`.
- [x] **TIDAK** membuat akun Superadmin atau pengguna lain.
- [x] **TIDAK** memasukkan data santri operasional.
- [x] **TIDAK** mengonfigurasi rekening bank operasional.
- [x] **TIDAK** melakukan deployment Vercel.
- [x] **TIDAK** membocorkan kredensial atau rahasia apapun.

