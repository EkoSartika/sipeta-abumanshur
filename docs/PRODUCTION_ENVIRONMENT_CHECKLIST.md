# SIPETA — PRODUCTION ENVIRONMENT CHECKLIST
## Checklist Kesiapan Lingkungan Produksi (Vercel + Supabase Cloud)

Gunakan checklist ini sebelum dan setelah menekan tombol **Deploy** pada Vercel.

---

## 1. Konfigurasi Database Supabase Cloud

- [ ] **Migrasi 0001–008**: Seluruh 27 tabel public, 17 RPCs, 14 triggers, dan 61 policies aktif di Cloud.
- [ ] **Storage Buckets Privat**:
  - `bukti-pembayaran` (Private = true)
  - `bukti-uang-saku` (Private = true)
  - `foto-penyerahan-saku` (Private = true)
  - `dokumentasi-kepesantrenan` (Private = true)
- [ ] **Akun Superadmin Pertama**:
  - `sipetaabumanshur@gmail.com` terdaftar di `auth.users` dan terkonfirmasi.
  - Profil pada `public.profiles` berstatus `role = 'superadmin'` dan `is_active = true`.
- [ ] **Isolasi Folder Storage**: Wali hanya dapat mengunggah dan membaca file di folder santri miliknya (`split_part(name, '/', 1) = santri_id`).

---

## 2. Konfigurasi Dashboard Vercel

- [ ] **NEXT_PUBLIC_SUPABASE_URL**: Diisi `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`.
- [ ] **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY**: Diisi Publishable Key format baru (`sb_publishable_...`) atau JWT Anon Key.
- [ ] **SUPABASE_SECRET_KEY**: Diisi Secret Key server (`sb_secret_...`) atau JWT Service Role Key. *Hanya centang Production & Preview, tanpa eksposur ke browser*.
- [ ] **NEXT_PUBLIC_APP_ENV**: Diisi `production`.
- [ ] **Framework Preset**: Dipilih `Next.js`.
- [ ] **Node.js Version**: 18.x atau 20.x LTS.

---

## 3. Konfigurasi Keamanan Jaringan & Redirect

- [ ] **Site URL**: Domain produksi Vercel (`https://sipeta.vercel.app`) didaftarkan sebagai Site URL di Supabase Auth Settings.
- [ ] **Redirect URLs**: Pola `https://*.vercel.app/**` didaftarkan di Redirect URLs Supabase.
- [ ] **HTTP Headers**: Headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` terpasang via [`vercel.json`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/vercel.json) dan [`src/middleware.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/middleware.ts).
- [ ] **Powered-By Header**: Dinonaktifkan (`poweredByHeader: false` di [`next.config.mjs`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/next.config.mjs)).

---

## 4. Pengujian Integritas Kode Sumber (Lokal)

- [ ] `npm test`: **147 / 147 PASSED** (0 failed).
- [ ] `npm run typecheck`: **0 errors** (TypeScript strict mode).
- [ ] `npm run build`: **Compiled successfully** (0 error build).
- [ ] **Zero Secret Leaks**: File `.next/static` tidak mengandung string secret key atau service role token.

---

## 5. Tanda Tangan Kesiapan Produksi

Setelah seluruh butir di atas terverifikasi:
- Status: **APPROVED FOR VERCEL DEPLOYMENT**
- Pelaksana: Pemilik Proyek SIPETA

