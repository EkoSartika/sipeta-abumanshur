# LAPORAN INVESTIGASI KRITIS & SINKRONISASI AKUN SUPERADMIN SIPETA
**Tanggal:** 9 November 2026  
**Status:** SELESAI & TERVERIFIKASI  
**Metode:** Read-Only Database Audit + Root Cause Analysis + Code Hardening + Comprehensive Verification  

---

## 1. Ringkasan Eksekutif

Investigasi menyeluruh dilakukan terhadap anomali modul akun Superadmin:
1. Saat membuat akun baru dengan username `pengasuh`, sistem menampilkan error `"Username 'pengasuh' sudah digunakan"`.
2. Akun `pengasuh` tidak terlihat di tabel daftar akun Superadmin.
3. Daftar akun di UI Superadmin hanya menampilkan 1 akun (Superadmin), padahal sebelumnya terlihat beberapa akun.

Seluruh proses audit dilakukan secara **READ-ONLY** tanpa modifikasi, tanpa penghapusan, dan tanpa eksekusi mutasi SQL pada Supabase Cloud.

---

## 2. Hasil Audit Read-Only Supabase Cloud

Berdasarkan audit langsung pada Supabase Auth (`auth.users`) dan tabel database (`public.profiles`):
- **Total Akun Supabase Auth:** 7 Pengguna
- **Total Profil `public.profiles`:** 7 Profil
- **Tingkat Konsistensi (Pairing 1:1):** 100% Cocok (Tidak ada akun yatim di Auth maupun Profiles).

### Tabel Pencocokan Data Akun & Profil Live Cloud

| No | UUID (`auth.users.id` & `profiles.id`) | Username | Nama Lengkap | Email Internal/Resmi | Role | Status | Keterangan |
|---|---|---|---|---|---|---|---|
| 1 | `af7315fd-a82f-4c73-9bd1-4967d038ae7e` | `superadmin` | Superadmin SIPETA Abu Manshur | `sipetaabumanshur@gmail.com` | `superadmin` | **Aktif** | Superadmin Utama |
| 2 | `a56e1f64-017e-4b1c-8a2c-de147d144f1c` | `admin` | Admin | `admin@akun.sipeta.invalid` | `admin` | **Aktif** | Admin / Pengasuh |
| 3 | `9ce4b8f6-1386-44db-b124-023c11190d36` | `admin123` | admin | `admin123@akun.sipeta.invalid` | `admin` | **Aktif** | Admin / Pengasuh |
| 4 | `110b774a-1480-46df-a8fa-227ccbaef46a` | `bendahara123` | bendahara123 | `bendahara123@akun.sipeta.invalid` | `bendahara` | **Aktif** | Bendahara |
| 5 | `2afbb5c0-c550-4877-a640-66294184af75` | `pengelola123` | pengelola123 | `pengelola123@akun.sipeta.invalid` | `pengelola` | **Aktif** | Asatidz |
| 6 | `219488df-a2b0-4723-a4e8-a35ec1dfd772` | `pengasuh` | Pengasuh1 | `pengasuh@akun.sipeta.invalid` | `admin` | **Aktif** | Dibuat 09-11-2026 14:24 UTC |
| 7 | `88b7a06f-91c1-4cc6-a313-f4758c6e2719` | `tatausaha1` | Tata Usaha | `tatausaha1@akun.sipeta.invalid` | `tu` | **Aktif** | Tata Usaha (Migration 013) |

---

## 3. Akar Masalah (Root Cause Analysis)

### Masalah A: Mengapa username `pengasuh` ditolak karena duplikat?
- **Penyebab:** Akun dengan username `pengasuh` **benar-benar telah terdaftar dan aktif** di Supabase Cloud (UUID: `219488df-a2b0-4723-a4e8-a35ec1dfd772`, role: `admin`, nama: `Pengasuh1`).
- Endpoint `POST /api/admin-users` memeriksa duplikasi username langsung ke `public.profiles`. Karena record tersebut ada, server mengembalikan status 409: `"Username 'pengasuh' sudah digunakan"`. Penolakan ini merupakan perlindungan integritas database yang benar.

