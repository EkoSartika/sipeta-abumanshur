# SIPETA — Sistem Informasi Pelayanan Terpadu
## Pondok Pesantren Modern Abu Manshur

Implementasi lengkap berdasarkan **Product Requirements Document (PRD) & Technical Specification Versi 1.0**.

---

## Fitur Utama & Keputusan Bisnis yang Diterapkan

1. **5 Role dengan Isolasi Hak Akses Ketat**:
   - **Superadmin**: Mengelola pengguna & role, konfigurasi rekening resmi tunggal pesantren, dan melihat Audit Log (tidak dapat menghapus/mengubah riwayat transaksi sah tanpa jurnal koreksi).
   - **Admin Administrasi**: Mengelola data santri, akun orang tua/wali (relasi 1:1), kelas & kamar (beserta riwayat penempatan), jenis pembayaran, kebijakan cicilan, generator tagihan, dan pengumuman.
   - **Bendahara Pesantren**: Satu-satunya role operasional yang berwenang memverifikasi & mengesahkan pembayaran tagihan, pengisian uang saku, serta mencatat penyerahan uang saku tunai dengan **wajib mengunggah foto penyerahan**.
   - **Pengelola Kepesantrenan**: Mencatat perkembangan mengaji, setoran tahfidz (Hafalan Baru & Murojaah), prestasi santri, serta catatan kedisiplinan & riwayat perubahan pembinaan (tanpa akses ke rincian keuangan).
   - **Orang Tua / Wali Santri**: Terhubung 1:1 dengan satu santri; memantau dashboard mobile-first, memilih tagihan & mencicil melalui keranjang pembayaran, mengajukan top-up uang saku, melihat bukti foto penyerahan uang saku, serta memantau mengaji, tahfidz, prestasi, dan kedisiplinan anak.

2. **Database PostgreSQL & Supabase (`supabase/migrations/`)**:
   - [`0001_enums_and_extensions.sql`](./supabase/migrations/0001_enums_and_extensions.sql): Tipe data enum standar SIPETA.
   - [`0002_core_admin_tables.sql`](./supabase/migrations/0002_core_admin_tables.sql): Tabel profil, rekening resmi tunggal (`idx_single_active_rekening_pesantren`), tahun ajaran, kelas, kamar, santri (`NIS` unik), wali santri (`UNIQUE(user_id)` & `UNIQUE(santri_id)` untuk relasi 1:1), dan riwayat penempatan.
   - [`0003_payment_and_billing_tables.sql`](./supabase/migrations/0003_payment_and_billing_tables.sql): Jenis pembayaran, tagihan (dengan *snapshot* kebijakan cicilan), keranjang pembayaran, transaksi pembayaran, dan alokasi multi-tagihan.
   - [`0004_pocket_money_ledger_tables.sql`](./supabase/migrations/0004_pocket_money_ledger_tables.sql): Saldo uang saku, pengajuan top-up, dan tabel ledger `mutasi_uang_saku` dengan constraint wajib foto penyerahan untuk mutasi `KELUAR`.
   - [`0005_kepesantrenan_and_audit_tables.sql`](./supabase/migrations/0005_kepesantrenan_and_audit_tables.sql): Mengaji, tahfidz, prestasi, kedisiplinan + riwayat perubahan, pengumuman, notifikasi, dan `audit_logs`.
   - [`0006_atomic_rpcs_and_triggers.sql`](./supabase/migrations/0006_atomic_rpcs_and_triggers.sql): Trigger immutability ledger & audit log, serta fungsi PostgreSQL RPC atomik (`rpc_checkout_pembayaran`, `rpc_verifikasi_pembayaran`, `rpc_verifikasi_topup_uang_saku`, `rpc_catat_penyerahan_uang_saku`, `rpc_koreksi_ledger_uang_saku`).
   - [`0007_rls_and_storage_policies.sql`](./supabase/migrations/0007_rls_and_storage_policies.sql): Kebijakan Row Level Security (RLS) dan konfigurasi Private Storage Buckets.

---

## Cara Menjalankan Proyek

```bash
npm install
npm run dev
```

Untuk menjalankan pengujian unit dan pemeriksaan tipe TypeScript strict:

```bash
npm run typecheck
npm test
npm run build
```

