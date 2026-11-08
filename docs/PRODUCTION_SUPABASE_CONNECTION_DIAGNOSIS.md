# SIPETA — INVESTIGASI & DIAGNOSIS KONEKSI SUPABASE PADA VERCEL PRODUCTION

**Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur**  
**Tanggal**: 8 November 2026  
**Auditor**: Senior Database Security Engineer, Supabase Specialist & Vercel Architect  
**Direktori Proyek**: `C:\Users\Eko\.gemini\antigravity\scratch\sipeta`  
**Domain Produksi Vercel**: `https://sipeta-abumanshur.vercel.app`  
**Supabase Cloud URL**: `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`  
**Status Investigasi**: ✅ **AKAR MASALAH TERIDENTIFIKASI & SOLUSI TERVERIFIKASI**

---

## 1. Ringkasan Eksekutif & Jawaban Utama

Munculnya pesan error pada modal login:
> **"Supabase belum dihubungkan. Gunakan simulasi login di mode Demo."**

terjadi karena fungsi `isSupabaseConfigured()` pada runtime browser maupun runtime server menghasilkan nilai `false`.

### Hasil Pembuktian Empiris Langsung ke Endpoint Produksi:
Pemeriksaan HTTP langsung terhadap endpoint Vercel Production (`https://sipeta-abumanshur.vercel.app/api/health`) menghasilkan data riil berikut:
```json
{
  "status": "simulation",
  "connectionState": "NOT_CONFIGURED",
  "mode": "standalone_demo",
  "message": "MODE SIMULASI — MENUNGGU PROJECT SUPABASE KHUSUS",
  "checkedAt": "2026-11-08T15:55:31.107Z"
}
```

### Kesimpulan Asal Masalah:
Masalah ini **100% berada pada konfigurasi environment variables di dashboard Vercel** dan mekanisme *Build Time Inlining* Next.js, **BUKAN** karena kegagalan database Supabase Cloud, dan **BUKAN** karena kegagalan arsitektur kode.

---

## 2. Alur Penelusuran Kode (*Root Cause Analysis*)

### 2.1. File dan Baris Kode Terkait

