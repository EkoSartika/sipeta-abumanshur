# PANDUAN RESMI CADANGAN (BACKUP) & PEMULIHAN (DISASTER RECOVERY)
## SIPETA — Pondok Pesantren Modern Abu Manshur (Plered - Cirebon)

---

## 1. STRATEGI CADANGAN (BACKUP STRATEGY)

Pondok Pesantren Modern Abu Manshur menerapkan strategi cadangan berlapis untuk menjamin keberlanjutan operasional (*Business Continuity*) dan perlindungan terhadap kegagalan perangkat keras, bencana, maupun kelalaian manusia.

```
+-------------------------------------------------------------------+
|                     SIPETA BACKUP ARCHITECTURE                    |
+-------------------------------------------------------------------+
|  1. Daily Automated Cloud Snapshot (Supabase Managed WAL & Disk)  |
|  2. Weekly Logical Database Dump (pg_dump to Secure Cold Storage) |
|  3. Real-time Point-In-Time Recovery (PITR - Supabase Pro Tier)   |
|  4. Weekly Storage Buckets Sync (Bukti Pembayaran & Foto Saku)    |
|  5. Environment Variables & Metadata Disaster Runbook             |
+-------------------------------------------------------------------+
```

---

## 2. PROSEDUR CADANGAN MANUAL OLEH ADMINISTRATOR

### A. Cadangan Logis Database (pg_dump)
Jalankan perintah ini setiap hari Minggu atau sesaat sebelum mengeksekusi migrasi skema besar:

```bash
# 1. Siapkan direktori backup lokal terlindungi
mkdir -p /secure_backup/sipeta
cd /secure_backup/sipeta

# 2. Eksekusi pg_dump dengan kompresi biner kustom (-F c)
# Ganti PROJECT_REF dan DB_PASSWORD dengan kredensial dari Supabase Settings > Database
export PGPASSWORD="YOUR_SUPABASE_DB_PASSWORD"
pg_dump \
  -h "aws-0-ap-southeast-1.pooler.supabase.com" \
  -p 6543 \
  -U "postgres.YOUR_PROJECT_REF" \
  -d "postgres" \
  -F c \
  -b \
  -v \
  -f "sipeta_backup_$(date +%Y%m%d_%H%M%S).dump"

# 3. Buat hash checksum SHA-256 untuk memverifikasi integritas file
sha256sum "sipeta_backup_$(date +%Y%m%d_%H%M%S).dump" > "sipeta_backup_$(date +%Y%m%d_%H%M%S).dump.sha256"
```

### B. Cadangan Berkas Penyimpanan (Storage Buckets)
Cadangkan berkas fisik bukti transfer dan foto uang saku:
```bash
# Mengunduh seluruh objek dari bucket privat menggunakan Supabase CLI / AWS S3 Compatible CLI
supabase storage cp -r ss:///bukti-pembayaran ./storage_backup/bukti-pembayaran
supabase storage cp -r ss:///foto-penyerahan-saku ./storage_backup/foto-penyerahan-saku
```

---

## 3. PROSEDUR PEMULIHAN BENCANA (DISASTER RECOVERY)

### Skenario 1: Pemulihan Penuh Database dari File Dump (pg_restore)
Jika database mengalami korupsi atau kehilangan data:
1. **Aktifkan Mode Pemeliharaan (Maintenance Mode)**:
   Pada dashboard Vercel, arahkan traffic ke halaman pemeliharaan agar tidak ada pengguna yang menulis data selama proses restore.
2. **Jalankan Restore Database**:
   ```bash
   export PGPASSWORD="YOUR_SUPABASE_DB_PASSWORD"
   pg_restore \
     -h "aws-0-ap-southeast-1.pooler.supabase.com" \
     -p 6543 \
     -U "postgres.YOUR_PROJECT_REF" \
     -d "postgres" \
     -v \
     --clean \
     --if-exists \
     "sipeta_backup_TARGET.dump"
   ```
