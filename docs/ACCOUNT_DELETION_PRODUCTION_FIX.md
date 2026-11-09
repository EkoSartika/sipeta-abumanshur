# Laporan Perbaikan Kritis: Fitur Hapus Akun SIPETA di Produksi

**Tanggal:** 9 November 2026  
**Status:** Terverifikasi & Lulus Pengujian Menyeluruh  
**Lingkup:** Modul Kelola Akun Superadmin, Endpoint `DELETE /api/admin-users`, Sinkronisasi State Supabase  

---

## 1. Ringkasan Masalah di Produksi

Pada halaman **Superadmin > Kelola Akun**:
1. Menekan tombol **Hapus** pada akun menghasilkan pesan kesalahan:  
   `"Pengguna tidak ditemukan dalam sistem database."`
2. Memilih beberapa akun lalu menekan **Hapus Akun Terpilih** (Bulk Delete) menghasilkan pesan yang sama.
3. Akun tetap muncul dan tidak terhapus dari sistem.

---

## 2. Analisis & Akar Masalah (Root Causes)

Berdasarkan pelacakan menyeluruh dari UI, context, API server, hingga Supabase Cloud:

### Akar Masalah 1: Postgres UUID Syntax Error (`22P02`) pada Endpoint Server
- Endpoint `DELETE /api/admin-users` sebelumnya langsung melakukan kueri:
  ```typescript
  adminClient.from("profiles").select("*").eq("id", userId);
  ```
- Kolom `id` pada tabel `public.profiles` bertipe **PostgreSQL UUID**.
- Jika `userId` yang dikirim dari frontend berupa string biasa (misalnya ID akun simulasi `usr-admin-01`, `admin123`, `@admin`, atau username), PostgreSQL secara otomatis membatalkan kueri dengan error kode:
  ```
  code: '22P02', message: 'invalid input syntax for type uuid: "usr-admin-01"'
  ```
- Driver Supabase mengembalikan `data: null`, yang oleh server API dianggap sebagai `!targetUser`, sehingga mengembalikan pesan:
  `"Pengguna tidak ditemukan dalam sistem database."`

### Akar Masalah 2: Akun Simulasi (`INITIAL_USERS`) Tertinggal di Tampilan Produksi
- Pada `src/lib/store/sipeta-context.tsx`, fungsi `refreshFromSupabase()` awalnya dipanggil **sebelum** sesi autentikasi `authService.getCurrentProfile()` selesai diverifikasi.
- Akibatnya, pemanggilan `GET /api/admin-users` mengembalikan HTTP 401 (unauthenticated), dan data profil yang ditarik kosong (`[]`).
- State pengguna di frontend tetap mempertahankan akun contoh statis (`usr-admin-01`, `usr-tu-01`, dll.).
- Ketika Superadmin mencoba menghapus baris akun simulasi ini, server menolaknya karena akun simulasi tersebut memang tidak pernah ada di Supabase Cloud.

### Akar Masalah 3: Portal Superadmin Tidak Melakukan Auto-Refresh Saat Dibuka
- Komponen `SuperadminPortal` sebelumnya tidak memiliki `useEffect` pemanggilan `refreshFromSupabase()` saat komponen dimount, sehingga bergantung pada cache memori awal aplikasi.

---

## 3. Solusi & Perbaikan Komprehensif

### A. Backend: Multi-Strategy User Resolution (`src/app/api/admin-users/route.ts`)
Endpoint `DELETE /api/admin-users` (baik untuk single delete maupun bulk delete) diperbaiki dengan mekanisme resolusi multi-strategi:

1. **Pemeriksaan Format UUID (`isUuid`)**:
   - Jika parameter adalah UUID yang valid, kueri langsung dilakukan ke `profiles.id`.
2. **Pencarian Melalui Username (`normalizeUsername`)**:
   - Jika bukan UUID, sistem mencari berdasarkan kolom `profiles.username` (case-insensitive, mendukung prefix `@`).
3. **Pencarian Melalui Email Sintetis & Riil**:
   - Sistem mencari kecocokan pada `profiles.email` (baik email riil maupun domain internal `@santri.abu-manshur.sch.id` / `.invalid`).
4. **Pembersihan Akun Simulasi (`usr-*`)**:
   - Jika ID yang dikirim merupakan ID simulasi statis (`usr-*`), sistem membersihkannya dari tampilan lokal dan mengembalikan status `DELETED` tanpa error crash.
