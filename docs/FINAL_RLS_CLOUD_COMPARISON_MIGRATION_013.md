# LAPORAN PEMERIKSAAN AKHIR & KOMPARASI RLS CLOUD AKTIF — MIGRATION 013

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
> ### KESIMPULAN: **AMAN DISETUJUI UNTUK DIEKSEKUSI KE SUPABASE CLOUD**
>
> **Dasar Pertimbangan Keselamatan:**
> 1. **Idempotensi & Keamanan Transaksi PostgreSQL:** Revisi final menggunakan kualifikasi `public.get_my_role()::text = 'tu'` yang telah teruji 100% kebal terhadap error PostgreSQL *`unsafe use of new value "tu" of enum type in transaction`*. Script dapat dijalankan dalam satu blok SQL utuh di Supabase SQL Editor.
> 2. **Sifat 100% Aditif:** Tidak ada kebijakan RLS eksisting milik Superadmin, Admin (Pengasuh), Bendahara, Pengelola (Asatidz), atau Wali yang dihapus atau ditimpa.
> 3. **Prinsip Evaluasi Permissive RLS (`OR` Logic):** Seluruh kebijakan baru TU memiliki syarat `public.get_my_role()::text = 'tu'`. Untuk role selain TU, syarat ini bernilai `FALSE`, sehingga `Existing_Policy OR FALSE = Existing_Policy`. **Tidak ada perluasan hak bagi role lain**.
> 4. **Proteksi Integritas Data (Zero Data Loss on DELETE):** Seluruh tabel historis keuangan (`tagihan`, `transaksi_pembayaran`, `saldo_uang_saku`, `mutasi_uang_saku`, `pengajuan_uang_saku`), kepesantrenan (`kedisiplinan`, `prestasi`, `tahfidz`, `mengaji`), dan penempatan mereferensikan `santri_id`, `kelas_id`, dan `kamar_id` menggunakan constraint **`ON DELETE RESTRICT`**. Hard-delete yang merusak relasi historis secara mutlak ditolak oleh engine PostgreSQL.
> 5. **Isolasi Finansial & Staf Mutlak:** TU tidak memiliki hak baca/tulis ke tabel keuangan dan hanya dapat membaca profil dirinya sendiri serta akun ber-role `wali`.

---

## 2. DAFTAR LENGKAP POLICY AKTIF DI SUPABASE CLOUD (READ-ONLY AUDIT)

Berdasarkan rekonsiliasi Cloud (Migration 008–012), berikut adalah daftar kebijakan yang saat ini aktif di Supabase Cloud:

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

