# DOKUMENTASI SKEMA DATABASE LENGKAP SIPETA
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur

---

## 1. STRUKTUR ENUM DAN EKSTENSI (MIGRASI 0001)

Sistem menggunakan ekstensi PostgreSQL `pgcrypto` untuk pembuatan UUID (`gen_random_uuid()`) dan 9 tipe data ENUM standar:

```sql
-- 1. Peran Pengguna
CREATE TYPE public.user_role AS ENUM (
    'superadmin', 'admin', 'bendahara', 'pengelola', 'wali'
);

-- 2. Status Santri
CREATE TYPE public.status_santri AS ENUM (
    'AKTIF', 'LULUS', 'MUTASI', 'BERHENTI', 'ALUMNI'
);

-- 3. Kategori Tagihan
CREATE TYPE public.kategori_tagihan AS ENUM (
    'SPP_BULANAN', 'DAFTAR_ULANG', 'UANG_GEDUNG', 'SERAGAM', 'KITAB', 'KEGIATAN', 'LAINNYA'
);

-- 4. Status Tagihan
CREATE TYPE public.status_tagihan AS ENUM (
    'LUNAS', 'BELUM_LUNAS', 'MENUNGGU_VERIFIKASI', 'DIBATALKAN'
);

-- 5. Metode Pembayaran
CREATE TYPE public.metode_pembayaran AS ENUM (
    'TRANSFER_MANUAL', 'TUNAI_BENDAHARA'
);

-- 6. Status Verifikasi Transaksi
CREATE TYPE public.status_verifikasi AS ENUM (
    'MENUNGGU', 'DISETUJUI', 'DITOLAK'
);

-- 7. Jenis Mutasi Uang Saku (Ledger)
CREATE TYPE public.jenis_mutasi_saku AS ENUM (
    'MASUK_TOPUP', 'KELUAR_TUNAI', 'KOREKSI_DEBIT', 'KOREKSI_KREDIT'
);

-- 8. Kategori Pengumuman
CREATE TYPE public.kategori_pengumuman AS ENUM (
    'AKADEMIK', 'KEUANGAN', 'KEPANTRENAN', 'LIBURAN', 'DARURAT', 'UMUM'
);

-- 9. Tingkat Pelanggaran Disiplin
CREATE TYPE public.tingkat_pelanggaran AS ENUM (
    'RINGAN', 'SEDANG', 'BERAT'
);
```

---

## 2. DAFTAR 27 TABEL SKEMA `public` DAN STRUKTURNYA

### A. Entitas Tata Kelola Pengguna & Master Administrasi

#### 1. `public.profiles` (Profil Pengguna & Identitas)
Menyimpan profil seluruh pengguna yang terhubung dengan `auth.users(id)`.
- `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `nama_lengkap TEXT NOT NULL`
- `email TEXT NOT NULL` (Email resmi Superadmin atau email sintetis `@akun.sipeta.invalid`)
- `username TEXT` *(Migrasi 009)*: Unik case-insensitive via `idx_profiles_lower_username`, constraint regex `^[a-z0-9_.-]{3,30}$`
- `no_telepon TEXT NOT NULL DEFAULT '-'`
- `role public.user_role NOT NULL DEFAULT 'wali'`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `must_change_password BOOLEAN NOT NULL DEFAULT false` *(Migrasi 011)*: Penanda wajib ganti sandi awal bagi wali santri
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

#### 2. `public.tahun_ajaran` (Tahun Akademik)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `nama TEXT NOT NULL UNIQUE` (Contoh: '2026/2027')
- `is_active BOOLEAN NOT NULL DEFAULT false`
- `tanggal_mulai DATE`, `tanggal_selesai DATE`
- Constraint: Hanya satu tahun ajaran yang boleh `is_active = true` (Indeks unik parsial).

#### 3. `public.kelas` (Data Ruang Kelas Belajar)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `nama_kelas TEXT NOT NULL` (Contoh: '7A Putra')
- `tingkat INTEGER NOT NULL` (Contoh: 7, 8, 9, 10, 11, 12)
- `wali_kelas_id UUID REFERENCES public.profiles(id)`
- `deleted_at TIMESTAMPTZ`, `deleted_by UUID REFERENCES public.profiles(id)` *(Migrasi 010)*
- Trigger: `trg_prevent_delete_kelas` memblokir penghapusan jika masih ada santri aktif.

#### 4. `public.kamar` (Data Asrama / Kobong Santri)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `nama_kamar TEXT NOT NULL` (Contoh: 'Al-Fath 01')
- `gedung TEXT NOT NULL`, `kapasitas INTEGER NOT NULL DEFAULT 20`
- `musyrif_id UUID REFERENCES public.profiles(id)`
- `deleted_at TIMESTAMPTZ`, `deleted_by UUID REFERENCES public.profiles(id)` *(Migrasi 010)*
- Trigger: `trg_prevent_delete_kamar` memblokir penghapusan jika masih ada santri aktif.

#### 5. `public.santri` (Induk Data Santri)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `nis TEXT NOT NULL UNIQUE` (Disimpan sebagai TEXT untuk menjaga angka nol di depan)
- `nama_lengkap TEXT NOT NULL`
- `tempat_lahir TEXT NOT NULL`, `tanggal_lahir DATE NOT NULL`
- `jenis_kelamin TEXT NOT NULL CHECK (jenis_kelamin IN ('L', 'P'))`
- `alamat TEXT NOT NULL`
- `tahun_masuk INTEGER NOT NULL`
- `tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id)`
- `kelas_id UUID REFERENCES public.kelas(id)`
- `kamar_id UUID REFERENCES public.kamar(id)`
- `status public.status_santri NOT NULL DEFAULT 'AKTIF'`
- `deleted_at TIMESTAMPTZ`, `deleted_by UUID REFERENCES public.profiles(id)` *(Migrasi 010)*
- Trigger: `trg_prevent_hard_delete_santri` memblokir penghapusan jika memiliki riwayat keuangan/akademik.

#### 6. `public.wali_santri` (Relasi 1:1 Orang Tua dan Santri)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE`
- `santri_id UUID NOT NULL UNIQUE REFERENCES public.santri(id) ON DELETE CASCADE`
- `nama_lengkap TEXT NOT NULL`, `no_telepon TEXT NOT NULL DEFAULT '-'`
- `hubungan TEXT NOT NULL DEFAULT 'Orang Tua'`
- `email TEXT`

