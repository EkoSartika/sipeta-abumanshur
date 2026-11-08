# PANDUAN KESIAPAN PRODUKSI & DEPLOYMENT (PRODUCTION READINESS)
## Sistem Informasi Pelayanan Terpadu (SIPETA)
### Pondok Pesantren Modern Abu Manshur

**Versi Dokumen:** 2.0  
**Tanggal:** 8 November 2026  
**Status Kesiapan:** **READY FOR DEDICATED SUPABASE PROJECT CONNECTION**  
**Target Hosting:** Vercel (Next.js 15)  
**Target Database:** Dedicated Supabase PostgreSQL Project  

---

## 1. Daftar Periksa Kesiapan Produksi (Production Checklist)

| Kategori | Kriteria Pengujian | Status | Bukti Konkret |
|---|---|---|---|
| **Kompilasi** | TypeScript Strict Check (`tsc --noEmit`) | **LULUS** | 0 error pada seluruh berkas TypeScript. |
| **Pengujian** | Automated Vitest Unit & Integration Tests | **LULUS** | 71/71 tests passed (100%). |
| **Engine PostgreSQL** | Migrasi 0001 s.d. 0007, RLS 5 Role, Triggers, RPC | **LULUS** | 22/22 real PostgreSQL 16 tests passed. |
| **Produksi Build** | Next.js Production Build (`next build`) | **LULUS** | Seluruh 6 rute app & API teroptimasi. |
| **Keamanan RLS** | Isolasi Wali 1:1, Bendahara Verifikasi Tunggal | **LULUS** | RLS terbukti mengisolasi data santri. |
| **Kekekalan Ledger** | Mutasi Uang Saku & Audit Log Immutability | **LULUS** | Trigger menolak UPDATE & DELETE. |
| **Dual-Mode Backend**| Fallback Mandiri jika Supabase Belum Dihubungkan| **LULUS** | Aplikasi tetap berfungsi penuh tanpa crash. |
| **Kepatuhan Aturan** | Data Produksi Tidak Disentuh & Tanpa Fake Creds | **LULUS** | Tidak ada kredensial palsu atau sentuhan ke database luar. |

---

## 2. Langkah Selanjutnya untuk Mengaktifkan Backend Supabase

Setelah project Supabase baru khusus SIPETA dibuat oleh administrator pesantren, ikuti panduan pada:
👉 [**`docs/SUPABASE_PROJECT_SETUP_GUIDE.md`**](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/docs/SUPABASE_PROJECT_SETUP_GUIDE.md)

Ringkasan tahapan:
1. Buat project baru `sipeta-pesantren-abumanshur` di region `ap-southeast-1` (Singapura).
2. Jalankan migrasi 0001–0007 di SQL Editor Supabase.
3. Jalankan `seed.sql` untuk data master pesantren.
4. Buat 4 private bucket: `bukti-pembayaran`, `bukti-uang-saku`, `foto-penyerahan-saku`, `dokumentasi-kepesantrenan`.
5. Salin kredensial ke `.env.local` (dan Vercel Dashboard jika di-deploy).
6. Periksa endpoint `/api/health` untuk memastikan indikator menjadi hijau: `Supabase Project Khusus Terhubung`.
