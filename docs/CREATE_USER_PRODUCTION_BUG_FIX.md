# Laporan Perbaikan Bug Produksi: Gagal Membuat Akun Baru (toLowerCase of undefined)

**Tanggal:** 9 November 2026  
**Status:** Terverifikasi, Lulus 367 Vitest Tests, TypeCheck Bersih, ESLint Bersih, Production Build Sukses  
**Lingkup:** Modul Tambah Akun Superadmin, Endpoint `POST /api/admin-users`, Sinkronisasi State Supabase  

---

## 1. Masalah yang Terjadi di Produksi
Ketika Superadmin mengisi formulir **Tambah Akun Baru** pada halaman **Superadmin > Kelola Akun** dan menekan tombol **Simpan & Daftarkan Akun**, muncul error runtime:
```text
Cannot read properties of undefined (reading 'toLowerCase')
```
Akun baru tidak dapat didaftarkan dan formulir tertahan.

---

## 2. Investigasi & Akar Penyebab (Root Cause)

Pelacakan alur penyerahan formulir:
`superadmin-portal.tsx` $\to$ `sipeta-context.tsx` $\to$ `auth.service.ts` $\to$ `POST /api/admin-users`

### Akar Penyebab Utama:
1. **Pengecekan Duplikasi Email Tanpa Guard di Context (`sipeta-context.tsx`)**:
   Pada `createUserAccount` di `sipeta-context.tsx`:
   ```typescript
   if (finalEmail && users.some((u) => u.email.toLowerCase() === finalEmail.toLowerCase()))
   ```
   Di Supabase Cloud atau saat mapping profil, kolom `email` pada beberapa entri profil di memori/database bernilai `null` atau `undefined` (misalnya profil santri/wali hasil import atau profil pengguna baru yang belum memiliki email terisi).
   Pemanggilan langsung `u.email.toLowerCase()` tanpa null-check atau optional chaining (`u.email?.toLowerCase()` atau `u.email && ...`) menyebabkan eksekusi langsung melempar error:
   `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`.

2. **Payload Response `POST /api/admin-users` Tidak Mengembalikan `email`**:
   Pada response sukses `POST /api/admin-users`, object `data` yang dikembalikan ke client tidak memuat property `email: finalEmail`:
   ```typescript
   data: {
     id: newUserId,
     username: finalUsername,
     nama_lengkap: payload.nama_lengkap,
     // email tidak ada!
     role: payload.role,
     no_telepon: payload.no_telepon,
     is_active: true,
   }
   ```
   Ketika client menerima response ini dan memasukkannya ke state `users`, pengguna baru tersebut memiliki `email: undefined`, sehingga setiap operasi loop berikutnya langsung memicu error yang sama.

3. **Pencarian Pengguna di UI (`superadmin-portal.tsx`) Tanpa Guard**:
   Pada fungsi filtering daftar pengguna `filteredUsers`:
   ```typescript
   u.nama_lengkap.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
   ```
   Jika `u.email` atau `u.nama_lengkap` bernilai `undefined`, pemanggilan ini rentan melempar error yang sama.

---

## 3. Perbaikan yang Diterapkan

### A. Validasi & Normalisasi Aman di Context (`src/lib/store/sipeta-context.tsx`)
- Menggunakan safe checking `u.username && u.username.toLowerCase() === cleanUser.toLowerCase()` dan `u.email && u.email.toLowerCase() === finalEmail.toLowerCase()`.
- Menjamin sanitasi nama lengkap (minimal 3 karakter), username alfanumerik (3-30 karakter), password, dan nomor telepon default ke `"-"`.
- Menjamin object user yang ditambahkan ke state selalu memiliki nilai `email`, `username`, `nama_lengkap`, `role`, `no_telepon`, dan `is_active` yang terdefinisi lengkap.
- Mengamankan seluruh pemanggilan `.toLowerCase()` lain di context (`isDuplicate`, `verified_by_nama`, `petugas_nama`, `new_password`).

### B. Penyempurnaan Server Endpoint (`src/app/api/admin-users/route.ts`)
- Schema Zod `santri_id` kini menangani string kosong `""` atau `null` dengan aman via `.transform((v) => (!v || v.trim() === "" ? undefined : v.trim())).pipe(z.string().uuid().optional())`.
- Mengembalikan `email: finalEmail` serta `santri_id` di response payload `data`.
- Menjaga konsistensi 5 role resmi: `admin`, `tu`, `pengelola` (Asatidz), `bendahara`, dan `wali`.
- Memastikan proteksi penolakan mutlak untuk pembuatan akun role `superadmin`.
- Menjamin kompensasi atomik rollback (`auth.admin.deleteUser(newUserId)`) jika terjadi kegagalan saat insert ke tabel `public.profiles`.

### C. Penyempurnaan UI Form Tambah Akun (`src/modules/superadmin/superadmin-portal.tsx`)
- Menambahkan pengecekan safe guard pada filter pencarian dan preview username.
- Menambahkan input opsional penghubung ke santri (`santriList`) saat memilih role Wali Santri.
- Nomor telepon bersifat opsional dengan fallback default `"-"`.

---

## 4. Hasil Pengujian Menyeluruh

1. **Vitest Test Suite (Unit & Integrasi):**
   - File khusus: `tests/superadmin-full-account-management.test.ts` (19/19 lulus).
   - Seluruh project: **367 pengujian** dalam 21 file test lulus 100% tanpa kegagalan.
2. **TypeScript Compilation (`npx tsc --noEmit`):**
   - 0 error (Exit code: 0).
3. **ESLint (`npm run lint`):**
   - 0 error (Exit code: 0).
4. **Next.js Production Build (`npm run build`):**
   - Berhasil mengompilasi seluruh 21 route static dan server-rendered tanpa error.