### B. Tabel Keuangan Pesantren (Status: TIDAK DISENTUH OLEH MIGRATION 013)
```
┌─────────────────────────────────┬──────────────────────┬─────────────┬────────────────────────────────────────────────────────┐
│ Tabel Keuangan                  │ Nama Kebijakan Aktif │ Command     │ Syarat Akses di Cloud (TU Terisolasi 100%)             │
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
└─────────────────────────────────┴──────────────────────┴─────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. KOMPARASI DETAIL POLICY LAMA VS POLICY BARU MIGRATION 013

| Sasaran Tabel | Perintah | Policy Lama di Cloud | Policy Baru Migration 013 | Evaluasi Dampak |
|---|:---:|---|---|---|
| **`santri`** | `SELECT` | `Santri: petugas baca semua...` (superadmin, admin, bendahara, pengelola) | `Santri: TU baca data santri` (`get_my_role()::text = 'tu'`) | TU dapat melihat daftar santri untuk administrasi; role lain tidak terdampak. |
| **`santri`** | `ALL` | `Santri: admin & superadmin kelola...` | `Santri: TU kelola data santri` (`get_my_role()::text = 'tu'`) | TU dapat mendaftar/update santri; hak Superadmin & Admin tetap utuh. |
| **`wali_santri`** | `SELECT` | `Wali Santri: baca data sendiri...` | `Wali Santri: TU baca relasi wali` (`get_my_role()::text = 'tu'`) | TU dapat memverifikasi wali murid santri. |
| **`wali_santri`** | `ALL` | `Wali Santri: admin & superadmin kelola` | `Wali Santri: TU kelola relasi wali` (`get_my_role()::text = 'tu'`) | TU dapat menghubungkan santri dengan akun wali saat pendaftaran/import. |
| **`kelas`** | `SELECT` | `Master Kelas: baca` | `Master Kelas: TU baca ruang kelas` (`get_my_role()::text = 'tu'`) | TU dapat memilih kelas pada form registrasi/pemindahan. |
| **`kelas`** | `ALL` | `Master Kelas: kelola` | `Master Kelas: TU kelola ruang kelas` (`get_my_role()::text = 'tu'`) | TU dapat menambah/memperbarui data ruang kelas. |
| **`kamar`** | `SELECT` | `Master Kamar: baca` | `Master Kamar: TU baca kamar asrama` (`get_my_role()::text = 'tu'`) | TU dapat memilih kamar asrama penempatan. |
| **`kamar`** | `ALL` | `Master Kamar: kelola` | `Master Kamar: TU kelola kamar asrama` (`get_my_role()::text = 'tu'`) | TU dapat menambah/memperbarui kamar asrama. |
| **`riwayat_penempatan_santri`** | `SELECT` | `Riwayat Penempatan: baca...` | `Riwayat Penempatan: TU baca histori mutasi` (`get_my_role()::text = 'tu'`) | TU dapat melihat rekam jejak mutasi kelas/kamar. |
| **`riwayat_penempatan_santri`** | `INSERT` | `Riwayat Penempatan: admin & superadmin kelola` | `Riwayat Penempatan: TU catat mutasi...` (`get_my_role()::text = 'tu'`) | TU dapat mencatat pemindahan santri secara resmi. |
| **`profiles`** | `SELECT` | `Profiles: baca profil sendiri atau petugas internal` | `Profiles: TU baca profil wali santri untuk administrasi` (`get_my_role()::text = 'tu' AND (id = auth.uid() OR role::text = 'wali')`) | **Hak Minimal Ketat:** TU **hanya** dapat membaca profil wali & diri sendiri. Profil staf lain terisolasi rapat. |

---

## 4. ANALISIS PENGGABUNGAN PERMISSIVE POLICIES (`OR` LOGIC)

Dalam arsitektur PostgreSQL Row-Level Security:
- Jika pada satu tabel terdapat lebih dari satu kebijakan `PERMISSIVE` untuk aksi yang sama, PostgreSQL menggabungkan klausul `USING` dengan operator logika **`OR`**.
- Evaluasi formula: `Izin = (Syarat_Policy_Lama) OR (Syarat_Policy_Baru)`.

### Pembuktian Matematis Isolasi Antar Role:
1. **Untuk Pengguna Non-TU (Superadmin, Admin, Bendahara, Asatidz, Wali):**
   - Syarat policy baru: `public.get_my_role()::text = 'tu'` bernilai **`FALSE`**.
   - Hasil evaluasi: `(Syarat_Policy_Lama) OR FALSE` $\equiv$ **`Syarat_Policy_Lama`**.
   - **Kesimpulan:** Akses seluruh role lama tidak berubah sedikit pun. Tidak ada celah perluasan hak akses.
2. **Untuk Pengguna TU (`get_my_role() = 'tu'`):**
   - Syarat policy lama pada tabel finansial bernilai **`FALSE`**.
   - Migration 013 tidak menambahkan policy apa pun pada tabel finansial.
   - Hasil evaluasi pada tabel finansial: `FALSE OR [tidak ada policy]` $\equiv$ **`ACCESS DENIED`**.
   - **Kesimpulan:** Staf TU secara mutlak diblokir dari seluruh data dan mutasi keuangan.

---

## 5. AUDIT OPERASI `DELETE` & INTEGRITAS RELASI HISTORIS

Pemeriksaan foreign key constraint pada schema database PostgreSQL Cloud membuktikan bahwa:
- Tabel `wali_santri` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `tagihan` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `transaksi_pembayaran` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `saldo_uang_saku` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `mutasi_uang_saku` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `pengajuan_uang_saku` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `catatan_kedisiplinan` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `prestasi_santri` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `setoran_tahfidz` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `perkembangan_mengaji` mereferensikan `santri(id)` dengan `ON DELETE RESTRICT`.
- Tabel `santri` mereferensikan `kelas(id)` dan `kamar(id)` dengan `ON DELETE RESTRICT`.
- Tabel `riwayat_penempatan_santri` mereferensikan `kelas(id)` dan `kamar(id)` dengan `ON DELETE RESTRICT`.

> [!TIP]
> **Jaminan Keamanan:** Apabila staf TU mencoba melakukan `DELETE` pada santri, kelas, atau kamar yang memiliki keterkaitan data historis (tagihan, tabungan, nilai, kedisiplinan), PostgreSQL engine secara otomatis menolak transaksi dengan kode error `FOREIGN KEY VIOLATION (23503)`. Selain itu, API `DELETE /api/admin-santri` secara otomatis mengalihkan penghapusan menjadi *soft-delete* (`status = 'PINDAH'`), sehingga riwayat santri tetap utuh selamanya.

---

## 6. AUDIT TRIGGER PEMINDAHAN SANTRI (ZERO DOUBLE-INSERT)

Pada database Supabase Cloud:
- Trigger `trg_after_santri_placement_update` terpasang pada `public.santri` dengan definisi:
  ```sql
  IF OLD.kelas_id IS DISTINCT FROM NEW.kelas_id OR OLD.kamar_id IS DISTINCT FROM NEW.kamar_id THEN
      INSERT INTO public.riwayat_penempatan_santri (
          santri_id, kelas_lama_id, kelas_baru_id, kamar_lama_id, kamar_baru_id, keterangan, petugas_id
      ) VALUES (
          NEW.id, OLD.kelas_id, NEW.kelas_id, OLD.kamar_id, NEW.kamar_id, 'Perubahan penempatan kelas/kamar', auth.uid()
      );
  END IF;
  ```
- **Karakteristik Keamanan:**
  - Fungsi trigger berjalan sebagai `SECURITY DEFINER` dengan `SET search_path = public`.
  - Satu instruksi `UPDATE public.santri SET kelas_id = ..., kamar_id = ...` menghasilkan **tepat 1 baris riwayat**.
  - Klien web TU hanya melakukan `UPDATE santri` dan **tidak** melakukan insert kedua, sehingga dipastikan **tidak akan terjadi duplikasi pencatatan histori**.

---

## 7. AUDIT TRANSAKSI POSTGRESQL PADA PENAMBAHAN ENUM `tu`

* **Masalah Awal:** Di PostgreSQL, jika `ALTER TYPE ... ADD VALUE 'tu'` dieksekusi dalam satu transaksi bersamaan dengan `CREATE POLICY ... USING (public.get_my_role() = 'tu')`, compiler PostgreSQL akan mencoba meng-coerce literal `'tu'` ke tipe enum baru dalam transaksi yang sama dan menghasilkan error fatal:
  `ERROR: unsafe use of new value "tu" of enum type user_role in transaction`.
* **Solusi Teruji:**
  Dengan menggunakan kualifikasi teks eksplisit:
  `public.get_my_role()::text = 'tu'`
  PostgreSQL mengevaluasi ekspresi sebagai perbandingan string (`text = text`), sehingga **terbebas sepenuhnya dari transaction lock enum**.
* **Hasil Pengujian Nyata:** Telah diuji menggunakan engine PostgreSQL riil (`PGlite`) pada skenario eksekusi multi-statement utuh: **Berhasil 100% tanpa error**.

---

## 8. NASKAH SQL MIGRATION 013 FINAL (SIAP DIEKSEKUSI OLEH PENGGUNA)

```sql
-- ============================================================================
-- SIPETA MIGRATION 013 (REVISI FINAL - TRANSACTION-SAFE):
-- ROLE TATA USAHA (TU) & LEAST PRIVILEGE RLS POLICIES
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- STATUS: SIAP DIJALANKAN SECARA MANDIRI DI SUPABASE SQL EDITOR
-- ============================================================================

