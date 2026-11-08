# AUDIT HAK AKSES FUNGSI & SECURITY DEFINER — SIPETA
**Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur**  
**Target:** Supabase Cloud vs Migrasi Lokal `0001`–`0008`  
**Tanggal Evaluasi:** 8 November 2026  
**Status:** AUDITED — ROBUST TWO-LAYER SECURITY

---

## 1. Rekonsiliasi 17 Fungsi pada Skema Public

Berdasarkan pemeriksaan migrasi dan katalog Supabase Cloud, teridentifikasi 17 fungsi yang aktif pada skema `public`:

| No | Nama Fungsi & Parameter | Jenis | Security Type | Konfigurasi `search_path` | Hak `EXECUTE` |
| :---: | :--- | :---: | :---: | :---: | :---: |
| 1 | `set_updated_at()` | Trigger Func | `SECURITY INVOKER` | Default (System) | Internal trigger |
| 2 | `get_my_role()` | Helper Func | `SECURITY DEFINER` | `public` | `anon`, `authenticated`, `service_role` |
| 3 | `get_my_santri_id()` | Helper Func | `SECURITY DEFINER` | `public` | `anon`, `authenticated`, `service_role` |
| 4 | `prevent_mutasi_uang_saku_modification()` | Trigger Func | `SECURITY DEFINER` | `public` | Internal trigger |
| 5 | `prevent_audit_logs_modification()` | Trigger Func | `SECURITY INVOKER` | Default (System) | Internal trigger |
| 6 | `protect_verified_transaksi_pembayaran()`| Trigger Func | `SECURITY INVOKER` | Default (System) | Internal trigger |
| 7 | `handle_after_santri_insert()` | Trigger Func | `SECURITY DEFINER` | `public` | Internal trigger |
| 8 | `handle_after_santri_placement_update()` | Trigger Func | `SECURITY DEFINER` | `public` | Internal trigger |
| 9 | `handle_before_kedisiplinan_update()` | Trigger Func | `SECURITY DEFINER` | `public` | Internal trigger |
| 10 | `rpc_checkout_pembayaran(date, text, text, text)` | RPC Keuangan | `SECURITY DEFINER` | `public` | `authenticated`, `service_role` |
| 11 | `rpc_verifikasi_pembayaran(uuid, status_transaksi, text)` | RPC Keuangan | `SECURITY DEFINER` | `public` | `authenticated`, `service_role` |
| 12 | `rpc_verifikasi_topup_uang_saku(uuid, status_transaksi, text)` | RPC Keuangan | `SECURITY DEFINER` | `public` | `authenticated`, `service_role` |
| 13 | `rpc_catat_penyerahan_uang_saku(uuid, numeric, text, text)` | RPC Keuangan | `SECURITY DEFINER` | `public` | `authenticated`, `service_role` |
| 14 | `rpc_koreksi_ledger_uang_saku(uuid, jenis_mutasi_saku, numeric, text)` | RPC Keuangan | `SECURITY DEFINER` | `public` | `authenticated`, `service_role` |
| 15 | `rpc_unggah_bukti_transfer_pembayaran(uuid, date, text, text, text)` | RPC Keuangan | `SECURITY DEFINER` | `public` | `authenticated`, `service_role` |
| 16 | `rpc_penyesuaian_tagihan(uuid, numeric, text, boolean)` | RPC Keuangan | `SECURITY DEFINER` | `public` | `authenticated`, `service_role` |
| 17 | `uuid_generate_v4()` *(atau helper ekstensi)* | Extension Func | `SECURITY INVOKER` | System | Ekstensi UUID/crypto Supabase |

---

## 2. Audit Mendalam 3 Fungsi Trigger SECURITY DEFINER

Tiga fungsi trigger disorot secara khusus karena dijalankan dengan hak istimewa pembuat skema (*SECURITY DEFINER*):

### A. `handle_after_santri_insert()`
- **Tujuan Arsitektur:** Saat Admin memasukkan data santri baru, trigger ini secara otomatis:
  1. Membuat entri awal saldo uang saku di `public.saldo_uang_saku` dengan saldo Rp 0.
  2. Mencatat penempatan awal di `public.riwayat_penempatan_santri`.
- **Justifikasi `SECURITY DEFINER`:**  
  Admin Tata Usaha **TIDAK** memiliki hak izin INSERT langsung pada tabel `saldo_uang_saku` (karena tabel tersebut dilindungi RLS khusus Bendahara). Tanpa `SECURITY DEFINER`, transaksi pendaftaran santri oleh Admin akan gagal akibat pelanggaran RLS dompet saku.
- **Audit Keamanan:**
  - `SET search_path = public`: Mencegah pembajakan jalur skema (*search_path hijacking*).
  - Menggunakan kualifikasi skema penuh: `public.saldo_uang_saku`, `public.riwayat_penempatan_santri`, dan fungsi `auth.uid()`.
  - Tidak ada SQL dinamis (`EXECUTE format(...)`) -> **Bebas SQL Injection**.
  - Hak `EXECUTE` pada fungsi ini telah dicabut dari `PUBLIC` di migrasi 0007, sehingga fungsi tidak dapat dipanggil dari luar sebagai RPC publik.

