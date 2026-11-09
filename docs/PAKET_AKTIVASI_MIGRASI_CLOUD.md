# PAKET AKTIVASI MIGRASI CLOUD SUPABASE SIPETA
**Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur**  
**Target Proyek Supabase Cloud**: `jvhzrhfzkjqzlhsvvbgy` (`https://jvhzrhfzkjqzlhsvvbgy.supabase.co`)  
**Status Eksekusi Cloud**: Menunggu Eksekusi via Supabase Dashboard SQL Editor  
**Status Evaluasi Keamanan**: 100% AMAN (Berdasarkan `docs/FINAL_PRE_MIGRATION_SAFETY_REVIEW.md`)  
**Tanggal Rilis**: 9 November 2026

---

## 1. PETUNJUK RESMI EKSEKUSI ADMINISTRATOR IT

> [!IMPORTANT]
> Sesuai standar keamanan database Cloud Supabase, eksekusi perintah DDL (*Data Definition Language* seperti `ALTER TABLE`, `CREATE POLICY`, `CREATE TRIGGER`) tidak dibuka melalui PostgREST REST API publik demi mencegah eksploitasi remote.
> Eksekusi DDL secara resmi dan aman dilakukan melalui **Supabase Dashboard SQL Editor** oleh pemegang akses proyek:
> 👉 **[https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy/sql](https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy/sql)**

---

## 2. URUTAN EKSEKUSI & LIMA BERKAS SQL FINAL

Eksekusi **WAJIB** dilakukan secara berurutan:

```
[Tahap 1: 008_security_remediation.sql]
                  ↓
[Tahap 2: 009_username_support.sql]
                  ↓
[Tahap 3: 010_safe_delete_and_management.sql]
                  ↓
[Tahap 4: 011_must_change_password_and_import.sql]
                  ↓
[Tahap 5: 012_admin_rekening_and_role_matrix.sql]
```

### Rincian Berkas:
1. **Berkas 1**: `supabase/migrations/008_security_remediation.sql` (503 baris)
   - *Fungsi*: Mengunci 27 tabel operasional ke `TO authenticated` dan menutup kebocoran anon pada `tagihan`.
2. **Berkas 2**: `supabase/migrations/009_username_support.sql` (71 baris)
   - *Fungsi*: Menambahkan kolom `username` pada `public.profiles` dan menetapkan `username = 'superadmin'` untuk Superadmin resmi.
3. **Berkas 3**: `supabase/migrations/010_safe_delete_and_management.sql` (145 baris)
   - *Fungsi*: Menambahkan kolom `deleted_at`, `deleted_by`, dan triggers pencegahan hard delete data berelasi aktif.
4. **Berkas 4**: `supabase/migrations/011_must_change_password_and_import.sql` (34 baris)
   - *Fungsi*: Menambahkan kolom `must_change_password` dan indeks proteksi login pertama wali.
5. **Berkas 5**: `supabase/migrations/012_admin_rekening_and_role_matrix.sql` (50 baris)
   - *Fungsi*: Memperbarui hak kelola `rekening_pesantren` untuk Admin Administrasi bersama Superadmin.

---

## 3. QUERY VERIFIKASI PRA-MIGRASI (PRE-FLIGHT CHECK)

Jalankan query ini di SQL Editor **sebelum** mengeksekusi migrasi apa pun untuk memastikan integritas basis data saat ini:

```sql
-- PRE-FLIGHT 1: Pastikan Akun Superadmin Resmi Tersedia
SELECT id, email, role, is_active 
FROM public.profiles 
WHERE email = 'sipetaabumanshur@gmail.com';
-- Ekspektasi: 1 baris ditemukan, role = 'superadmin', is_active = true

-- PRE-FLIGHT 2: Pastikan 27 Tabel Sudah Terbentuk
SELECT count(*) AS total_tabel_public 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Ekspektasi: total_tabel_public >= 27

-- PRE-FLIGHT 3: Pastikan Kolom username Belum Ada (Membuktikan 009 belum jalan)
SELECT count(*) AS username_exists 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username';
-- Ekspektasi: 0
```

