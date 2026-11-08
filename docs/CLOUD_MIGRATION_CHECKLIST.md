# CHECKLIST MIGRASI SUPABASE CLOUD — SIPETA
**Pondok Pesantren Modern Abu Manshur**  
**Project Reference**: `jvhzrhfzkjqzlhsvvbgy`  
**Target URL**: `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`  
**Status**: STANDBY — Menunggu Persetujuan Eksekusi Pengguna

---

## 1. Persiapan Pra-Migrasi (Pre-Flight Checks)

- [x] Kredensial URL & Key format diverifikasi (`sb_publishable_...` dan `sb_secret_...`).
- [x] Konektivitas PostgREST & Auth terbukti hidup (`CONNECTED_EMPTY_SCHEMA`).
- [x] Zero leak check pada client bundle `.next/static`.
- [x] Database lokal PGlite lolos seluruh 32 integration tests dan 52 unit tests (total 84 tests passed).
- [x] Seluruh temuan C-01, H-01, M-01, dan L-01 telah ditutup (CLOSED) dan teruji.
- [x] Nomor rekening placeholder dihapus dari `seed.sql`; mekanisme konfigurasi Superadmin siap.
- [ ] Pengguna memberikan instruksi eksplisit untuk memulai migrasi cloud.

---

## 2. Urutan Eksekusi Migrasi SQL Bertahap

Migrasi cloud **WAJIB** dijalankan sesuai urutan hierarkis berikut:

| Urutan | Berkas Migrasi | Target Objek yang Dibuat | Verifikasi Pasca-Eksekusi |
| :---: | :--- | :--- | :--- |
| **Langkah 1** | `0001_enums_and_extensions.sql` | 2 Extension, 10 Enum, Function `set_updated_at` | `SELECT count(*) FROM pg_type WHERE typname = 'user_role';` -> 1 |
| **Langkah 2** | `0002_core_admin_tables.sql` | 8 Tabel Administrasi Inti & Profil | `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('profiles', 'santri', 'wali_santri');` -> 3 |
| **Langkah 3** | `0003_payment_and_billing_tables.sql` | 6 Tabel Pembayaran & Tagihan | `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('jenis_pembayaran', 'tagihan', 'transaksi_pembayaran');` -> 3 |
| **Langkah 4** | `0004_pocket_money_ledger_tables.sql` | 3 Tabel Uang Saku Santri | `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('saldo_uang_saku', 'mutasi_uang_saku');` -> 2 |
| **Langkah 5** | `0005_kepesantrenan_and_audit_tables.sql` | 10 Tabel Kepesantrenan & Audit | `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('setoran_tahfidz', 'audit_logs', 'notifikasi');` -> 3 |
| **Langkah 6** | `0006_atomic_rpcs_and_triggers.sql` | 15 Stored Functions, RPCs, & Triggers | `SELECT count(*) FROM pg_proc WHERE proname LIKE 'rpc_%';` -> 7 RPC |
| **Langkah 7** | `0007_rls_and_storage_policies.sql` | 27 RLS Tables, 4 Storage Buckets, 8 Storage Policies, Permissions | `SELECT count(*) FROM pg_policies WHERE schemaname = 'public';` -> 43 Policies |
| **Langkah 8** | `seed.sql` *(Setelah disetujui)* | Master Data Kelas, Kamar, Pelanggaran, Jenis Pembayaran | `SELECT count(*) FROM public.kelas;` -> 3 |

---

## 3. Prosedur Inisialisasi Akun Superadmin Resmi Pertama

Setelah migrasi skema dan seed selesai:
1. Daftarkan akun pimpinan pesantren via Supabase Auth Admin API (menggunakan `createSupabaseServerAdminClient`):
   - Email resmi: misal `pimpinan@abumanshur.ponpes.id`
   - Role: `superadmin`
2. Tambahkan profil di tabel `public.profiles`:
   ```sql
   INSERT INTO public.profiles (id, nama_lengkap, email, no_telepon, role, is_active)
   VALUES ('<auth_uid_pimpinan>', 'Pimpinan Pondok Pesantren', 'pimpinan@abumanshur.ponpes.id', '08xxxxxxxxxx', 'superadmin', true);
   ```
3. Uji login melalui antarmuka web SIPETA.

---

## 4. Prosedur Verifikasi Kesehatan Pasca-Migrasi

Jalankan pengujian end-to-end verifikasi pasca-migrasi:
1. Panggil endpoint `/api/health`. Pastikan status koneksi berubah dari `CONNECTED_EMPTY_SCHEMA` menjadi:
   ```json
   {
     "isConfigured": true,
     "isConnected": true,
     "connectionState": "CONNECTED_HEALTHY",
     "mode": "supabase_live"
   }
   ```
2. Pastikan badge header di `src/app/page.tsx` menampilkan:
   `[•] Supabase Project Khusus Terhubung`
3. Uji pembacaan data master kelas dan kamar dari Supabase Cloud.

---

## 5. Prosedur Rollback Darurat (Emergency Rollback)

Jika terjadi kesalahan sintaksis atau kegagalan fatal pada langkah tertentu:
1. Setiap langkah migrasi yang gagal akan di-rollback secara transaksional (`BEGIN ... ROLLBACK`).
2. Jangan melakukan `DROP SCHEMA public CASCADE` kecuali database benar-benar masih kosong dan disetujui oleh pengembang.
3. Catat pesan error PostgreSQL, perbaiki skrip migrasi lokal, dan ulangi pengujian di PGlite sebelum menyentuh cloud kembali.

