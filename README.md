# SIPETA — Sistem Informasi Pelayanan Terpadu
## Pondok Pesantren Modern Abu Manshur (Plered - Cirebon)

[![Next.js 15](https://img.shields.io/badge/Next.js-15.5.29-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%2015+-emerald?logo=supabase)](https://supabase.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-261%20Passed-brightgreen)](https://github.com/EkoSartika/sipeta-abumanshur)
[![Production URL](https://img.shields.io/badge/Production-Live%20on%20Vercel-blue)](https://sipeta-abumanshur.vercel.app)

Sistem Informasi Pelayanan Terpadu (**SIPETA**) adalah platform tata kelola terpadu berbasis web dan *mobile-responsive* yang dibangun khusus untuk mengelola operasional, keuangan, kepengasuhan, dan akademik santri di **Pondok Pesantren Modern Abu Manshur**, Plered, Cirebon.

---

## 1. Tautan Penting

- **Repository GitHub**: [https://github.com/EkoSartika/sipeta-abumanshur](https://github.com/EkoSartika/sipeta-abumanshur)
- **Aplikasi Produksi**: [https://sipeta-abumanshur.vercel.app](https://sipeta-abumanshur.vercel.app)
- **Endpoint Pemeriksaan Kesehatan**: [https://sipeta-abumanshur.vercel.app/api/health](https://sipeta-abumanshur.vercel.app/api/health)

---

## 2. Fitur Utama & Keputusan Bisnis

1. **5 Role Resmi dengan Isolasi Hak Akses Ketat**:
   - **Superadmin (Pimpinan Pesantren)**: Masuk dengan email resmi `sipetaabumanshur@gmail.com`. Mengelola pengguna internal, mengonfigurasi rekening resmi BSI pesantren bersama Admin, dan memantau Jejak Audit (*Audit Log*).
   - **Admin Administrasi**: Masuk dengan username. Mengelola data santri, impor massal Excel beserta pembuatan akun wali otomatis, kelas, asrama/kamar, jenis tagihan, dan rekening resmi pesantren *(Migrasi 012)*.
   - **Bendahara Pesantren**: Masuk dengan username. Memverifikasi pembayaran transfer SPP, menerima cicilan tunai di kantor, mengelola saldo uang saku, serta mencatat penyerahan uang saku tunai ke santri dengan **wajib melampirkan foto fisik penyerahan**.
   - **Pengelola Kepesantrenan & Asrama**: Masuk dengan username. Mencatat setoran tahfidz Al-Qur'an (Hafalan Baru & Muroja'ah), mutaba'ah kitab kuning, prestasi santri, dan catatan pelanggaran disiplin beserta riwayat konseling pembinaan.
   - **Orang Tua / Wali Santri**: Masuk dengan **NIS sebagai Username** dan **NIS sebagai Password Awal**. Terhubung 1:1 dengan satu santri. Wajib mengganti password saat pertama kali login. Memantau tagihan, membayar cicilan transfer ke rekening BSI, mengajukan top-up uang saku, melihat foto bukti penyerahan uang jajan anak, serta memantau capaian tahfidz dan kedisiplinan.

2. **Kebijakan Non-Gmail untuk Akun Internal**:
   - Seluruh akun internal dan wali santri menggunakan identitas username dan NIS.
   - Sistem memetakan username ke email internal sintetis secara otomatis di sisi server (`@akun.sipeta.invalid`) tanpa pernah menampilkan domain sintetis tersebut ke pengguna.

3. **Integritas Relasional & Safe Delete**:
   - Mencegah penghapusan fisik santri yang memiliki riwayat transaksi keuangan atau akademik demi menjaga validitas laporan audit.
   - Menggunakan soft-delete (`deleted_at`) dan audit trail lengkap.

4. **Penyimpanan Berkas Privat (Private Storage Buckets)**:
   - Bukti transfer bank dan foto penyerahan uang saku disimpan dalam bucket privat (`public = false`).
   - Akses file diatur melalui *Time-limited Signed URL* berbatas waktu 15 menit melalui endpoint `/api/signed-url`.

---

## 3. Struktur Database & Migrasi (0001 s.d. 012)

Database dikelola menggunakan Supabase PostgreSQL dengan urutan migrasi idempoten pada folder `supabase/migrations/`:

| File Migrasi | Deskripsi & Komponen Utama |
|---|---|
| [`0001_enums_and_extensions.sql`](./supabase/migrations/0001_enums_and_extensions.sql) | Ekstensi `pgcrypto` dan 9 tipe data ENUM standar sistem. |
| [`0002_core_admin_tables.sql`](./supabase/migrations/0002_core_admin_tables.sql) | Tabel `profiles`, `tahun_ajaran`, `kelas`, `kamar`, `santri`, `wali_santri`, dan riwayat penempatan. |
| [`0003_payment_and_billing_tables.sql`](./supabase/migrations/0003_payment_and_billing_tables.sql) | Rekening bank tunggal BSI, tagihan santri, keranjang pembayaran, dan transaksi pembayaran. |
| [`0004_pocket_money_ledger_tables.sql`](./supabase/migrations/0004_pocket_money_ledger_tables.sql) | Saldo uang saku, pengajuan top-up, dan ledger `mutasi_uang_saku` (append-only). |
| [`0005_kepesantrenan_and_audit_tables.sql`](./supabase/migrations/0005_kepesantrenan_and_audit_tables.sql) | Setoran tahfidz, mutaba'ah kitab, kedisiplinan santri, prestasi, pengumuman, dan `audit_logs`. |
| [`0006_atomic_rpcs_and_triggers.sql`](./supabase/migrations/0006_atomic_rpcs_and_triggers.sql) | Trigger proteksi immutability audit log, ledger balance trigger, dan RPC transaksi atomik. |
| [`0007_rls_and_storage_policies.sql`](./supabase/migrations/0007_rls_and_storage_policies.sql) | Kebijakan Row Level Security (RLS) dan konfigurasi Private Storage Buckets. |
| [`008_security_remediation.sql`](./supabase/migrations/008_security_remediation.sql) | Rekonsiliasi kebijakan keamanan, hardening search path, dan revoke akses anonim dari tabel keuangan. |
| [`009_username_support.sql`](./supabase/migrations/009_username_support.sql) | Kolom `username`, constraint format regex `^[a-z0-9_.-]{3,30}$`, dan indeks unik case-insensitive. |
| [`010_safe_delete_and_management.sql`](./supabase/migrations/010_safe_delete_and_management.sql) | Kolom `deleted_at`, trigger proteksi penghapusan santri yang memiliki riwayat keuangan/tahfidz. |
| [`011_must_change_password_and_import.sql`](./supabase/migrations/011_must_change_password_and_import.sql) | Kolom `must_change_password` & indeks untuk kewajiban ganti sandi awal akun wali berbasis NIS. |
| [`012_admin_rekening_and_role_matrix.sql`](./supabase/migrations/012_admin_rekening_and_role_matrix.sql) | Otorisasi penuh pengelolaan rekening resmi BSI oleh Admin dan Superadmin. |

---

## 4. Cara Menjalankan Aplikasi Secara Lokal

### Prasyarat
- Node.js versi 18+ atau 20+
- npm atau pnpm

### Langkah Instalasi
```bash
# 1. Masuk ke direktori proyek
cd C:\Users\Eko\.gemini\antigravity\scratch\sipeta

# 2. Instalasi dependensi paket
npm install

# 3. Jalankan server pengembangan lokal
npm run dev
```

Buka peramban di [http://localhost:3000](http://localhost:3000).

---

## 5. Pengujian & Kualitas Kode

Sistem dilengkapi rangkaian pengujian otomatis (*Automated Test Suite*) menggunakan Vitest dan PGlite (In-memory PostgreSQL):

```bash
# Pemeriksaan tipe data TypeScript secara ketat
npm run typecheck

# Menjalankan seluruh 261 pengujian otomatis
npm test

# Menjalankan kompilasi Next.js production build
npm run build
```

---

## 6. Daftar Dokumentasi Resmi

Seluruh dokumen operasional dan spesifikasi teknis tersedia di folder `docs/`:

1. [Arsitektur Sistem SIPETA](./docs/ARSITEKTUR_SIPETA.md)
2. [Matriks Peran dan Hak Akses](./docs/MATRIKS_ROLE_DAN_HAK_AKSES.md)
3. [Dokumentasi Skema Database](./docs/DATABASE_SCHEMA.md)
4. [Dokumentasi 16 Alur Bisnis Resmi](./docs/ALUR_BISNIS_SIPETA.md)
5. [Panduan Operasional Admin Administrasi](./docs/PANDUAN_ADMIN.md)
6. [Panduan Operasional Bendahara Pesantren](./docs/PANDUAN_BENDAHARA.md)
7. [Panduan Operasional Pengelola Kepesantrenan](./docs/PANDUAN_PENGELOLA.md)
8. [Panduan Penggunaan Orang Tua / Wali Santri](./docs/PANDUAN_WALI_SANTRI.md)
9. [Prosedur Cadangan (Backup) & Pemulihan](./docs/PROSEDUR_BACKUP_RESTORE.md)
10. [Catatan Perubahan Sistem (Changelog)](./docs/CHANGELOG.md)
11. [Laporan Kesiapan Database & Runbook Migrasi](./docs/FINAL_DATABASE_READINESS.md)
12. [Laporan Akhir Kesiapan Produksi (Master Final Report)](./docs/FINAL_PRODUCTION_READINESS.md)

---

## 7. Lisensi & Hak Cipta

© 2026 **Pondok Pesantren Modern Abu Manshur**, Plered, Cirebon, Jawa Barat.  
Hak Cipta Dilindungi Undang-Undang.
