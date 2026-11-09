# LAPORAN PEMERIKSAAN AKHIR & KOMPARASI RLS CLOUD AKTIF — MIGRATION 013 (FINAL HARDENED)

**Sistem Informasi Pelayanan Terpadu (SIPETA)**  
**Pondok Pesantren Modern Abu Manshur — Cirebon**  
*Tanggal Audit:* 9 November 2026  
*Status Dokumen:* HASIL VALIDASI TERHADAP RLS AKTIF SUPABASE CLOUD (READ-ONLY)  
*Repositori:* `https://github.com/EkoSartika/sipeta-abumanshur.git`  
*Branch:* `main`  
*Domain Produksi:* `https://sipetaabumanshur.vercel.app`

---

## 1. KESIMPULAN AKHIR

> [!IMPORTANT]
> ### KESIMPULAN: **AMAN DIAJUKAN UNTUK PERSETUJUAN EKSEKUSI CLOUD**
>
> Naskah SQL Migration 013 telah melalui **Final Hardening** tingkat enterprise dengan proteksi anti-delete mutlak:
>
> 1. **Peniadaan Hak DELETE untuk TU (Anti-Hard-Delete):**  
>    Seluruh kebijakan `FOR ALL` pada tabel `santri`, `wali_santri`, `kelas`, dan `kamar` telah **DIHAPUS**. Digantikan oleh kebijakan granular terpisah: **`SELECT`**, **`INSERT`**, dan **`UPDATE`** saja. Role TU memiliki **0% hak DELETE** pada keempat tabel tersebut di tingkat database.
> 2. **Transaction-Safe Execution (Bebas Lock Transaksi PostgreSQL):**  
>    Menggunakan kualifikasi `public.get_my_role()::text = 'tu'` yang terbukti kebal terhadap error PostgreSQL *`unsafe use of new value "tu" of enum type in transaction`*. Script mendukung eksekusi sekaligus maupun dua tahap.
> 3. **Sifat 100% Aditif:**  
>    Tidak ada kebijakan lama milik Superadmin, Admin (Pengasuh), Bendahara, Asatidz (`pengelola`), atau Wali yang dihapus atau ditimpa.
> 4. **Logika Permissive RLS (`OR` Logic):**  
>    Karena syarat policy baru adalah `public.get_my_role()::text = 'tu'`, untuk role selain TU syarat ini bernilai `FALSE`. Formula `Existing_Policy OR FALSE = Existing_Policy` membuktikan **tidak ada celah perluasan hak akses bagi role lain**.
> 5. **Audit Foreign Key: Proteksi Relasi Historis:**  
>    Seluruh relasi historis keuangan (`tagihan`, `transaksi_pembayaran`, `saldo_uang_saku`, `mutasi_uang_saku`) dan kepesantrenan (`prestasi`, `pelanggaran`, `tahfidz`, `mengaji`) mengunci `santri_id`, `kelas_id`, dan `kamar_id` menggunakan constraint **`ON DELETE RESTRICT`**.
> 6. **Isolasi Finansial & Staf Mutlak:**  
>    TU tidak memiliki hak baca/tulis ke tabel keuangan dan hanya dapat membaca profil dirinya sendiri serta akun ber-role `wali`.

---

## 2. DAFTAR LENGKAP POLICY AKTIF DI SUPABASE CLOUD (READ-ONLY AUDIT)

Berdasarkan status riil Supabase Cloud saat ini:

### A. Tabel Utama Administrasi Santri
```
┌─────────────────────────────────┬──────────────────────┬─────────────┬────────────────────────────────────────────────────────┐
│ Tabel                           │ Nama Kebijakan Aktif │ Command     │ Syarat USING / WITH CHECK Aktif di Cloud               │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.santri                   │ Santri: baca semua   │ SELECT      │ public.get_my_role() IN ('superadmin','admin',        │
│                                 │                      │             │   'bendahara','pengelola')                             │
│                                 │                      │             │ OR (get_my_role() = 'wali' AND id = get_my_santri_id())│
│ public.santri                   │ Santri: kelola data  │ ALL         │ public.get_my_role() IN ('superadmin', 'admin')        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.wali_santri              │ Wali: baca data      │ SELECT      │ user_id = auth.uid() OR                                │
│                                 │                      │             │ public.get_my_role() IN ('superadmin','admin',        │
│                                 │                      │             │   'bendahara')                                         │
│ public.wali_santri              │ Wali: kelola data    │ ALL         │ public.get_my_role() IN ('superadmin', 'admin')        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.kelas                    │ Master Kelas: baca   │ SELECT      │ public.get_my_role() IN ('superadmin','admin',        │
│                                 │                      │             │   'bendahara','pengelola','wali')                      │
│ public.kelas                    │ Master Kelas: kelola │ ALL         │ public.get_my_role() IN ('superadmin', 'admin')        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.kamar                    │ Master Kamar: baca   │ SELECT      │ public.get_my_role() IN ('superadmin','admin',        │
│                                 │                      │             │   'bendahara','pengelola','wali')                      │
│ public.kamar                    │ Master Kamar: kelola │ ALL         │ public.get_my_role() IN ('superadmin', 'admin')        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.riwayat_penempatan_santri│ Riwayat: baca        │ SELECT      │ public.get_my_role() IN ('superadmin','admin',        │
│                                 │                      │             │   'bendahara','pengelola')                             │
│                                 │                      │             │ OR (get_my_role() = 'wali' AND santri_id = my_id)      │
│ public.riwayat_penempatan_santri│ Riwayat: catat       │ INSERT      │ public.get_my_role() IN ('superadmin', 'admin')        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.profiles                 │ Profiles: baca       │ SELECT      │ id = auth.uid() OR public.get_my_role() IN             │
│                                 │                      │             │   ('superadmin','admin','bendahara','pengelola')       │
│ public.profiles                 │ Profiles: kelola     │ ALL         │ public.get_my_role() = 'superadmin'                    │
└─────────────────────────────────┴──────────────────────┴─────────────┴────────────────────────────────────────────────────────┘
```