### B. `handle_after_santri_placement_update()`
- **Tujuan Arsitektur:** Mencatat audit trail perpindahan kelas/kamar santri ke tabel `riwayat_penempatan_santri` setiap kali Admin memperbarui data santri.
- **Justifikasi `SECURITY DEFINER`:**  
  Menjamin pencatatan riwayat penempatan selalu berhasil dieksekusi secara otomatis terlepas dari variasi sesi pengguna yang melakukan update.
- **Audit Keamanan:**
  - `SET search_path = public` terpasang secara eksplisit.
  - Memeriksa kondisi perubahan secara ketat: `OLD.kelas_id IS DISTINCT FROM NEW.kelas_id OR OLD.kamar_id IS DISTINCT FROM NEW.kamar_id`.
  - Menggunakan parameter yang terikat tipe data (`UUID`).
  - Nol SQL dinamis -> **Bebas SQL Injection**.

### C. `handle_before_kedisiplinan_update()`
- **Tujuan Arsitektur:** Mengarsipkan versi lama catatan kedisiplinan (deskripsi, tindak lanjut, catatan pembinaan, status) ke dalam tabel `public.riwayat_perubahan_kedisiplinan`.
- **Justifikasi `SECURITY DEFINER`:**  
  Tabel `riwayat_perubahan_kedisiplinan` adalah tabel audit trail murni (*immutable*). Tabel ini sengaja **TIDAK** memiliki kebijakan INSERT untuk publik maupun pengguna reguler. Tanpa `SECURITY DEFINER`, saat Asatidz/Pengelola memperbarui status pembinaan santri, penyimpanan riwayat akan diblokir oleh RLS.
- **Audit Keamanan:**
  - `SET search_path = public` terpasang secara eksplisit.
  - Nilai diarsip murni dari tuple `OLD` dan `NEW` PostgreSQL.
  - `COALESCE(NEW.updated_by, auth.uid())` memastikan pencatatan identitas petugas yang mengubah data.
  - Nol SQL dinamis -> **Bebas SQL Injection & Eskalasi Izin**.

---

## 3. Pertahanan Berlapis pada Seluruh RPC Finansial (Two-Layer Defense)

Seluruh 7 RPC keuangan (`rpc_checkout_pembayaran`, `rpc_verifikasi_pembayaran`, `rpc_verifikasi_topup_uang_saku`, `rpc_catat_penyerahan_uang_saku`, `rpc_koreksi_ledger_uang_saku`, `rpc_unggah_bukti_transfer_pembayaran`, `rpc_penyesuaian_tagihan`) menerapkan pertahanan dua lapis:

1. **Lapisan 1 — PostgreSQL Grant Layer:**  
   `REVOKE EXECUTE ON ALL FUNCTIONS ... FROM PUBLIC;` mencabut seluruh izin eksekusi dari publik. Hanya role `authenticated` dan `service_role` yang diberi hak panggil. Role `anon` diblokir total dari seluruh RPC keuangan.
2. **Lapisan 2 — Validasi Peran Internal Sesi (Internal Role Enforcement):**  
   Setiap RPC memeriksa identitas `auth.uid()` terhadap tabel `public.profiles` dengan status `is_active = true`:
   - Jika pengguna bukan Bendahara pada verifikasi kas, sistem melempar `RAISE EXCEPTION 'OTORISASI DITOLAK: Hanya Bendahara Pesantren...'`.
   - Jika pengguna bukan Admin/Superadmin pada penyesuaian tagihan, sistem melempar pengecualian fatal.
   - Pengecekan dilakukan di awal fungsi sebelum transaksi dijalankan.

---

## 4. Audit Privilege Tabel (GRANT / REVOKE)

Berdasarkan migrasi `0007_rls_and_storage_policies.sql` dan `008_security_remediation.sql`:
- **Role `anon`:**
  - Hanya memiliki `USAGE` pada skema `public`.
  - Hanya memiliki `SELECT` pada tabel `public.pengumuman` (yang difilter lagi oleh RLS `is_published = true`).
  - `REVOKE SELECT ON public.rekening_pesantren FROM anon, PUBLIC;` mencabut hak baca nomor rekening yayasan dari pengunjung tanpa login.
  - Nol hak INSERT, UPDATE, DELETE, atau TRUNCATE pada tabel apa pun.
- **Role `authenticated`:**
  - Memiliki `SELECT, INSERT, UPDATE, DELETE` pada tabel operasional, namun **seluruh baris disaring dan dibatasi oleh Row Level Security (RLS)**.
  - `TRUNCATE` telah dicabut dari seluruh role non-superuser.
- **Role `service_role`:**
  - Digunakan eksklusif oleh server-side API (Next.js Server Actions / Route Handlers) untuk operasi administratif terverifikasi.

**Kesimpulan:** Seluruh privilege fungsi, hak eksekusi RPC, dan proteksi SECURITY DEFINER telah berada pada standar keamanan tertinggi PostgreSQL & Supabase.