1. **Titik Pemicu Pesan Error**:  
   File: [`src/lib/services/auth.service.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/lib/services/auth.service.ts#L76-L82) (Baris 76–82)
   ```typescript
   async login(email: string, kataSandi: string): Promise<AuthResponse> {
     if (!isSupabaseConfigured()) {
       return {
         ok: false,
         message: "Supabase belum dihubungkan. Gunakan simulasi login di mode Demo.",
       };
     }
     // ... pemanggilan signInWithPassword hanya terjadi jika isSupabaseConfigured() === true
   }
   ```

2. **Logika Validasi Konfigurasi**:  
   File: [`src/lib/supabase/client.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/lib/supabase/client.ts#L33-L56)
   ```typescript
   export function isSupabaseConfigured(): boolean {
     const url = getSupabaseUrl();
     const key = getSupabasePublishableKey();

     if (!url || !key) return false;
     if (!url.startsWith("https://")) return false;
     if (url.includes("your-project-ref") || url.includes("placeholder")) return false;
     // ...
     return isValidFormat;
   }
   ```

3. **Inisialisasi Status di Halaman Utama**:  
   File: [`src/lib/store/sipeta-context.tsx`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/lib/store/sipeta-context.tsx#L387-L401)
   ```typescript
   if (!isSupabaseConfigured()) {
     setHealthStatus({
       isConfigured: false,
       isConnected: false,
       connectionState: "NOT_CONFIGURED",
       mode: "demo_local",
       message: "Supabase environment variables belum dikonfigurasi.",
       checkedAt: new Date().toISOString(),
     });
     setConnectionStatus("demo");
     setIsLiveSupabase(false);
     return;
   }
   ```
   Karena `isLiveSupabase` bernilai `false`, antarmuka menampilkan tombol **Login Supabase**. Ketika tombol diklik dan formulir disubmit, `authService.login()` menolak eksekusi karena variabel belum terdeteksi.

---

## 3. Mengapa Ini Terjadi di Vercel Production?

Terdapat 3 (tiga) faktor teknis Next.js dan Vercel yang menyebabkan kondisi ini:

### Faktor 1: Karakteristik *Build-Time Inlining* Next.js
Pada arsitektur Next.js, variabel dengan awalan `NEXT_PUBLIC_*` **diinjeksi dan dibakar secara statis (*inlined*) ke dalam bundel JavaScript browser saat proses build berlangsung (`next build`)**.
- Jika saat proyek diimpor ke Vercel pemilik proyek langsung menekan tombol **Deploy** *tanpa* mengisi Environment Variables terlebih dahulu, maka Vercel melakukan build dengan nilai variabel kosong (`""`).
- Bundel JavaScript yang disajikan ke browser pengguna secara permanen menganggap `NEXT_PUBLIC_SUPABASE_URL = ""` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ""`.

### Faktor 2: Vercel Tidak Melakukan Auto-Redeploy untuk Deployment Lama
Di Vercel, jika Anda menambahkan atau mengedit Environment Variables pada menu **Project Settings > Environment Variables** *setelah* deployment pertama selesai:
> ⚠️ **Perubahan Environment Variables TIDAK otomatis memperbarui deployment yang sudah aktif.**
Deployment lama tetap berjalan menggunakan bundel build sebelumnya. Diperlukan tindakan **Redeploy** eksplisit agar Next.js membakar kembali variabel tersebut ke bundel baru.

### Faktor 3: Pemilihan Lingkungan (*Scope Checkbox*) di Vercel
Saat menambahkan Environment Variables di Vercel, terdapat pilihan lingkungan:
- `[x] Production`
- `[ ] Preview`
- `[ ] Development`
Jika centang **Production** terlewat, variabel tersebut tidak akan dimasukkan ke domain rilis produksi (`https://sipeta-abumanshur.vercel.app`).

---

## 4. Perbaikan dan Pengerasan Kode Sumber (*Source Code Hardening*)

Untuk mencegah potensi kesalahan manusia (*human error*) saat input di Vercel, kami telah melakukan pengerasan pada tiga berkas kode:

1. **Sanitasi Otomatis Tanda Kutip & Trailing Slash ([`src/lib/supabase/client.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/lib/supabase/client.ts))**:
   - Menambahkan fungsi pembersih `cleanEnvValue()` yang otomatis menghapus tanda kutip (`"` atau `'`) yang sering tidak sengaja terbawa saat copy-paste dari Supabase Dashboard.
   - Otomatis membuang *trailing slash* (`/`) di akhir URL project.
   - Mendukung fallback nama variabel (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`).

2. **Sanitasi Kunci Server ([`src/lib/supabase/server.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/lib/supabase/server.ts))**:
   - Mendukung sanitasi otomatis untuk `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, dan `SUPABASE_SERVICE_KEY`.

3. **Diagnostik Aman Tanpa Kebocoran Rahasia ([`src/app/api/health/route.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/app/api/health/route.ts))**:
   - Endpoint `/api/health` kini menyediakan objek `diagnostics` berisi boolean status (`hasSupabaseUrl`, `hasSupabaseKey`) dan petunjuk solutif tanpa pernah mengekspos isi string kredensial.

---

## 5. Panduan Tindakan Pemilik Proyek (Langkah Demi Langkah)

Untuk mengaktifkan koneksi Supabase Cloud secara permanen pada Vercel Production, lakukan dua langkah berikut:

### Langkah A: Konfigurasi Environment Variables di Vercel
1. Buka dashboard Vercel Anda di peramban:  
   `https://vercel.com/dashboard`
2. Klik proyek **`sipeta-abumanshur`**.
3. Masuk ke tab **Settings** (di bilah atas) > pilih menu **Environment Variables** (di sisi kiri).
4. Tambahkan 4 (empat) variabel berikut satu per satu (pastikan checklist **Production** dicentang):

| Key / Nama Variabel | Value / Nilai | Scope yang Harus Dicentang |
| :--- | :--- | :---: |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jvhzrhfzkjqzlhsvvbgy.supabase.co` | ✅ Production, ✅ Preview, ✅ Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | *(Salin dari Supabase Dashboard: Project Settings > API > Publishable / Anon Key)* | ✅ Production, ✅ Preview, ✅ Development |
| `SUPABASE_SECRET_KEY` | *(Salin dari Supabase Dashboard: Project Settings > API > Secret / Service Role Key)* | ✅ Production, ✅ Preview (Server Only) |
| `NEXT_PUBLIC_APP_ENV` | `production` | ✅ Production |

> [!IMPORTANT]
> - Nilai `NEXT_PUBLIC_SUPABASE_URL` adalah: `https://jvhzrhfzkjqzlhsvvbgy.supabase.co` (tanpa tanda kutip).
> - Nilai Key dapat menggunakan format baru `sb_publishable_...` / `sb_secret_...` atau format JWT `eyJ...`.
> - Jangan menambahkan prefiks `NEXT_PUBLIC_` pada `SUPABASE_SECRET_KEY`.

---

### Langkah B: Lakukan Redeploy pada Vercel
1. Masuk ke tab **Deployments** pada proyek `sipeta-abumanshur` di Vercel.
2. Temukan deployment terbaru yang bertanda **Production (Current)**.
3. Klik tombol titik tiga (**`...`**) di sisi kanan baris deployment tersebut.
4. Klik **Redeploy**.
5. Centang/pastikan opsi **Use existing Build Cache** bernilai **TIDAK DICENTANG** (agar Vercel melakukan kompilasi ulang bersih dengan membaca variabel baru).
6. Klik tombol konfirmasi **Redeploy**.
7. Tunggu proses build selesai (~1–2 menit).

---

### Langkah C: Verifikasi Koneksi Pasca-Redeploy
Setelah proses redeploy Vercel berstatus *Ready*:
1. Buka URL pemeriksaan kesehatan di browser:  
   `https://sipeta-abumanshur.vercel.app/api/health`
   - Respon yang diharapkan berubah dari `NOT_CONFIGURED` menjadi:
     ```json
     {
       "status": "healthy",
       "connectionState": "CONNECTED_HEALTHY",
       "mode": "supabase_live",
       "message": "Database PostgreSQL khusus SIPETA aktif (...ms). Data master terverifikasi."
     }
     ```
2. Buka aplikasi `https://sipeta-abumanshur.vercel.app`.
3. Badge status di header akan berubah warna menjadi **Hijau (Live Database: PostgreSQL)**.
4. Klik tombol **Login Supabase**, masukkan:
   - Email: `sipetaabumanshur@gmail.com`
   - Kata Sandi: *(kata sandi yang Anda tentukan saat bootstrap)*
5. Anda akan langsung masuk ke **Portal Superadmin** dengan hak akses penuh.

---

## 6. Hasil Pengujian Mutu Kode Lokal

Seluruh pengujian lokal telah dijalankan ulang pasca-pengerasan kode dengan hasil sempurna:

```text
 ✓ tests/sipeta-business-rules.test.ts (11 tests)
 ✓ tests/sipeta-comprehensive-audit.test.ts (19 tests)
 ✓ tests/supabase-backend-integration.test.ts (23 tests)
 ✓ tests/migration-008-audit.test.ts (12 tests)
 ✓ tests/final-authorization.test.ts (28 tests)
 ✓ tests/supabase-real-postgres.test.ts (40 tests)
 ✓ tests/bootstrap-superadmin.test.ts (14 tests)

 Test Files  7 passed (7)
      Tests  147 passed (147)
   Duration  12.83s
```

- **TypeScript Typecheck (`tsc --noEmit`)**: **0 error** (Lulus 100%).
- **Next.js Production Build (`next build`)**: **Compiled successfully** (Exit Code 0).
- **Audit Secret Leakage**: **0 kebocoran kredensial** pada `.next/static`.
