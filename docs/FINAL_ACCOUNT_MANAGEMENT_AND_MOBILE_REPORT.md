# LAPORAN FINAL PENGEMBANGAN SIPETA: MANAJEMEN AKUN INTERNAL & RESPONSIVE MOBILE

**Pondok Pesantren Modern Abu Manshur — Plered, Cirebon**  
*Tanggal: 9 November 2026*  
*Versi Aplikasi: v1.0 Production Ready*  
*Status: Lulus Seluruh Uji Mutu (177/177 Tests Passed, TypeScript 0 Error, Production Build 100% Sukses)*

---

## 1. Ringkasan Eksekutif

Sesuai instruksi pengembangan, sistem SIPETA telah diperbarui secara menyeluruh pada dua pilar utama:
1. **Kebijakan Identitas & Manajemen Akun Internal Pengguna**:
   - Menghapus ketergantungan pada email Gmail atau email pribadi untuk seluruh pengguna internal (Admin, Bendahara, Pengelola Kepesantrenan, dan Orang Tua/Wali Santri).
   - Memperkenalkan sistem autentikasi berbasis **Username Alfanumerik** (`[a-z0-9_.-]{3,30}`) yang dipetakan secara aman ke domain sintetis internal reserved IETF RFC 2606/6761 (`@akun.sipeta.invalid`).
   - Akun Superadmin tetap menggunakan email resmi terdaftar di Supabase Auth (`sipetaabumanshur@gmail.com`).
   - Tidak ada pendaftaran mandiri (self-registration) publik; pembuatan dan pengelolaan akun dikontrol penuh oleh Superadmin melalui antarmuka dashboard resmi dan server-side API yang terlindungi.
2. **Desain Responsif Mobile-First (Android & iOS)**:
   - Seluruh halaman, modal, tabel, dan portal peran telah dioptimalkan untuk perangkat mobile (360×800, 375×812, 390×844, 430×932), tablet (768×1024), dan desktop (1280×800 hingga 1920×1080).
   - Ukuran target sentuh interaktif (touch targets) memenuhi standar aksesibilitas minimum **44×44px**.
   - Setiap tabel data dilengkapi pembungkus `overflow-x-auto` dengan lebar minimum aman (`min-w-[650px]` - `min-w-[750px]`) serta alternatif tampilan kartu (*Card View*) khusus layar smartphone.

---

## 2. Arsitektur Identitas & Pemetaan Akun Internal

### A. Kebijakan Identitas Pengguna

| Peran (Role) | Mekanisme Login | Format Identifier | Keterangan Kebijakan |
|---|---|---|---|
| **Superadmin** | Email Resmi + Kata Sandi | `sipetaabumanshur@gmail.com` | Email resmi pesantren di Supabase Auth |
| **Admin** | Username + Kata Sandi | `admin01`, `admin_keuangan` | Petugas administrasi santri & tagihan |
| **Bendahara** | Username + Kata Sandi | `bendahara01`, `bendahara_putra` | Pejabat verifikasi keuangan & rekening |
| **Pengelola** | Username + Kata Sandi | `pengelola01`, `ustadz_ahmad` | Asatidz & pengasuh asrama/kepesantrenan |
| **Wali Santri** | Username + Kata Sandi | `wali_zaki`, `wali_aisyah` | Orang Tua/Wali Santri (Relasi 1:1 Wajib) |

### B. Pemetaan Domain Sintetis Reserved (`@akun.sipeta.invalid`)
Supabase Auth secara arsitektural mewajibkan format email standar RFC 5322 untuk tabel `auth.users`. Agar pengguna internal tidak perlu menggunakan email Gmail atau email pribadi yang rawan salah ketik dan kebocoran data, SIPETA menggunakan IETF Reserved Top-Level Domain `.invalid` (RFC 2606 dan RFC 6761):

$$\text{username} \longrightarrow \text{username} + \text{"@akun.sipeta.invalid"}$$

Karakteristik Keamanan Domain `.invalid`:
- Dijamin oleh IANA/IETF tidak akan pernah ada server email di internet yang menerima lalu lintas ke domain ini.
- Akun dibuat dengan `email_confirm: true` melalui Supabase Admin API sehingga tidak pernah ada email verifikasi/spam keluar ke internet.
- Pengguna hanya melihat dan mengingat username mereka di layar (misalnya `bendahara01`), sedangkan pemetaan sintetis terjadi secara transparan di layer autentikasi sistem.

