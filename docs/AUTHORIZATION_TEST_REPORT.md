# LAPORAN PENGUJIAN AUTORISASI & AKSES KONTROL (SIPETA)
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur
**Tanggal:** 8 November 2026  
**Status Evaluasi:** **100% Lulus Pengujian Keamanan Hak Akses**  
**Dokumen Referensi:** PRD v1.0 Bab 3 & 4

---

## 1. Arsitektur Autentikasi Server-Side & Session Refresh

1. **Middleware Keamanan (`src/middleware.ts`):**
   - Menggunakan `@supabase/ssr` untuk menyegarkan cookie sesi pada setiap request HTTP.
   - Menyisipkan HTTP Security Headers standar perbankan:
     - `X-Frame-Options: DENY` (Anti Clickjacking)
     - `X-Content-Type-Options: nosniff` (Anti MIME Sniffing)
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
2. **Pemeriksaan Role di Tingkat Server (Anti Privilege Escalation):**
   - Browser client tidak pernah dipercaya saat mengirimkan klaim role.
   - Sesi pengguna diidentifikasi melalui token JWT (`auth.uid()`).
   - Role pengguna diambil dari database PostgreSQL menggunakan fungsi terproteksi:
     ```sql
     CREATE OR REPLACE FUNCTION public.get_my_role()
     RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER
     SET search_path = public AS $$
         SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true LIMIT 1;
     $$;
     ```
   - Jika akun tidak aktif (`is_active = false`), `get_my_role()` mengembalikan `NULL`, sehingga seluruh kebijakan RLS otomatis menolak akses.

---

## 2. Pengujian Server-Side Account Provisioning (`/api/admin-users`)

Endpoint `/api/admin-users` diuji untuk skenario keamanan kritis:

| Skenario Pengujian | Input / Kondisi | Respon yang Diharapkan | Hasil Pengujian |
|---|---|---|---|
| **Pemanggilan Tanpa Login** | Request POST tanpa token JWT | HTTP 401 Unauthorized | **LULUS** (Akses Ditolak) |
| **Pemanggilan oleh Role Non-Superadmin** | Request POST dari Admin / Bendahara / Wali | HTTP 403 Forbidden | **LULUS** (Hanya Superadmin Berwenang) |
| **Pemanggilan oleh Akun Nonaktif** | Superadmin dengan `is_active = false` | HTTP 403 Forbidden | **LULUS** (Akun Nonaktif Ditolak) |
| **Validasi Relasi 1:1 Wali Santri** | Mendaftarkan wali baru untuk santri yang sudah punya akun wali | HTTP 409 Conflict | **LULUS** (Pencegahan Duplikasi Akun Wali) |
| **Perlindungan Service Role Key** | Bundle JS browser client diperiksa | Tidak ada string service_role di client | **LULUS** (Hanya Runtime Server) |
| **Pencatatan Audit Trail** | Pendaftaran akun berhasil | Row baru terbit di `public.audit_logs` | **LULUS** (Aktivitas Tercatat Rinci) |

---

## 3. Pengujian Penegakan Relasi 1:1 Wali Santri

- Sesuai Keputusan Bisnis PRD Bab 2: *Satu akun orang tua untuk satu santri.*
- Penegakan ganda diterapkan:
  1. **Level Database:** Constraint unik `UNIQUE (santri_id)` pada tabel `public.wali_santri`.
  2. **Level API Server:** Endpoint `/api/admin-users` mengecek keberadaan relasi aktif sebelum memproses pendaftaran.
- Hasil Uji: Upaya menambahkan akun wali kedua untuk santri yang sama digagalkan secara atomik oleh constraint database.

---

## 4. Pengujian Akses Lintas Santri (Multi-Tenant Isolation)

Diuji menggunakan 2 akun wali berbeda pada database PostgreSQL 16:
- **Wali 1 (`wali.hafidz@abumanshur.id`):** Terhubung ke Santri 1 (`san-01`).
- **Wali 2 (`wali.aisyah@abumanshur.id`):** Terhubung ke Santri 2 (`san-02`).

**Hasil Pengujian RLS:**
- Wali 1 menjalankan `SELECT * FROM public.santri`: **Menerima 1 baris (Santri 1).**
- Wali 1 menjalankan `SELECT * FROM public.tagihan WHERE santri_id = 'san-02'`: **Menerima 0 baris (Ditolak RLS).**
- Wali 1 menjalankan `SELECT * FROM public.saldo_uang_saku WHERE santri_id = 'san-02'`: **Menerima 0 baris (Ditolak RLS).**
- Wali 1 menjalankan `SELECT * FROM public.mutasi_uang_saku WHERE santri_id = 'san-02'`: **Menerima 0 baris (Ditolak RLS).**

---

## 5. Pengujian Pemisahan Akses Pengelola dari Keuangan

- Akun Pengelola Kepesantrenan menjalankan query ke tabel keuangan:
  - `SELECT * FROM public.transaksi_pembayaran`: **0 baris.**
  - `SELECT * FROM public.alokasi_pembayaran`: **0 baris.**
  - `SELECT * FROM public.pengajuan_uang_saku`: **0 baris.**
  - `SELECT * FROM public.saldo_uang_saku`: **0 baris.**
  - `SELECT * FROM public.mutasi_uang_saku`: **0 baris.**
- Pengelola mencoba mengeksekusi `rpc_verifikasi_pembayaran`: **Ditolak dengan Exception: Hanya Bendahara yang berwenang.**

---

## 6. Pengujian Eksklusivitas Bendahara pada Transaksi Finansial

- Admin mencoba menyetujui transaksi via RPC: **Ditolak dengan Exception database.**
- Superadmin mencoba menyetujui pembayaran via RPC: **Ditolak dengan Exception database.**
- Bendahara aktif menyetujui pembayaran: **Berhasil**, alokasi tagihan diperbarui secara atomik.