3. **Verifikasi Integritas Data**:
   Jalankan query verifikasi dari [`docs/FINAL_DATABASE_READINESS.md`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/docs/FINAL_DATABASE_READINESS.md#L90-L155).
4. **Nonaktifkan Mode Pemeliharaan**: Buka kembali akses publik di Vercel.

---

### Skenario 2: Pemulihan Ketika Migrasi Skema Gagal (Migration Rollback)
Setiap file migrasi di `supabase/migrations/` dilengkapi dengan skrip rollback idempoten:
- **Rollback Migrasi 012 (Hak Rekening)**:
  ```sql
  DROP POLICY IF EXISTS "Rekening Pesantren: superadmin dan admin dapat mengelola" ON public.rekening_pesantren;
  CREATE POLICY "Rekening Pesantren: hanya superadmin yang dapat mengelola"
  ON public.rekening_pesantren FOR ALL TO authenticated
  USING (public.get_my_role() = 'superadmin')
  WITH CHECK (public.get_my_role() = 'superadmin');
  ```
- **Rollback Migrasi 011 (Must Change Password)**:
  ```sql
  DROP INDEX IF EXISTS public.idx_profiles_must_change_pwd;
  ALTER TABLE public.profiles DROP COLUMN IF EXISTS must_change_password;
  ```
- **Rollback Migrasi 010 (Safe Delete)**:
  ```sql
  DROP TRIGGER IF EXISTS trg_prevent_hard_delete_santri ON public.santri;
  DROP FUNCTION IF EXISTS public.fn_prevent_hard_delete_santri_with_history();
  DROP TRIGGER IF EXISTS trg_prevent_delete_kamar ON public.kamar;
  DROP FUNCTION IF EXISTS public.fn_prevent_delete_kamar_with_active_santri();
  DROP TRIGGER IF EXISTS trg_prevent_delete_kelas ON public.kelas;
  DROP FUNCTION IF EXISTS public.fn_prevent_delete_kelas_with_active_santri();
  ALTER TABLE public.santri DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
  ALTER TABLE public.kelas DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
  ALTER TABLE public.kamar DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
  ```
- **Rollback Migrasi 009 (Username)**:
  ```sql
  DROP INDEX IF EXISTS public.idx_profiles_lower_username;
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_username_format;
  ALTER TABLE public.profiles DROP COLUMN IF EXISTS username;
  ```

---

### Skenario 3: Penanganan Ketidaksinkronan Akun Supabase Auth & Profiles
Jika akun Auth berhasil dibuat namun tabel `public.profiles` kehilangan datanya (*Orphaned Auth User*):
1. **Diagnosis Otomatis**:
   Jalankan query audit berikut di Supabase SQL Editor:
   ```sql
   -- Mencari user auth yang tidak memiliki data profil
   SELECT u.id, u.email, u.created_at
   FROM auth.users u
   LEFT JOIN public.profiles p ON u.id = p.id
   WHERE p.id IS NULL;
   ```
2. **Pemulihan Otomatis**:
   - Jika akun tersebut merupakan akun wali: buat ulang record profil menggunakan data dari `public.wali_santri` atau NIS santri terkait.
   - Jika akun adalah akun yatim sisa percobaan gagal: hapus akun auth terkait melalui Supabase Admin API atau Supabase Authentication Dashboard:
     ```bash
     # Hapus akun Auth yatim via Admin API agar email/username dapat didaftarkan kembali
     DELETE FROM auth.users WHERE id = 'ORPHAN_USER_UUID';
     ```

---

### Skenario 4: Penanganan Kegagalan Proses Impor Massal Excel
1. Backend `/api/admin-santri/import` telah dilengkapi mekanisme **kompensasi rollback per-baris**:
   - Jika pembuatan profil atau relasi wali gagal pada baris ke-$N$, sistem secara otomatis menghapus user auth yang baru dibuat pada baris tersebut.
   - Database mengembalikan respons terperinci mencantumkan nomor baris Excel yang berhasil dan nomor baris yang gagal beserta alasannya.
2. Administrator cukup memperbaiki baris yang gagal pada berkas Excel, lalu mengunggah ulang hanya baris-baris tersebut tanpa risiko menduplikasi data yang sudah berhasil.

---

### Skenario 5: Penanganan Gangguan Layanan Cloud (Supabase / Vercel Down)
1. **Gangguan Supabase**:
   - Jika Supabase mengalami gangguan jaringan regional, aplikasi secara otomatis menampilkan banner status ramah pengguna: *"Koneksi database terputus sementara. Tim teknis sedang menangani kendala ini."*
   - Data transaksi yang belum terverifikasi aman di database dan tidak akan hilang.
2. **Gangguan Vercel**:
   - Repository GitHub `https://github.com/EkoSartika/sipeta-abumanshur` siap di-redeploy ke platform alternatif (contoh: Render, Railway, AWS ECS) dalam waktu kurang dari 15 menit menggunakan konfigurasi standard Node.js Next.js standalone container.

---

## 4. AUDIT KEBOCORAN KREDENSIAL (SECRET SAFETY)

SIPETA mematuhi standar keamanan zero-secret pada kode sumber:
1. **File `.env.local`**: Berada dalam daftar `.gitignore` dan tidak pernah di-commit ke repository publik/GitHub.
2. **Kredensial Server (`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`)**:
   - Dikelola secara eksklusif melalui menu *Settings > Environment Variables* di dashboard Vercel.
   - Diberi batasan *Serverless Runtime Only* dan tidak pernah memiliki prefiks `NEXT_PUBLIC_`.
3. **Penyimpanan Password**:
   - Seluruh kata sandi dienkripsi menggunakan algoritma bcrypt standar Supabase Auth.
   - Tidak ada kolom password plaintext di tabel database mana pun.
   - Seluruh audit log mensterilkan kata sandi sebelum dicatat ke database.