---

## 4. QUERY VERIFIKASI PER TAHAP EKSEKUSI

Setelah menjalankan setiap berkas SQL di Dashboard, jalankan query verifikasinya:

### Verifikasi Tahap 1 (Pasca-008):
```sql
-- Pastikan tidak ada policy tagihan yang terbuka untuk anon
SELECT count(*) AS anon_tagihan_policies 
FROM pg_policies 
WHERE tablename = 'tagihan' AND roles::text[] @> ARRAY['anon'::name];
-- Ekspektasi: 0 (Akses anonim tertutup)
```

### Verifikasi Tahap 2 (Pasca-009):
```sql
-- Pastikan kolom username terbentuk dan superadmin terisi
SELECT id, email, username, role 
FROM public.profiles 
WHERE email = 'sipetaabumanshur@gmail.com';
-- Ekspektasi: username = 'superadmin'
```

### Verifikasi Tahap 3 (Pasca-010):
```sql
-- Pastikan kolom soft-delete dan trigger terpasang
SELECT count(*) AS soft_delete_columns 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('santri', 'kelas', 'kamar') 
  AND column_name IN ('deleted_at', 'deleted_by');
-- Ekspektasi: 6 (2 kolom x 3 tabel)
```

### Verifikasi Tahap 4 (Pasca-011):
```sql
-- Pastikan kolom must_change_password terbentuk
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'must_change_password';
-- Ekspektasi: boolean, default false
```

### Verifikasi Tahap 5 (Pasca-012):
```sql
-- Pastikan policy rekening pesantren mencakup admin dan superadmin
SELECT policyname, roles, cmd 
FROM pg_policies 
WHERE tablename = 'rekening_pesantren' 
  AND policyname = 'Rekening Pesantren: superadmin dan admin dapat mengelola';
-- Ekspektasi: 1 baris aktif (ALL command)
```

---

## 5. PROSEDUR PEMULIHAN JIKA TERJADI GANGGUAN (ROLLBACK RUNBOOK)

Seluruh migrasi dibungkus dalam blok atomik `BEGIN ... COMMIT` sehingga kegagalan sintaks otomatis membatalkan perubahan parsial. Jika diperlukan rollback manual:

* **Rollback 012**:
  ```sql
  DROP POLICY IF EXISTS "Rekening Pesantren: superadmin dan admin dapat mengelola" ON public.rekening_pesantren;
  CREATE POLICY "Rekening Pesantren: hanya superadmin yang dapat mengelola"
  ON public.rekening_pesantren FOR ALL TO authenticated
  USING (public.get_my_role() = 'superadmin')
  WITH CHECK (public.get_my_role() = 'superadmin');
  ```
* **Rollback 011**:
  ```sql
  DROP INDEX IF EXISTS public.idx_profiles_must_change_pwd;
  ALTER TABLE public.profiles DROP COLUMN IF EXISTS must_change_password;
  ```
* **Rollback 010**:
  ```sql
  DROP TRIGGER IF EXISTS trg_prevent_hard_delete_santri ON public.santri;
  DROP FUNCTION IF EXISTS public.fn_prevent_hard_delete_santri_with_history();
  DROP TRIGGER IF EXISTS trg_prevent_delete_kamar ON public.kamar;
  DROP FUNCTION IF EXISTS public.fn_prevent_delete_kamar_with_active_santri();
  DROP TRIGGER IF EXISTS trg_prevent_delete_kelas ON public.kelas;
  DROP FUNCTION IF EXISTS public.fn_prevent_delete_kelas_with_active_santri();
  DROP INDEX IF EXISTS public.idx_santri_deleted_at;
  ALTER TABLE public.kamar DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
  ALTER TABLE public.kelas DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
  ALTER TABLE public.santri DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
  ```
* **Rollback 009**:
  ```sql
  DROP INDEX IF EXISTS public.idx_profiles_lower_username;
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_username_format;
  ALTER TABLE public.profiles DROP COLUMN IF EXISTS username;
  ```