#### 7. `public.riwayat_penempatan_santri`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id)`
- `kelas_id UUID REFERENCES public.kelas(id)`
- `kamar_id UUID REFERENCES public.kamar(id)`
- `tanggal_mulai DATE NOT NULL DEFAULT CURRENT_DATE`, `tanggal_selesai DATE`

---

### B. Entitas Keuangan & Tagihan

#### 8. `public.rekening_pesantren` (Rekening Resmi Tunggal BSI)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `nama_bank TEXT NOT NULL DEFAULT 'Bank Syariah Indonesia (BSI)'`
- `nomor_rekening TEXT NOT NULL`
- `atas_nama TEXT NOT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- Indeks Unik Parsial: `idx_single_active_rekening_pesantren` menjamin hanya 1 rekening aktif.
- RLS *(Migrasi 012)*: Superadmin & Admin (`ALL`), Bendahara/Pengelola/Wali aktif (`SELECT`).

#### 9. `public.jenis_pembayaran` (Master Tarif & Komponen)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `kode TEXT NOT NULL UNIQUE`, `nama TEXT NOT NULL`
- `kategori public.kategori_tagihan NOT NULL`
- `nominal_standar NUMERIC(12,2) NOT NULL DEFAULT 0`
- `bisa_dicicil BOOLEAN NOT NULL DEFAULT false`

#### 10. `public.tagihan` (Kewajiban Pembayaran Santri)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `jenis_pembayaran_id UUID NOT NULL REFERENCES public.jenis_pembayaran(id)`
- `tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id)`
- `bulan INTEGER CHECK (bulan BETWEEN 1 AND 12)`, `tahun INTEGER NOT NULL`
- `nominal NUMERIC(12,2) NOT NULL`, `nominal_terbayar NUMERIC(12,2) NOT NULL DEFAULT 0`
- `status public.status_tagihan NOT NULL DEFAULT 'BELUM_LUNAS'`
- `jatuh_tempo DATE NOT NULL`, `bisa_dicicil BOOLEAN NOT NULL DEFAULT false`

#### 11. `public.keranjang_pembayaran` (Sesi Pilihan Tagihan Wali)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `wali_id UUID NOT NULL REFERENCES public.profiles(id)`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `total_nominal NUMERIC(12,2) NOT NULL DEFAULT 0`

#### 12. `public.item_keranjang_pembayaran`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `keranjang_id UUID NOT NULL REFERENCES public.keranjang_pembayaran(id) ON DELETE CASCADE`
- `tagihan_id UUID NOT NULL REFERENCES public.tagihan(id)`
- `nominal_alokasi NUMERIC(12,2) NOT NULL`

#### 13. `public.transaksi_pembayaran` (Transaksi Induk)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `kode_transaksi TEXT NOT NULL UNIQUE` (Contoh: 'TRX-20261109-0001')
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `wali_id UUID NOT NULL REFERENCES public.profiles(id)`
- `total_nominal NUMERIC(12,2) NOT NULL`
- `metode public.metode_pembayaran NOT NULL`
- `rekening_tujuan_id UUID REFERENCES public.rekening_pesantren(id)`
- `bukti_transfer_url TEXT` (File pada bucket private `bukti-pembayaran`)
- `status_verifikasi public.status_verifikasi NOT NULL DEFAULT 'MENUNGGU'`
- `diverifikasi_oleh UUID REFERENCES public.profiles(id)`
- `catatan_verifikasi TEXT`

#### 14. `public.alokasi_pembayaran` (Distribusi Transaksi ke Tagihan)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `transaksi_id UUID NOT NULL REFERENCES public.transaksi_pembayaran(id) ON DELETE CASCADE`
- `tagihan_id UUID NOT NULL REFERENCES public.tagihan(id)`
- `nominal_alokasi NUMERIC(12,2) NOT NULL`

#### 15. `public.pembayaran_cicilan` (Riwayat Angsuran Tagihan)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `tagihan_id UUID NOT NULL REFERENCES public.tagihan(id)`
- `transaksi_id UUID NOT NULL REFERENCES public.transaksi_pembayaran(id)`
- `nominal NUMERIC(12,2) NOT NULL`, `sisa_tagihan NUMERIC(12,2) NOT NULL`

---

### C. Entitas Ledger Uang Saku Santri (Append-Only)

#### 16. `public.saldo_uang_saku` (Snapshot Saldo Berjalan)
- `santri_id UUID PRIMARY KEY REFERENCES public.santri(id) ON DELETE CASCADE`
- `saldo_terkini NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo_terkini >= 0)`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

#### 17. `public.pengajuan_topup_saku` (Pengajuan Wali)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `wali_id UUID NOT NULL REFERENCES public.profiles(id)`
- `nominal NUMERIC(12,2) NOT NULL CHECK (nominal > 0)`
- `bukti_transfer_url TEXT NOT NULL`
- `status public.status_verifikasi NOT NULL DEFAULT 'MENUNGGU'`
- `diverifikasi_oleh UUID REFERENCES public.profiles(id)`

#### 18. `public.mutasi_uang_saku` (Buku Besar Transaksi Keuangan Santri)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `jenis public.jenis_mutasi_saku NOT NULL`
- `nominal NUMERIC(12,2) NOT NULL CHECK (nominal > 0)`
- `saldo_sebelum NUMERIC(12,2) NOT NULL`, `saldo_sesudah NUMERIC(12,2) NOT NULL`
- `foto_penyerahan_url TEXT` (Wajib diisi jika `jenis = 'KELUAR_TUNAI'`)
- `dicatat_oleh UUID NOT NULL REFERENCES public.profiles(id)`
- `keterangan TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