### Masalah B: Mengapa akun `pengasuh` dan 5 akun lainnya tidak tampil di tabel UI Superadmin?
- **Penyebab:**
  1. Pada commit sebelumnya (`307a893`), inisialisasi state awal aplikasi (`initBackend`) diatur hanya memuat `[profile]` (1 akun Superadmin yang sedang login) untuk menghindari kebocoran mock user statis. Pengisian seluruh akun live diserahkan kepada fungsi `refreshFromSupabase()`.
  2. Di dalam `refreshFromSupabase()`, 17 layanan dipanggil secara paralel menggunakan `Promise.all`:
     ```typescript
     const [rekening, ..., fetchedUsers] = await Promise.all([
       ...,
       keuanganService.getTagihanBySantri(), // <-- MENGALAMI ERROR
       ...,
       authService.getAllProfiles(),        // <-- TIDAK SEMPAT MEMPERBARUI STATE
     ]);
     ```
  3. Pada `keuanganService.getTagihanBySantri()`, query dijalankan dengan pengurutan:
     `.order("jatuh_tempo", { ascending: true })`
     Padahal kolom resmi pada tabel `public.tagihan` di Supabase Cloud bernama **`tanggal_jatuh_tempo`**.
  4. Akibatnya, PostgreSQL Supabase Cloud mengembalikan error:
     `column tagihan.jatuh_tempo does not exist`
  5. Karena `Promise.all` menganut prinsip *fail-fast*, kegagalan satu fungsi ini membatalkan seluruh proses sinkronisasi dan langsung melompat ke blok `catch (e)`.
  6. Baris `setUsers(fetchedUsers)` **tidak pernah dieksekusi**, sehingga state pengguna di frontend tetap tertahan pada `[profile]` (hanya 1 Superadmin).

---

## 4. Perbaikan yang Diimplementasikan

### 1. Perbaikan Nama Kolom & Defensive Error Handling pada `src/lib/services/keuangan.service.ts`
- Mengubah `.order("jatuh_tempo", { ascending: true })` menjadi `.order("tanggal_jatuh_tempo", { ascending: true })`.
- Menerapkan penanganan kesalahan aman pada `getTagihanBySantri()`, `getRiwayatTransaksi()`, dan `getPengajuanTopup()` agar mengembalikan array kosong `[]` (dengan warning log) alih-alih melempar exception yang mematikan sinkronisasi aplikasi global.

### 2. Konversi ke `Promise.allSettled` pada `src/lib/store/sipeta-context.tsx`
- Mengganti `Promise.all` dengan `Promise.allSettled` pada `refreshFromSupabase()`.
- Setiap modul (rekening, kelas, kamar, santri, wali, tagihan, profil pengguna, dll.) kini di-set secara independen ke state.
- Gangguan pada modul keuangan atau modul lainnya **tidak akan pernah lagi memblokir pemuatan profil pengguna (`authService.getAllProfiles()`)**.
- Membungkus `refreshFromSupabase` dalam `useCallback` untuk stabilitas referensi fungsi.

---

## 5. Hasil Pengujian & Verifikasi

1. **TypeScript Typecheck:**
   - Perintah: `npx tsc --noEmit`
   - Hasil: **0 Error** (Bersih).

2. **Unit & Integration Tests:**
   - Perintah: `npx vitest run --fileParallelism=false`
   - Hasil: **21 Test Files PASSED, 367 Tests PASSED (100% Pass)**.
   - Termasuk 19 tes pada `superadmin-full-account-management.test.ts`.

3. **Production Build:**
   - Perintah: `npm run build`
   - Hasil: **Compiled successfully (21/21 static & dynamic routes generated)**.