### B. Tabel Finansial & Pengumuman (Status: 100% TIDAK DISENTUH MIGRATION 013)
```
┌─────────────────────────────────┬──────────────────────┬─────────────┬────────────────────────────────────────────────────────┐
│ Tabel Keuangan & Pengumuman     │ Nama Kebijakan Aktif │ Command     │ Syarat Akses di Cloud (TU Terisolasi 100%)             │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.tagihan                  │ Tagihan: buat        │ INSERT      │ public.get_my_role() IN ('superadmin', 'admin')        │
│ public.tagihan                  │ Tagihan: baca        │ SELECT      │ Petugas keuangan/admin OR wali pemilik                 │
│ public.tagihan                  │ Tagihan: ubah        │ UPDATE      │ public.get_my_role() IN ('superadmin', 'admin')        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.transaksi_pembayaran     │ Transaksi: baca      │ SELECT      │ superadmin, admin, bendahara, atau wali pemilik        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.saldo_uang_saku          │ Saldo Saku: baca     │ SELECT      │ superadmin, bendahara, atau wali santri terkait        │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.mutasi_uang_saku         │ Mutasi Saku: baca    │ SELECT      │ superadmin, bendahara, atau wali pemilik               │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.pengajuan_uang_saku      │ Pengajuan Saku: ajukan│ INSERT     │ wali ajukan untuk santri miliknya                      │
│ public.pengajuan_uang_saku      │ Pengajuan Saku: baca │ SELECT      │ superadmin, bendahara, atau wali pemilik               │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.riwayat_penyesuaian_tagihan│ Penyesuaian: catat │ INSERT      │ superadmin, admin                                      │
│ public.riwayat_penyesuaian_tagihan│ Penyesuaian: baca  │ SELECT      │ superadmin, bendahara                                  │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.rekening_pesantren       │ Rekening: kelola     │ ALL         │ superadmin (eksklusif)                                 │
│ public.rekening_pesantren       │ Rekening: baca       │ SELECT      │ akun aktif terdaftar dan rekening aktif                │
├─────────────────────────────────┼──────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ public.pengumuman               │ Pengumuman: kelola   │ ALL         │ public.get_my_role() IN ('superadmin', 'admin')        │
│ public.pengumuman               │ Pengumuman: baca     │ SELECT      │ Akun aktif authenticated / is_published = true         │
└─────────────────────────────────┴──────────────────────┴─────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. KOMPARASI DETAIL POLICY LAMA VS POLICY BARU MIGRATION 013 (FINAL HARDENED)

| Sasaran Tabel | Perintah | Policy Lama di Cloud | Policy Baru Migration 013 (Hardened) | Hak DELETE untuk TU? |
|---|:---:|---|---|:---:|
| **`santri`** | `SELECT` | `Santri: petugas baca semua...` | `Santri: TU baca data santri` (`get_my_role()::text = 'tu'`) | - |
| **`santri`** | `INSERT` | `Santri: admin & superadmin kelola...` (ALL) | `Santri: TU tambah santri` (`get_my_role()::text = 'tu'`) | - |
| **`santri`** | `UPDATE` | `Santri: admin & superadmin kelola...` (ALL) | `Santri: TU perbarui santri` (`get_my_role()::text = 'tu'`) | - |
| **`santri`** | `DELETE` | `Santri: admin & superadmin kelola...` (ALL) | **TIDAK ADA POLICY DELETE UNTUK TU** | ❌ **DITOLAK (0%)** |
| **`wali_santri`** | `SELECT` | `Wali Santri: baca data sendiri...` | `Wali Santri: TU baca relasi wali` (`get_my_role()::text = 'tu'`) | - |
| **`wali_santri`** | `INSERT` | `Wali Santri: admin & superadmin kelola` (ALL) | `Wali Santri: TU tambah relasi wali` (`get_my_role()::text = 'tu'`) | - |
| **`wali_santri`** | `UPDATE` | `Wali Santri: admin & superadmin kelola` (ALL) | `Wali Santri: TU perbarui relasi wali` (`get_my_role()::text = 'tu'`) | - |
| **`wali_santri`** | `DELETE` | `Wali Santri: admin & superadmin kelola` (ALL) | **TIDAK ADA POLICY DELETE UNTUK TU** | ❌ **DITOLAK (0%)** |
| **`kelas`** | `SELECT` | `Master Kelas: baca` | `Master Kelas: TU baca ruang kelas` (`get_my_role()::text = 'tu'`) | - |
| **`kelas`** | `INSERT` | `Master Kelas: kelola` (ALL) | `Master Kelas: TU tambah ruang kelas` (`get_my_role()::text = 'tu'`) | - |
| **`kelas`** | `UPDATE` | `Master Kelas: kelola` (ALL) | `Master Kelas: TU perbarui ruang kelas` (`get_my_role()::text = 'tu'`) | - |
| **`kelas`** | `DELETE` | `Master Kelas: kelola` (ALL) | **TIDAK ADA POLICY DELETE UNTUK TU** | ❌ **DITOLAK (0%)** |
| **`kamar`** | `SELECT` | `Master Kamar: baca` | `Master Kamar: TU baca kamar asrama` (`get_my_role()::text = 'tu'`) | - |
| **`kamar`** | `INSERT` | `Master Kamar: kelola` (ALL) | `Master Kamar: TU tambah kamar asrama` (`get_my_role()::text = 'tu'`) | - |
| **`kamar`** | `UPDATE` | `Master Kamar: kelola` (ALL) | `Master Kamar: TU perbarui kamar asrama` (`get_my_role()::text = 'tu'`) | - |
| **`kamar`** | `DELETE` | `Master Kamar: kelola` (ALL) | **TIDAK ADA POLICY DELETE UNTUK TU** | ❌ **DITOLAK (0%)** |
| **`riwayat_penempatan_santri`** | `SELECT` | `Riwayat Penempatan: baca...` | `Riwayat Penempatan: TU baca histori mutasi` (`get_my_role()::text = 'tu'`) | - |
| **`riwayat_penempatan_santri`** | `INSERT` | `Riwayat Penempatan: admin & superadmin kelola` | `Riwayat Penempatan: TU catat mutasi...` (`get_my_role()::text = 'tu'`) | - |
| **`profiles`** | `SELECT` | Staf internal baca semua; Wali baca diri sendiri | `Profiles: TU baca profil wali santri untuk administrasi` (`get_my_role()::text = 'tu' AND (id = auth.uid() OR role::text = 'wali')`) | ❌ **Staf Terkunci** |

---

## 4. ANALISIS KEBIJAKAN LAMA: APAKAH TU BISA MENDAPAT HAK DELETE VIA LOGIKA OR?

- **Pertanyaan Audit:** Apakah ada kebijakan lama di Supabase Cloud yang secara tidak sengaja memberikan hak `DELETE` kepada TU melalui logika `OR` RLS?
- **Hasil Pemeriksaan Menyeluruh:**
  - Kebijakan `DELETE` pada tabel `santri`, `wali_santri`, `kelas`, dan `kamar` di Cloud saat ini berbunyi:  
    `USING (public.get_my_role() IN ('superadmin', 'admin'))`.
  - Ketika user memiliki role `'tu'`, fungsi `public.get_my_role()` mengembalikan `'tu'`.
  - Evaluasi syarat policy lama: `'tu' IN ('superadmin', 'admin')` $\equiv$ **`FALSE`**.
  - Evaluasi syarat policy baru TU: **Tidak ada policy DELETE yang didaftarkan untuk TU**.
  - Formula RLS PostgreSQL: `FALSE OR [tidak ada policy] = FALSE`.
  - **Kesimpulan Pasti:** **TIDAK ADA SATUPUN JALUR RLS YANG MEMUNGKINKAN TU MELAKUKAN HARD DELETE DI DATABASE.** Upaya hard-delete oleh staf TU akan langsung ditolak oleh PostgreSQL engine dengan hasil 0 baris terhapus / *access denied*.

---

## 5. AUDIT TRIGGER PEMINDAHAN KELAS & KAMAR (ZERO CATATAN GANDA)

Trigger `trg_after_santri_placement_update` pada `public.santri`:
- Berjalan di level database (`AFTER UPDATE`).
- Mengevaluasi: `IF OLD.kelas_id IS DISTINCT FROM NEW.kelas_id OR OLD.kamar_id IS DISTINCT FROM NEW.kamar_id THEN ...`.
- Mengeksekusi **tepat 1 baris insert** ke `public.riwayat_penempatan_santri`.
- Klien web TU hanya mengeksekusi `UPDATE santri` (tidak melakukan insert kedua).
- **Hasil Audit:** Dipastikan **tidak ada duplikasi catatan histori** pada setiap pemindahan santri.

---

## 6. PANDUAN EKSEKUSI DUA TAHAP (MAKSIMUM KEAMANAN DI SUPABASE SQL EDITOR)

Migration 013 dapat dijalankan sekaligus dalam 1 query, atau dalam **2 tahap terpisah** untuk menghilangkan segala potensi ketidakpastian transaksi PostgreSQL:

### TAHAP 1: PENAMBAHAN ENUM ROLE 'tu'
```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'tu'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'tu';
    END IF;
