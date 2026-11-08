# DOKUMEN IMPLEMENTASI AUTENTIKASI & OTORISASI (SIPETA)
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur
**Tanggal:** 8 November 2026  
**Status Saat Ini:** **TERIMPLEMENTASI (Menunggu Project Supabase Khusus)**  
**Dokumen Referensi:** PRD Bab 3 & 4

---

## 1. Arsitektur Autentikasi Server-Verified

Autentikasi SIPETA dirancang untuk tidak pernah mempercayai data role yang dikirimkan oleh browser tanpa verifikasi ganda di tingkat server dan database:

```
[ Browser Client ]
       │
       ▼ (Credentials: Email & Password)
[ Supabase Auth (auth.users) ]
       │
       ▼ (Server Cookie Session / SSR)
[ Next.js Middleware & Server Client ]
       │
       ▼ (Query Verifikasi ke Database)
[ public.profiles ]
       ├── id (UUID = auth.uid())
       ├── role (user_role enum terproteksi)
       ├── is_active (boolean)
       └── santri_id (via public.wali_santri)
```

---

## 2. Server-Side Account Provisioning (`/api/admin/users`)

Untuk mencegah *Privilege Escalation* dan kebocoran `SUPABASE_SERVICE_ROLE_KEY`:
1. **Tidak Ada Kunci Admin di Client:** Kunci `service_role` tidak pernah diimpor ke dalam komponen React client atau bundle browser.
2. **Endpoint Terproteksi:** Pendaftaran akun baru dilakukan melalui Route Handler server `/api/admin/users`.
3. **Pemeriksaan Otorisasi Ganda di Server:**
   - Server memverifikasi sesi JWT pemanggil (`supabase.auth.getUser()`).
   - Server memeriksa `public.profiles` untuk membuktikan pemanggil memiliki role `superadmin` dan `is_active === true`.
   - Permintaan dari pengguna non-superadmin langsung ditolak dengan status HTTP 403 Forbidden.
4. **Penegakan Relasi 1:1 Wali Santri:**
   - Jika role yang dibuat adalah `wali`, server memeriksa apakah santri yang dituju sudah memiliki akun wali terdaftar.
   - Jika santri sudah memiliki akun wali, server menolak dengan HTTP 409 Conflict.
5. **Pencatatan Audit Trail:**
   - Setiap akun yang dibuat dicatat secara otomatis ke tabel `public.audit_logs`.

---

## 3. Penanganan Akun Nonaktif (`is_active: false`)

Sesuai Bab 3 PRD, Superadmin berhak menonaktifkan akun staf atau wali sewaktu-waktu:
- **Di Level Service (`auth.service.ts`):** Saat login, jika `profile.is_active === false`, sistem langsung memanggil `supabase.auth.signOut()` dan menolak sesi.
- **Di Level UI (`src/app/page.tsx`):** Jika akun yang aktif ditandai nonaktif, banner merah peringatan ditampilkan di layar utama dan seluruh aksi transaksi dibatasi.
- **Di Level Database (RLS):** Fungsi pembantu `get_my_role()` mengembalikan `NULL` jika pengguna tidak aktif, sehingga membatalkan seluruh hak akses RLS.

---

## 4. Matriks Wewenang 5 Role (Separation of Duties)

| Kemampuan / Fitur | Superadmin | Admin | Bendahara | Pengelola | Wali Santri |
|---|---|---|---|---|---|
| Provisioning Akun Baru | **Eksklusif** | Dilarang | Dilarang | Dilarang | Dilarang |
| Aktivasi / Nonaktif Akun | **Eksklusif** | Dilarang | Dilarang | Dilarang | Dilarang |
| Ganti Rekening Resmi BSI | **Eksklusif** | Dilarang | Dilarang | Dilarang | Dilarang |
| Kelola Santri, Kelas, Kamar | Read-Only | **Full** | Read-Only | Read-Only | Terisolasi Santri Sendiri |
| Terbitkan Tagihan Pembayaran | Read-Only | **Full** | Read-Only | Dilarang | Terisolasi Santri Sendiri |
| Checkout Pembayaran & Top-Up | Dilarang | Dilarang | Dilarang | Dilarang | **Full** (Santri Sendiri) |
| Verifikasi Pembayaran & Top-Up | Dilarang | Dilarang | **Eksklusif** | Dilarang | Dilarang |
| Serah Terima Fisik Uang Saku | Dilarang | Dilarang | **Eksklusif** | Dilarang | Dilarang |
| Jurnal Koreksi Ledger Uang Saku | Dilarang | Dilarang | **Eksklusif** | Dilarang | Dilarang |
| Input Mengaji & Tahfidz | Read-Only | Read-Only | Dilarang | **Full** | Terisolasi Santri Sendiri |
| Input Prestasi & Kedisiplinan | Read-Only | Read-Only | Dilarang | **Full** | Terisolasi Santri Sendiri |
| Audit Logs Viewer | **Full** | Dilarang | Dilarang | Dilarang | Dilarang |

---

## 5. Session Management & Pemulihan Sesi

- **Cookie SSR:** Sesi autentikasi disimpan dalam cookie terenkripsi HTTP-Only via `@supabase/ssr`.
- **Middleware Refresh:** `src/middleware.ts` memperbarui token pada setiap request tanpa mengganggu navigasi pengguna.
- **Session Recovery:** Saat browser di-refresh, `authService.getCurrentProfile()` memulihkan sesi dan profil secara mulus.
