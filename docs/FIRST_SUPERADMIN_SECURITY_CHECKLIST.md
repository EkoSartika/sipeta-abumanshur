# SIPETA — FIRST SUPERADMIN SECURITY CHECKLIST
## Checklist Keamanan Inisialisasi Akun Superadmin Pertama (Final Hardened Patch)

Dokumen ini memuat daftar periksa keamanan (*security checklist*) wajib sebelum, saat, dan sesudah inisialisasi akun Superadmin pertama SIPETA (`sipetaabumanshur@gmail.com`).

---

## 1. Verifikasi Identitas & Proteksi Kredensial

- [ ] **Alamat Email Resmi**: Dipastikan menggunakan email resmi pengelola: `sipetaabumanshur@gmail.com`.
- [ ] **Zero Password Exposure**: Kata sandi dibuat secara mandiri oleh pemilik proyek langsung di Supabase Dashboard. Tidak ada kata sandi yang diketik ke file proyek, Git commit, skrip SQL, atau obrolan asisten AI.
- [ ] **Standar Kekuatan Kata Sandi**: Kata sandi memenuhi kriteria minimum:
  - Minimal 12–16 karakter.
  - Kombinasi huruf besar (A-Z), huruf kecil (a-z), angka (0-9), dan simbol spesial (!@#$%^&*).
  - Tidak menggunakan informasi publik pesantren atau tanggal lahir pengelola.
- [ ] **Zero Secret Key Exposure**: Tidak ada `SUPABASE_SECRET_KEY` atau `service_role` key yang dimasukkan ke dalam file SQL atau dikirimkan ke client-side.

---

## 2. Pengaturan Supabase Auth Dashboard

- [ ] **Registrasi Terkendali (No Open Sign-up)**: Registrasi akun publik untuk umum dinonaktifkan (hanya akun yang didaftarkan oleh Superadmin atau diundang yang dapat masuk).
- [ ] **Auto Confirm User**: Opsi *"Auto Confirm User?"* dicentang saat pembuatan akun di Dashboard untuk menghindari kegagalan login akibat token verifikasi email tertunda.
- [ ] **Pencegahan Akun Duplikat**: Dipastikan email `sipetaabumanshur@gmail.com` belum pernah didaftarkan sebelumnya di project Supabase ini.

---

## 3. Integritas Skema & Row Level Security (RLS)

- [ ] **Isolasi RLS**: RLS pada tabel `public.profiles` tetap aktif (`ENABLE ROW LEVEL SECURITY`).
- [ ] **Pembatasan Hak Akses**:
  - Operasi `INSERT`, `UPDATE`, `DELETE` pada `public.profiles` tetap dibatasi secara ketat hanya untuk `superadmin` (`public.get_my_role() = 'superadmin'`).
  - Pengguna biasa atau publik (`anon`) tidak memiliki izin menulis ke tabel `profiles`.
- [ ] **Pemberian Hak Eksekusi Bootstrap**: Skrip bootstrap `supabase/bootstrap/001_first_superadmin.sql` hanya dijalankan melalui Supabase Dashboard SQL Editor (role `postgres`), bukan melalui API publik.
- [ ] **Pencegahan Eskalasi Hak Akses**: Fungsi `public.get_my_role()` memvalidasi `is_active = true`. Akun yang berstatus `is_active = false` secara otomatis kehilangan hak akses administratif.

---

## 4. Keamanan Skrip Bootstrap (`001_first_superadmin.sql`) — Patch Temuan 1 & 2

- [ ] **Perlindungan Konkurensi**: Memperoleh `pg_advisory_xact_lock` sebelum melakukan pemeriksaan data apa pun, mencegah *race condition* eksekusi simultan.
- [ ] **Deteksi Duplikasi Case-Insensitive pada Auth (Temuan 1)**: Skrip menghitung `count(*) WHERE lower(email) = lower(v_target_email)` pada `auth.users` dan menolak jika ditemukan > 1 akun.
- [ ] **Deteksi Duplikasi Case-Insensitive pada Profiles (Temuan 1)**: Skrip menghitung `count(*) WHERE lower(email) = lower(v_target_email)` pada `public.profiles` dan menolak jika ditemukan > 1 profil.
- [ ] **Transaksi Atomik**: Seluruh logika dibungkus dalam blok PL/pgSQL `DO $$ BEGIN ... END $$;`. Jika ada kondisi prasyarat yang tidak terpenuhi, seluruh proses langsung di-rollback.
- [ ] **Validasi Keberadaan Auth User**: Skrip memeriksa keberadaan akun pada `auth.users`. Jika belum dibuat, skrip gagal dengan pesan peringatan yang jelas.
- [ ] **Validasi Email Confirmation**: Skrip memeriksa apakah `confirmed_at` tidak `NULL`.
- [ ] **Pemeriksaan Profil Terpisah (UUID vs Email)**:
  - Pemeriksaan `WHERE id = v_auth_user_id` dilakukan secara terpisah.
  - Pemeriksaan `WHERE lower(email) = lower(v_target_email)` dilakukan secara terpisah.
  - Memverifikasi bahwa UUID dan Email benar-benar menunjuk pada baris profil yang sama persis (`v_profile_by_id.id = v_profile_by_email.id`).
- [ ] **Pemeriksaan Superadmin Lain Konsisten (Temuan 2)**: Pemeriksaan keberadaan Superadmin lain dijalankan **sebelum** jalur idempotensi atau insert. Jika ditemukan Superadmin lain, proses langsung dihentikan (`RAISE EXCEPTION`), sekalipun akun target sudah aktif.
- [ ] **Strict Idempotency**: Jika profil Superadmin yang tepat sudah ada dan aktif serta tidak ada Superadmin lain, proses berhenti aman dengan `NOTICE` tanpa memodifikasi data.
- [ ] **Proteksi Profil Nonaktif**: Jika profil Superadmin ditemukan dalam keadaan `is_active = false`, proses **DITOLAK KERAS** dan tidak diaktifkan otomatis, mewajibkan investigasi manual.
- [ ] **Zero Database Mutation on Auth**: Skrip tidak memodifikasi data pada schema `auth` (tidak mengubah password, email, atau status konfirmasi).

---

## 5. Verifikasi Pasca-Bootstrap (Post-Execution Verification)

Jalankan kueri verifikasi dan pastikan checklist berikut terpenuhi:

- [ ] `auth_user_id` sama dengan `profile_id` (Relasi Foreign Key 1:1 valid).
- [ ] `profile_email` adalah `sipetaabumanshur@gmail.com`.
- [ ] `profile_role` bernilai tepat `'superadmin'`.
- [ ] `profile_is_active` bernilai `true`.
- [ ] `total_superadmin_count` bernilai tepat `1`.

---

## 6. Pengujian Sesi & Hak Akses Frontend

- [ ] **Login Berhasil**: Superadmin dapat login menggunakan email dan password di antarmuka SIPETA.
- [ ] **Portal Terbuka**: Pengguna langsung diarahkan ke Dashboard Superadmin dengan hak akses penuh:
  - Form pembuatan akun staf baru (`Admin`, `Bendahara`, `Pengelola`, `Wali`).
  - Form pengaturan rekening resmi tunggal pesantren (`public.rekening_pesantren`).
  - Tampilan catatan audit sistem (`public.audit_logs`).
- [ ] **Proteksi Endpoint API**: Panggilan ke `/api/admin-users` oleh akun non-superadmin atau unauthenticated menghasilkan respon `401 Unauthorized` atau `403 Forbidden`.
- [ ] **Logout Sempurna**: Sesi Supabase Auth terputus secara bersih saat pengguna memilih opsi keluar.

---

## 7. Pernyataan Kesiapan Operasional

Setelah seluruh item di atas dicentang oleh Pemilik Proyek:
- Status Sistem: **SUPERADMIN ACTIVE & OPERATIONAL**
- Langkah Selanjutnya: Konfigurasi Rekening Resmi Pesantren melalui antarmuka Superadmin portal SIPETA.