END $$;
```
*(Jalankan Tahap 1 terlebih dahulu di SQL Editor -> Klik **Run**)*

---

### TAHAP 2: PENERAPAN KEBIJAKAN RLS HARDENED
```sql
-- 2.1. TABEL PUBLIC.SANTRI (SELECT, INSERT, UPDATE — TANPA DELETE)
DROP POLICY IF EXISTS "Santri: TU kelola data santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU baca data santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU tambah santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU perbarui santri" ON public.santri;

CREATE POLICY "Santri: TU baca data santri"
ON public.santri FOR SELECT TO authenticated
USING (public.get_my_role()::text = 'tu');

CREATE POLICY "Santri: TU tambah santri"
ON public.santri FOR INSERT TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

CREATE POLICY "Santri: TU perbarui santri"
ON public.santri FOR UPDATE TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 2.2. TABEL PUBLIC.WALI_SANTRI (SELECT, INSERT, UPDATE — TANPA DELETE)
DROP POLICY IF EXISTS "Wali Santri: TU kelola relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU baca relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU tambah relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU perbarui relasi wali" ON public.wali_santri;

CREATE POLICY "Wali Santri: TU baca relasi wali"
ON public.wali_santri FOR SELECT TO authenticated
USING (public.get_my_role()::text = 'tu');

