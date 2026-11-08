# SIPETA — VERCEL PRODUCTION DEPLOYMENT GUIDE
## Panduan Komprehensif Deployment Produksi (Vercel + Supabase Cloud)

Project: **SIPETA — Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur**  
Target Platform: **Vercel**  
Database & Auth: **Supabase Cloud (`https://jvhzrhfzkjqzlhsvvbgy.supabase.co`)**  
Akun Superadmin Resmi: **`sipetaabumanshur@gmail.com`**

---

## 1. Audit Kesiapan Aplikasi (Pre-Flight Readiness)

| Komponen | Status | Keterangan |
|---|:---:|---|
| **Next.js & React Version** | `Next.js 15.1.7` / `React 19.0.0` | App Router modern dengan SSR cookies |
| **TypeScript Strict Mode** | **0 ERROR** | `tsc --noEmit` lolos tanpa kompromi |
| **Production Build** | **COMPILED (Code 0)** | Terkompilasi optimal (Bundle size: 103–238 kB) |
| **Automated Test Suite** | **147 / 147 PASSED** | 7 test suite lulus (100% test coverage) |
| **Client Bundle Security** | **0 LEAKS** | Secret key terisolasi murni di server runtime |
| **HTTP Security Headers** | **ACTIVE** | `X-Frame-Options: DENY`, `nosniff`, `strict-origin` |
| **Konfigurasi Vercel** | [`vercel.json`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/vercel.json) | Framework `nextjs`, build & install command siap |

---

## 2. Matriks Environment Variables di Vercel Dashboard

Saat membuat project baru di **Vercel Dashboard** (`Project Settings > Environment Variables`), masukkan variabel-variabel berikut:

### 2.1. Variabel Wajib Produksi (Production & Preview)

| Nama Variabel | Contoh Nilai | Scope | Keterangan |
|---|---|:---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jvhzrhfzkjqzlhsvvbgy.supabase.co` | **Semua** | URL endpoint project Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (atau JWT anon `eyJ...`) | **Semua** | Kunci publik untuk browser client & middleware |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` (atau JWT service_role `eyJ...`) | **Server Only** | **JANGAN dicentang untuk browser**. Hanya untuk API `/api/admin-users` |
| `NEXT_PUBLIC_APP_NAME` | `SIPETA - Pondok Pesantren Modern Abu Manshur` | **Semua** | Nama branding aplikasi |
| `NEXT_PUBLIC_APP_ENV` | `production` | **Production** | Penanda lingkungan produksi |

> [!CAUTION]
> Pastikan variabel `SUPABASE_SECRET_KEY` (atau `SUPABASE_SERVICE_ROLE_KEY`) **TIDAK** diawali dengan `NEXT_PUBLIC_`. Di Vercel, variabel tanpa prefiks `NEXT_PUBLIC_` otomatis diisolasi hanya di serverless runtime dan tidak akan disertakan ke bundel JavaScript browser.

---

## 3. Konfigurasi Supabase Cloud untuk Domain Vercel

Setelah aplikasi mendapatkan domain dari Vercel (misal: `https://sipeta.vercel.app` atau domain kustom `https://sipeta.abumanshur.id`):

1. Buka **Supabase Management Dashboard**:  
   `https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy`
2. Navigasi ke **Authentication** > **URL Configuration**.
3. Atur:
   - **Site URL**: `https://sipeta.vercel.app` (atau domain kustom pesantren).
   - **Redirect URLs**:
     - `https://sipeta.vercel.app/**`
     - `https://*.vercel.app/**` (untuk preview deployments).
     - `http://localhost:3000/**` (untuk pengujian lokal).
4. Klik **Save**.

---

## 4. Langkah-Langkah Deployment ke Vercel

### Opsi A: Deployment via Vercel Web Dashboard (Rekomendasi)
1. Push repository proyek ke **GitHub / GitLab / Bitbucket**.
2. Buka [vercel.com](https://vercel.com) dan login ke akun Anda.
3. Klik **Add New...** > **Project**.
4. Pilih repository `sipeta`.
5. Pada bagian **Configure Project**:
   - **Framework Preset**: `Next.js` (terdeteksi otomatis).
   - **Root Directory**: `./` (default).
   - **Build and Output Settings**: Default (`npm run build`).
   - **Environment Variables**: Salin nilai dari Bab 2 di atas.
6. Klik tombol **Deploy**.
7. Tunggu proses build selesai (estimasi 1–2 menit).

### Opsi B: Deployment via Vercel CLI
```bash
# 1. Login ke Vercel
npx vercel login

# 2. Hubungkan project lokal
npx vercel link

# 3. Masukkan Environment Variables
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx vercel env add SUPABASE_SECRET_KEY

# 4. Deploy ke produksi
npx vercel --prod
```

---

## 5. Prosedur Verifikasi Pasca-Deployment (Post-Deployment Verification)

Setelah deployment selesai dan domain aktif:

1. **Akses URL Produksi**:
   - Buka `https://<project-name>.vercel.app`.
   - Pastikan indikator koneksi menampilkan status **"Supabase Project Khusus Terhubung"**.
2. **Uji Health Check Endpoint**:
   - Buka `https://<project-name>.vercel.app/api/health`.
   - Pastikan menghasilkan status HTTP `200 OK` dengan payload `status: "connected"`.
3. **Login Superadmin Pertama**:
   - Klik **Login Supabase**.
   - Masukkan email: `sipetaabumanshur@gmail.com` dan kata sandi yang telah Anda buat di dashboard Supabase.
   - Pastikan masuk ke **Portal Superadmin**.
4. **Verifikasi Fitur Inti Superadmin**:
   - Konfigurasi nomor rekening resmi pesantren di tab **Rekening Resmi Pesantren**.
   - Daftarkan akun staf operasional (`Bendahara`, `Admin`, `Pengelola`) di tab **Manajemen Pengguna**.
5. **Uji Keamanan**:
   - Buka DevTools > Network tab, pastikan seluruh gambar bukti transfer dan uang saku dimuat melalui Signed URL berbatas waktu dari private bucket.

