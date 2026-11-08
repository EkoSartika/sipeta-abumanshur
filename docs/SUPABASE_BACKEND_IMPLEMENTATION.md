# DOKUMEN IMPLEMENTASI BACKEND SUPABASE (SIPETA)
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur
**Tanggal:** 8 November 2026  
**Status Saat Ini:** **KODE SELESAI & TERUJI (Menunggu Pembuatan Project Supabase Khusus)**  
**Target Engine:** Dedicated Supabase PostgreSQL Project (Region: `ap-southeast-1`)  
**Lingkungan Pengujian:** PostgreSQL 16 Engine (`@electric-sql/pglite`), Next.js 15.5.29, Vitest

---

## 1. Keputusan Arsitektur & Status Supabase Saat Ini

1. **Status Project:** Saat ini SIPETA **BELUM MEMILIKI PROJECT SUPABASE AKTIF**.
2. **Kemandirian Project:** Nantinya akan dibuat satu project Supabase baru yang **KHUSUS** untuk SIPETA (tidak menggunakan project Supabase aplikasi lain).
3. **Pencegahan Kredensial Palsu:** Sistem tidak membuat koneksi tiruan atau mengklaim status "Live" secara sepihak. Sebelum project khusus dibuat dan dihubungkan secara nyata, aplikasi beroperasi dalam **Mode Simulasi Mandiri (Demo Store)** yang sepenuhnya fungsional dan terisolasi.
4. **Verifikasi Database Riil:** Seluruh migrasi SQL 0001–0007, 27 tabel, enum, trigger immutability, RLS, dan Stored Procedure (RPC) telah dieksekusi dan diuji 100% lulus pada engine PostgreSQL 16 nyata.

---

## 2. Struktur Lapisan Layanan (Repository/Service Pattern)

Arsitektur data dipisahkan secara tegas antara UI Client, Repository Layer, dan Database Engine:

```
[ Next.js 15 App / React Portals ]
               │
               ▼
   [ SipetaContext & useSipeta ]
       │                  │
 (Mode Standalone)   (Mode Supabase Khusus)
       │                  │
       ▼                  ▼
[ Demo Store ]    [ Service Layer (`src/lib/services/`) ]
(localStorage)         ├── administrasiService
                       ├── keuanganService
                       ├── kepesantrenanService
                       ├── storageService
                       ├── notifikasiService
                       ├── authService
                       └── healthService
                              │
                              ▼
            [ Supabase Project Khusus SIPETA ]
                  ├── 7 Migrations (0001 - 0007)
                  ├── Row Level Security (RLS)
                  ├── Atomic Stored Procedures (RPC)
                  ├── Immutable Triggers & Ledgers
                  └── 4 Private Storage Buckets
```

---

## 3. Database Health Check Aktual (`health.service.ts`)

Untuk membuktikan koneksi database secara nyata tanpa mengasumsikan keberadaan environment variable palsu:
- **Metode Pengujian:** `checkSupabaseHealth()` menjalankan query ping aktual ke database (`rekening_pesantren`) dan mengukur latensi round-trip.
- **Output:** Mengembalikan objek status terstruktur:
  - `isConfigured: boolean`
  - `isConnected: boolean`
  - `mode: "supabase_live" | "demo_local"`
  - `latencyMs: number`
  - `databaseVersion: string`
- **Tampilan Antarmuka:** Top Bar menampilkan badge jujur:
  - Sebelum project dihubungkan: `Mode Simulasi Mandiri (Menunggu Project Supabase Khusus)`
  - Setelah project dihubungkan & terverifikasi: `Supabase Project Khusus Terhubung`

---

## 4. Modul Keuangan & Atomic RPC (`keuangan.service.ts`)

Seluruh operasi transaksi finansial dieksekusi melalui Stored Procedure PostgreSQL dengan kunci baris (`FOR UPDATE`) untuk menjamin atomicity dan mencegah *double-spending*:

| Operasi | Stored Procedure (RPC) | Garansi Integritas |
|---|---|---|
| Checkout Multi-Tagihan | `public.rpc_checkout_pembayaran` | Validasi nominal cicilan, snapshot kebijakan, nomor faktur unik |
| Verifikasi Pembayaran | `public.rpc_verifikasi_pembayaran` | Eksklusif Bendahara, alokasi saldo, status lunas otomatis |
| Penolakan Pembayaran | `public.rpc_verifikasi_pembayaran` | Pembatalan alokasi, catatan penolakan wajib |
| Bukti Transfer Susulan | `public.rpc_unggah_bukti_transfer_pembayaran` | Transisi status dari `MENUNGGU_PEMBAYARAN` ke `MENUNGGU_VERIFIKASI` |
| Verifikasi Top-Up Saku | `public.rpc_verifikasi_topup_uang_saku` | Mutasi kredit ke ledger saku, row locking `saldo_uang_saku` |
| Penyerahan Uang Saku | `public.rpc_catat_penyerahan_uang_saku` | Bukti foto wajib, validasi saldo cukup, mutasi debit ke ledger |
| Jurnal Koreksi Ledger | `public.rpc_koreksi_ledger_uang_saku` | Append-only audit trail, dilarang mengubah baris mutasi lama |
| Penyesuaian Tagihan | `public.rpc_penyesuaian_tagihan` | Pencatatan nominal penyesuaian, alasan administratif wajib |

---

## 5. Modul Storage & Keamanan File (`storage.service.ts`)

Mengelola 4 private buckets Supabase Storage:
1. `bukti-pembayaran` (Bukti transfer pembayaran tagihan)
2. `bukti-uang-saku` (Bukti transfer top-up uang saku)
3. `foto-penyerahan-saku` (Foto dokumentasi serah terima uang fisik ke santri)
4. `dokumentasi-kepesantrenan` (Sertifikat prestasi dan dokumen pembinaan)

- Validasi tipe MIME ketat (hanya JPG, PNG, WEBP, dan PDF untuk transfer).
- Batas ukuran file 5 MB.
- Akses pembacaan private dienkapsulasi menggunakan Signed URLs temporer (masa berlaku default 900 detik / 15 menit).