---

### D. Entitas Akademik, Kepesantrenan, dan Audit

#### 19. `public.setoran_tahfidz` (Catatan Hafalan Al-Qur'an)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `kategori TEXT NOT NULL CHECK (kategori IN ('HAFALAN_BARU', 'MUROJAAH'))`
- `juz INTEGER NOT NULL CHECK (juz BETWEEN 1 AND 30)`, `surat TEXT NOT NULL`, `ayat_awal INTEGER`, `ayat_akhir INTEGER`
- `kelancaran TEXT NOT NULL`, `tajwid TEXT NOT NULL`, `makhroj TEXT NOT NULL`
- `penguji_id UUID NOT NULL REFERENCES public.profiles(id)`

#### 20. `public.catatan_akademik` (Mutaba'ah Kitab & Sekolah)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `kitab TEXT NOT NULL`, `bab TEXT NOT NULL`, `kehadiran TEXT NOT NULL`
- `asatidz_id UUID NOT NULL REFERENCES public.profiles(id)`

#### 21. `public.pelanggaran_disiplin` (Catatan Pelanggaran Santri)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `tingkat public.tingkat_pelanggaran NOT NULL`
- `poin INTEGER NOT NULL DEFAULT 0`, `deskripsi TEXT NOT NULL`
- `tindakan_pembinaan TEXT NOT NULL`, `status_selesai BOOLEAN NOT NULL DEFAULT false`

#### 22. `public.riwayat_pembinaan_disiplin`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `pelanggaran_id UUID NOT NULL REFERENCES public.pelanggaran_disiplin(id) ON DELETE CASCADE`
- `catatan_konseling TEXT NOT NULL`, `musyrif_id UUID NOT NULL REFERENCES public.profiles(id)`

#### 23. `public.prestasi_santri`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `santri_id UUID NOT NULL REFERENCES public.santri(id)`
- `judul_prestasi TEXT NOT NULL`, `tingkat TEXT NOT NULL`, `penyelenggara TEXT`

#### 24. `public.pengumuman` (Papan Informasi Publik & Pesantren)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `judul TEXT NOT NULL`, `isi TEXT NOT NULL`, `kategori public.kategori_pengumuman NOT NULL`
- `is_penting BOOLEAN NOT NULL DEFAULT false`, `is_published BOOLEAN NOT NULL DEFAULT true`
- `penulis_id UUID REFERENCES public.profiles(id)`

#### 25. `public.notifikasi` (Notifikasi Terarah)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES public.profiles(id)`
- `judul TEXT NOT NULL`, `pesan TEXT NOT NULL`, `is_read BOOLEAN NOT NULL DEFAULT false`

#### 26. `public.audit_logs` (Jejak Rekam Sistem Append-Only)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID REFERENCES public.profiles(id)`
- `user_role TEXT NOT NULL`, `aktivitas TEXT NOT NULL`
- `jenis_objek TEXT NOT NULL`, `objek_id TEXT NOT NULL`
- `data_sebelum JSONB`, `data_sesudah JSONB`, `alasan_perubahan TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Trigger: `trg_protect_audit_logs_immutability` menolak `UPDATE` dan `DELETE`.

#### 27. `public.template_import_santri` (Metadata Template Excel)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `versi TEXT NOT NULL`, `kolom_wajib TEXT[] NOT NULL`