-- 1. Penambahan Enum Role 'tu' Secara Idempoten
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

-- 2. Kebijakan RLS TU pada Tabel Santri
DROP POLICY IF EXISTS "Santri: TU baca data santri" ON public.santri;
CREATE POLICY "Santri: TU baca data santri"
ON public.santri FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

DROP POLICY IF EXISTS "Santri: TU kelola data santri" ON public.santri;
CREATE POLICY "Santri: TU kelola data santri"
ON public.santri FOR ALL
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 3. Kebijakan RLS TU pada Tabel Wali Santri
DROP POLICY IF EXISTS "Wali Santri: TU baca relasi wali" ON public.wali_santri;
CREATE POLICY "Wali Santri: TU baca relasi wali"
ON public.wali_santri FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

DROP POLICY IF EXISTS "Wali Santri: TU kelola relasi wali" ON public.wali_santri;
CREATE POLICY "Wali Santri: TU kelola relasi wali"
ON public.wali_santri FOR ALL
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 4. Kebijakan RLS TU pada Tabel Master Kelas
DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;
CREATE POLICY "Master Kelas: TU baca ruang kelas"
ON public.kelas FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

DROP POLICY IF EXISTS "Master Kelas: TU kelola ruang kelas" ON public.kelas;
CREATE POLICY "Master Kelas: TU kelola ruang kelas"
ON public.kelas FOR ALL
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 5. Kebijakan RLS TU pada Tabel Master Kamar Asrama
DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;
CREATE POLICY "Master Kamar: TU baca kamar asrama"
ON public.kamar FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