5. **Penanganan Orphan Auth User**:
   - Jika profil tidak ditemukan di database tetapi ID-nya masih ada di Supabase Auth, sistem tetap membersihkan entri Supabase Auth secara bersih.
6. **Resolusi UUID Target Konsisten**:
   - Setelah pengguna ditemukan, seluruh operasi relasi (cek transaksi, relasi `wali_santri`, audit logs, penghapusan Supabase Auth) menggunakan UUID database yang sudah terverifikasi.

### B. Proteksi Integritas Database & Keamanan Akun
1. **Proteksi Superadmin Mutlak**:
   - Akun Superadmin utama (`af7315fd-a82f-4c73-9bd1-4967d038ae7e`, `sipetaabumanshur@gmail.com`, `superadmin`) dicegah secara mutlak agar tidak bisa dihapus atau dinonaktifkan.
2. **Proteksi Self-Deletion**:
   - Superadmin yang sedang aktif tidak dapat menghapus akunnya sendiri.
3. **Soft-Delete Otomatis untuk Akun dengan Riwayat Finansial**:
   - Akun staf atau wali yang memiliki catatan transaksi (SPP, mutasi kas, top-up uang saku) otomatis dialihkan ke mode **Nonaktif (Soft Delete)** dengan pesan edukatif, menjaga integritas buku kas pesantren.
4. **Pelepasan Relasi Wali Santri**:
   - Menghapus akun Wali Santri hanya menghapus relasi di tabel `public.wali_santri` dan `public.profiles`. Data santri, kelas, kamar, dan riwayat akademik tetap utuh dan aman.

### C. Sinkronisasi Frontend & Real-time State (`src/lib/store/sipeta-context.tsx`)
1. **Urutan Inisialisasi Autentikasi yang Benar**:
   - `authService.getCurrentProfile()` dieksekusi terlebih dahulu. Setelah sesi Supabase aktif, barulah `refreshFromSupabase()` dijalankan dengan kredensial yang valid.
2. **Pembersihan Mock Users Otomatis**:
   - Saat dalam mode Supabase aktif (`authMode === "supabase"`), semua ID berawalan `usr-` otomatis disaring dan dibersihkan dari state `users`.
3. **Pembaruan Optimistik & Refetch Otomatis**:
   - Setelah eksekusi single delete atau bulk delete berhasil, state pengguna lokal langsung dimutakhirkan (baik dihapus maupun ditandai nonaktif) dan disinkronkan kembali via `refreshFromSupabase()`.

### D. UI Portal Superadmin (`src/modules/superadmin/superadmin-portal.tsx`)
- Ditambahkan `useEffect(() => { refreshFromSupabase(); }, [refreshFromSupabase])` agar setiap kali portal Superadmin dimuat, data akun pengguna selalu merupakan data live dari Supabase Cloud.

---

## 4. Hasil Verifikasi & Pengujian

### 1. Automated Vitest Test Suite (`tests/superadmin-full-account-management.test.ts`)
Seluruh 15 skenario pengujian komprehensif lulus 100%:
- Tambah akun untuk 5 role (Admin, TU, Bendahara, Asatidz, Wali Santri).
- Validasi username duplikat, format username, dan kekuatan password.
- Penghapusan akun staf tanpa riwayat transaksi (hard delete).
- Pelepasan relasi `wali_santri` tanpa menghapus santri (data santri tetap ada).
- Soft-delete akun yang memiliki transaksi keuangan aktif.
- Hapus massal (Bulk Delete) multi-akun dengan ringkasan akurat.
- Resolusi multi-strategi (hapus via UUID, username, dan `@username`).
- Pembersihan akun simulasi `usr-*`.
- Proteksi mutlak akun Superadmin utama & pencegahan self-deletion.

```text
✓ tests/superadmin-full-account-management.test.ts (15 tests) 1282ms
Test Files  1 passed (1)
Tests       15 passed (15)
Duration    2.49s
```

### 2. TypeScript Compilation Check (`tsc --noEmit`)
- **Status:** Lulus tanpa error (Exit code: 0).

### 3. Production Build (`npm run build`)
- **Status:** Berhasil mengompilasi seluruh 21 rute (halaman portal dan endpoint API).
- Tidak ada error sintaks, SSR, atau type mismatch.