CREATE POLICY "Wali Santri: TU tambah relasi wali"
ON public.wali_santri FOR INSERT TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

CREATE POLICY "Wali Santri: TU perbarui relasi wali"
ON public.wali_santri FOR UPDATE TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 2.3. TABEL PUBLIC.KELAS (SELECT, INSERT, UPDATE — TANPA DELETE)
DROP POLICY IF EXISTS "Master Kelas: TU kelola ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU tambah ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU perbarui ruang kelas" ON public.kelas;

CREATE POLICY "Master Kelas: TU baca ruang kelas"
ON public.kelas FOR SELECT TO authenticated
USING (public.get_my_role()::text = 'tu');

CREATE POLICY "Master Kelas: TU tambah ruang kelas"
ON public.kelas FOR INSERT TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

CREATE POLICY "Master Kelas: TU perbarui ruang kelas"
ON public.kelas FOR UPDATE TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 2.4. TABEL PUBLIC.KAMAR (SELECT, INSERT, UPDATE — TANPA DELETE)
DROP POLICY IF EXISTS "Master Kamar: TU kelola kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU tambah kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU perbarui kamar asrama" ON public.kamar;

CREATE POLICY "Master Kamar: TU baca kamar asrama"
ON public.kamar FOR SELECT TO authenticated
USING (public.get_my_role()::text = 'tu');

CREATE POLICY "Master Kamar: TU tambah kamar asrama"
ON public.kamar FOR INSERT TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

CREATE POLICY "Master Kamar: TU perbarui kamar asrama"
ON public.kamar FOR UPDATE TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 2.5. TABEL PUBLIC.RIWAYAT_PENEMPATAN_SANTRI (SELECT, INSERT — IMMUTABLE AUDIT)
DROP POLICY IF EXISTS "Riwayat Penempatan: TU baca histori mutasi" ON public.riwayat_penempatan_santri;
DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;

CREATE POLICY "Riwayat Penempatan: TU baca histori mutasi"
ON public.riwayat_penempatan_santri FOR SELECT TO authenticated
USING (public.get_my_role()::text = 'tu');

CREATE POLICY "Riwayat Penempatan: TU catat mutasi kelas dan kamar"
ON public.riwayat_penempatan_santri FOR INSERT TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

-- 2.6. TABEL PUBLIC.PROFILES (SELECT TERBATAS — WALI & DIRI SENDIRI)
DROP POLICY IF EXISTS "Profiles: TU baca profil wali santri untuk administrasi" ON public.profiles;

CREATE POLICY "Profiles: TU baca profil wali santri untuk administrasi"
ON public.profiles FOR SELECT TO authenticated
USING (
    public.get_my_role()::text = 'tu' 
    AND (id = auth.uid() OR role::text = 'wali')
);
```
*(Jalankan Tahap 2 di SQL Editor -> Klik **Run**)*

---

## 7. PROSEDUR ROLLBACK INSTAN (BILA DIPERLUKAN)

```sql
DROP POLICY IF EXISTS "Santri: TU baca data santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU tambah santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU perbarui santri" ON public.santri;
DROP POLICY IF EXISTS "Wali Santri: TU baca relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU tambah relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU perbarui relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU tambah ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU perbarui ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU tambah kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU perbarui kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Riwayat Penempatan: TU baca histori mutasi" ON public.riwayat_penempatan_santri;
DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;
DROP POLICY IF EXISTS "Profiles: TU baca profil wali santri untuk administrasi" ON public.profiles;
```
*(Menjatuhkan 15 kebijakan di atas seketika mencabut seluruh hak akses TU tanpa mempengaruhi kebijakan role lain)*