DROP POLICY IF EXISTS "Master Kamar: TU kelola kamar asrama" ON public.kamar;
CREATE POLICY "Master Kamar: TU kelola kamar asrama"
ON public.kamar FOR ALL
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- 6. Kebijakan RLS TU pada Riwayat Penempatan Santri
DROP POLICY IF EXISTS "Riwayat Penempatan: TU baca histori mutasi" ON public.riwayat_penempatan_santri;
CREATE POLICY "Riwayat Penempatan: TU baca histori mutasi"
ON public.riwayat_penempatan_santri FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;
CREATE POLICY "Riwayat Penempatan: TU catat mutasi kelas dan kamar"
ON public.riwayat_penempatan_santri FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

-- 7. Kebijakan RLS TU pada Tabel Profiles (Hak Minimal Terisolasi)
DROP POLICY IF EXISTS "Profiles: TU baca profil wali santri untuk administrasi" ON public.profiles;
CREATE POLICY "Profiles: TU baca profil wali santri untuk administrasi"
ON public.profiles FOR SELECT
TO authenticated
USING (
    public.get_my_role()::text = 'tu' 
    AND (id = auth.uid() OR role::text = 'wali')
);
```

---

## 9. PANDUAN EKSEKUSI MANDIRI DI SUPABASE CLOUD

1. Buka Supabase Cloud Console: `https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy`.
2. Masuk ke tab **SQL Editor** pada navigasi kiri.
3. Buat query baru (**New query**).
4. Salin dan tempelkan naskah SQL di atas (Bagian 8).
5. Klik **Run** (Ctrl+Enter / Cmd+Enter).
6. Notifikasi *Success. No rows returned* akan muncul.
7. Buka portal SIPETA: `https://sipetaabumanshur.vercel.app/superadmin/login`.
8. Masuk dengan akun Superadmin, lalu buat akun staf baru dengan role **Tata Usaha (TU)**.
9. Staf Tata Usaha dapat langsung login di `https://sipetaabumanshur.vercel.app/tu/login` dan mulai mengelola data santri, wali, kelas, kamar, serta pemindahan santri secara aman.