---

## 3. Implementasi Keamanan Server-Side (`/api/admin-users`)

Seluruh mutasi akun dilindungi di sisi server untuk mencegah *Privilege Escalation* dan kebocoran `SUPABASE_SECRET_KEY`:

### A. Endpoint `POST /api/admin-users` (Pembuatan Akun)
1. **Verifikasi Sesi Server**: Memeriksa sesi cookie pemanggil via `createSupabaseServerClient().auth.getUser()`.
2. **Pengecekan Otoritas Superadmin**: Melakukan query langsung ke `public.profiles` untuk memverifikasi bahwa pemanggil berstatus `role = 'superadmin'` dan `is_active = true`.
3. **Validasi Password**: Memastikan password memiliki panjang minimal 8 karakter dan kombinasi huruf serta angka.
4. **Verifikasi Unik Username**: Memeriksa tabel `profiles` agar tidak ada username duplikat.
5. **Relasi 1:1 Wali Santri**: Khusus peran `wali`, memverifikasi bahwa santri terkait belum memiliki akun wali lain (sesuai Bab 2 PRD).
6. **Provisioning Akun**: Menggunakan `adminClient.auth.admin.createUser` dengan flag `email_confirm: true`.
7. **Audit Log Otomatis**: Mencatat aktivitas ke tabel `public.audit_logs`. **Kata sandi tidak pernah dicatat pada log demi menjaga kerahasiaan.**

### B. Endpoint `PATCH /api/admin-users` (Pengelolaan Akun)
Mendukung 3 aksi aman via discriminated union:
- `RESET_PASSWORD`: Mengatur ulang kata sandi pengguna via `adminClient.auth.admin.updateUserById(userId, { password })`.
- `TOGGLE_ACTIVE`: Mengaktifkan atau menonaktifkan akun.
  - *Proteksi 1*: Superadmin dilarang menonaktifkan akunnya sendiri.
  - *Proteksi 2*: Sistem menolak penonaktifan jika akun merupakan Superadmin aktif terakhir.
- `UPDATE_PROFILE`: Memperbarui nama lengkap, nomor telepon, dan peran pengguna dengan penjagaan agar Superadmin terakhir tidak dapat diturunkan perannya (*anti-lockout*).

---

## 4. Antarmuka Manajemen Akun Superadmin

File modul: `src/modules/superadmin/superadmin-portal.tsx`

Fitur yang diimplementasikan:
1. **Statistik Pengguna Real-Time**: Ringkasan Total Akun, Akun Aktif, Akun Wali (1:1), dan Petugas Internal.
2. **Pencarian & Multi-Filter**:
   - Kolom pencarian teks (*live search*) yang mencakup nama lengkap, username, atau email.
   - Filter dropdown berdasarkan Peran (Semua, Superadmin, Admin, Bendahara, Pengelola, Wali).
   - Filter dropdown berdasarkan Status (Semua, Aktif Saja, Nonaktif Saja).
3. **Tampilan Kartu Mobile (< 768px)**:
   - Kartu mandiri untuk setiap pengguna yang menampilkan username berawalan `@`, peran, nomor kontak, relasi santri asuhan, dan status aktif.
   - Tiga tombol aksi sentuh yang nyaman: **Edit Profil**, **Reset Sandi**, dan **Aktifkan/Nonaktifkan**.
4. **Tampilan Tabel Desktop (≥ 768px)**:
   - Tabel responsif dengan `overflow-x-auto` dan lebar minimum aman (`min-w-[750px]`).
5. **Modal Terpandu**:
   - Modal Pembuatan Akun Baru dengan petunjuk kebijakan username tanpa Gmail.
   - Modal Atur Ulang Kata Sandi dengan indikator keamanan.
   - Modal Ubah Profil Pengguna dengan proteksi akun aktif.

---

## 5. Audit & Optimasi Responsive Mobile First

Tinjauan pengujian responsivitas pada berbagai resolusi layar:

| Viewport | Perangkat Sasaran | Hasil Pengujian & Optimasi |
|---|---|---|
| **360 × 800** | Android Standar (Samsung Galaxy A-series) | Bebas horizontal overflow; formulir login publik rapi; kartu pengguna satu kolom; touch target $\ge 44\text{px}$. |
| **375 × 812** | iPhone X / 11 / 12 Mini | Tampilan header dan tombol logout proporsional; tipografi responsif. |
| **390 × 844** | iPhone 13 / 14 / 15 / 16 | Header navigasi tidak terpotong; modal input keyboard virtual tidak merusak layout. |
| **430 × 932** | iPhone Pro Max / Plus | Spasi grid kartu optimal; papan pengumuman tampil estetis. |
| **768 × 1024** | iPad / Tablet Android | Transisi mulus antara tata letak kartu dan tabel desktop; tabulasi responsif. |
| **1280 × 800** | Laptop / MacBook Air | Tabel dengan lebar penuh; semua tombol aksi tampil sejajar. |
| **1920 × 1080** | Layar Desktop Full HD | Kontainer dibatasi `max-w-7xl` di tengah layar; bayangan dan kontras tajam. |

---

## 6. Verifikasi Mutu & Hasil Pengujian

Seluruh tahapan verifikasi kualitas (*Quality Gate*) telah dijalankan dan lulus 100%:

```
Test Files  9 passed (9)
     Tests  177 passed (177)
  Duration  13.53s
```

1. **Vitest Automated Testing**:
   - `tests/internal-account-and-username.test.ts` (19 tests) — **LULUS 100%**
   - `tests/production-auth-and-logout.test.ts` (10 tests) — **LULUS 100%**
   - `tests/sipeta-business-rules.test.ts` (11 tests) — **LULUS 100%**
   - `tests/sipeta-comprehensive-audit.test.ts` (19 tests) — **LULUS 100%**
   - `tests/supabase-backend-integration.test.ts` (24 tests) — **LULUS 100%**
   - `tests/final-authorization.test.ts` (28 tests) — **LULUS 100%**
   - `tests/supabase-real-postgres.test.ts` (40 tests) — **LULUS 100%**
   - `tests/migration-008-audit.test.ts` (12 tests) — **LULUS 100%**
   - `tests/bootstrap-superadmin.test.ts` (14 tests) — **LULUS 100%**
   - **Total: 177 Pengujian Berhasil, 0 Gagal.**
2. **TypeScript Strict Typecheck**:
   - Perintah: `npx tsc --noEmit`
   - Hasil: **Exit Code 0 (0 Error)**
3. **Next.js Production Build**:
   - Perintah: `npm run build`
   - Hasil: **Exit Code 0 (Sukses Penuh)**
   - Seluruh route halaman dan API berhasil dioptimasi ke bundle produksi.
4. **Audit Kebocoran Kredensial**:
   - Pemindaian regex pada `.next/static` untuk `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, dan `sbp_*`.
   - Hasil: **0 Temuan. Seluruh secret key aman di sisi server.**

---

## 7. File Migrasi Database Tambahan

Telah disiapkan skrip migrasi database `supabase/migrations/009_username_support.sql` yang mendefinisikan:
- Penambahan kolom `username TEXT` pada tabel `public.profiles`.
- Unique Index `idx_profiles_lower_username` dengan ekspresi `LOWER(username)` untuk menjamin integritas keunikan *case-insensitive*.
- Check Constraint `profiles_username_format_check` dengan regex `^[a-z0-9_.-]{3,30}$`.
- Skrip migrasi data (*backfill*) untuk akun Superadmin dan pengguna awal.
- Sesuai kebijakan keamanan, migrasi ini tersedia di repositori kode untuk dieksekusi oleh DBA / Superadmin saat diinginkan tanpa modifikasi otomatis ke cloud.

---

## 8. Kesimpulan

Pengembangan sistem manajemen akun pengguna internal berbasis username dan optimasi responsif mobile telah berhasil diselesaikan secara paripurna, aman, dan mematuhi seluruh batasan arsitektur Pondok Pesantren Modern Abu Manshur. Aplikasi siap untuk dilakukan commit Git dan push ke remote GitHub repository.
