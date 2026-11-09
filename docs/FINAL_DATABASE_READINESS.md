# FINAL DATABASE READINESS REPORT & RUNBOOK
## SIPETA — Sistem Informasi Pelayanan Terpadu
### Pondok Pesantren Modern Abu Manshur (Plered - Cirebon)

Dokumen ini disusun untuk Administrator Database dan Tim Teknis Pondok Pesantren Modern Abu Manshur sebagai panduan resmi kesiapan database, urutan migrasi, query verifikasi integritas, mitigasi risiko, serta prosedur backup dan pemulihan (*disaster recovery*).

> [!IMPORTANT]
> **KEBIJAKAN KESELAMATAN DATA PRODUKSI**:
> Tidak ada migrasi otomatis yang dijalankan ke database Supabase Cloud. Seluruh skrip SQL dalam dokumen ini telah diverifikasi 100% pada lingkungan pengujian PostgreSQL terisolasi (PGlite & Supabase Local Engine) dan siap dijalankan oleh Administrator resmi melalui **Supabase Cloud SQL Editor**. Akun Superadmin resmi (`sipetaabumanshur@gmail.com`) dan rekening resmi pesantren **dijamin tetap aman dan terlindungi**.

---

## 1. PANDUAN STATUS KONEKSI & DIAGNOSIS SKEMA DATABASE

Untuk menghindari kerancuan antara database yang belum dimigrasi dengan database yang sudah termigrasi namun belum memiliki baris data, SIPETA menerapkan klasifikasi 5 status skema:

| Status Skema | Status Koneksi HTTP | Deskripsi Teknis | Tindakan Administrator |
|---|---|---|---|
| **NOT_CONFIGURED** | 200 (Mode Simulasi) | Variabel `NEXT_PUBLIC_SUPABASE_URL` atau Key belum diatur di Vercel. | Isi Environment Variables di Vercel lalu Redeploy. |
| **CONNECTION_FAILED** | 503 / 500 (Gagal) | URL salah, Key tidak valid, atau jaringan Supabase terputus. | Periksa kredensial Project Supabase dan status jaringan. |
| **TABLES_MISSING** (`CONNECTED_UNMIGRATED`) | 200 (Belum Migrasi) | Terhubung ke PostgreSQL, namun tabel belum dibuat (Error `42P01` / `PGRST205`). | Jalankan migrasi berurutan (`0001` s.d. `012`). |
| **SCHEMA_READY_EMPTY** (`CONNECTED_EMPTY_DATA`) | 200 (Skema Siap, Data Kosong) | **Seluruh 27 tabel dan RLS sudah aktif**, namun baris data masih kosong (belum ada santri/transaksi). | Skema siap operasional. Jalankan seed Superadmin. |
| **SCHEMA_READY_WITH_DATA** (`CONNECTED_HEALTHY`) | 200 (Operasional Sehat) | Skema lengkap, RLS aktif, dan data master pengguna terverifikasi. | Database siap penuh digunakan oleh santri dan asatidz. |

---

## 2. URUTAN RESMI MIGRASI DATABASE (0001 s.d. 012)

Migrasi database SIPETA dirancang secara modular, idempoten, dan menjaga integritas referensial. Administrator harus mengeksekusi migrasi sesuai urutan kronologis berikut di **Supabase Cloud SQL Editor**:

```
0001_enums_and_extensions.sql       --> Tipe ENUM dan ekstensi pgcrypto
0002_core_admin_tables.sql          --> Tabel Profil, Santri, Kelas, Kamar, Wali
0003_payment_and_billing_tables.sql --> Rekening Resmi, Tagihan, Cicilan, Pembayaran
0004_pocket_money_ledger_tables.sql --> Saldo & Ledger Mutasi Uang Saku (Append-Only)
0005_kepesantrenan_and_audit_tables.sql --> Tahfidz, Kedisiplinan, Prestasi, Audit Log
0006_atomic_rpcs_and_triggers.sql   --> Trigger Ledger, Immutability Audit, RPC Transaksi
0007_rls_and_storage_policies.sql   --> Kebijakan Row Level Security & Private Storage
008_security_remediation.sql        --> Rekonsiliasi Kebijakan RLS, Search Path, Hardening
009_username_support.sql            --> Kolom Username, Constraint Format, Case-Insensitive Index
010_safe_delete_and_management.sql  --> Soft Delete (`deleted_at`), Trigger Proteksi Relasi Keuangan
011_must_change_password_and_import.sql --> Kolom `must_change_password` & Indeks Akun Wali Berbasis NIS
012_admin_rekening_and_role_matrix.sql  --> Otorisasi Pengelolaan Rekening oleh Admin & Superadmin
```

### Rincian Migrasi Utama Terkini:

#### A. Migrasi 009: Dukungan Username Internal (`009_username_support.sql`)
- Menambahkan kolom `username TEXT` pada `public.profiles`.
- Menambahkan constraint format `chk_profiles_username_format` (`^[a-z0-9_.-]{3,30}$`).
- Menambahkan indeks unik `idx_profiles_lower_username` pada `LOWER(username)`.
- Mengamankan akun `sipetaabumanshur@gmail.com` dengan username tetap `superadmin`.

#### B. Migrasi 010: Safe Deletion & Integritas Relasional (`010_safe_delete_and_management.sql`)
- Menambahkan kolom `deleted_at TIMESTAMPTZ` dan `deleted_by UUID` pada `santri`, `kelas`, dan `kamar`.
- Trigger `trg_prevent_hard_delete_santri`: Memblokir penghapusan fisik santri yang memiliki riwayat tagihan, pembayaran, mutasi uang saku, atau setoran tahfidz.
- Trigger `trg_prevent_delete_kelas` dan `trg_prevent_delete_kamar`: Mencegah penghapusan kelas/kamar yang masih dihuni santri aktif.

#### C. Migrasi 011: Wajib Ganti Password Login Awal Wali (`011_must_change_password_and_import.sql`)
- Menambahkan kolom `must_change_password BOOLEAN NOT NULL DEFAULT FALSE` pada `public.profiles`.
- Indeks performa `idx_profiles_must_change_pwd` khusus untuk akun yang wajib ganti password.
- Mendukung otomatisasi pembuatan akun wali santri berbasis NIS pada import Excel.

#### D. Migrasi 012: Matriks Otorisasi Rekening Pesantren (`012_admin_rekening_and_role_matrix.sql`)
- Memperluas kebijakan RLS `public.rekening_pesantren`: Superadmin dan Admin Administrasi berwenang penuh mengelola rekening (`ALL`).
- Bendahara, Pengelola, dan Wali Santri aktif diberikan hak baca (`SELECT`) pada rekening aktif (`is_active = true`).
- Mempertahankan integritas `idx_single_active_rekening_pesantren` (hanya 1 rekening BSI yang boleh berstatus aktif serentak).

---

## 3. QUERY VERIFIKASI LENGKAP PASCA-MIGRASI

Jalankan skrip verifikasi berikut pada **Supabase Cloud SQL Editor** untuk membuktikan bahwa seluruh struktur database telah terpasang dengan sempurna:

```sql
-- ============================================================================
-- VERIFIKASI 1: JUMLAH TABEL DAN STATUS ROW LEVEL SECURITY (RLS)
-- Ekspektasi: 27 tabel pada skema public, seluruhnya memiliki rls_enabled = true
-- ============================================================================
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================================================
-- VERIFIKASI 2: JUMLAH KEBIJAKAN ROW LEVEL SECURITY (RLS POLICIES)
-- Ekspektasi: 49 kebijakan tabel publik (48 authenticated, 1 anon pada pengumuman)
-- ============================================================================
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles, 
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- VERIFIKASI 3: VERIFIKASI KOLOM MIGRASI TERBARU (009, 010, 011)
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'profiles' AND column_name IN ('username', 'must_change_password')) OR
    (table_name = 'santri' AND column_name IN ('deleted_at', 'deleted_by')) OR
    (table_name = 'kelas' AND column_name IN ('deleted_at', 'deleted_by')) OR
    (table_name = 'kamar' AND column_name IN ('deleted_at', 'deleted_by'))
  )
ORDER BY table_name, column_name;

-- ============================================================================
-- VERIFIKASI 4: VERIFIKASI KEBIJAKAN REKENING PESANTREN (MIGRASI 012)
-- ============================================================================
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'rekening_pesantren';

-- ============================================================================
-- VERIFIKASI 5: VERIFIKASI PRIVATE STORAGE BUCKETS
-- Ekspektasi: 3 bucket private (bukti-pembayaran, bukti-uang-saku, foto-penyerahan-saku)
-- ============================================================================
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('bukti-pembayaran', 'bukti-uang-saku', 'foto-penyerahan-saku');

-- ============================================================================
-- VERIFIKASI 6: VERIFIKASI INTEGRITAS TRIGGER IMMUTABILITY AUDIT LOG
-- ============================================================================
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'audit_logs'
  AND trigger_name = 'trg_protect_audit_logs_immutability';
```

---

## 4. PROSEDUR INISIALISASI SUPERADMIN PERTAMA (BOOTSTRAP)

Setelah migrasi 0001–012 berhasil dijalankan, Administrator dapat menginisialisasi akun Superadmin resmi menggunakan skrip aman berikut:

```sql
-- ============================================================================
-- BOOTSTRAP SUPERADMIN RESMI PONDOK PESANTREN MODERN ABU MANSHUR
-- Identitas Login: sipetaabumanshur@gmail.com
-- ============================================================================
DO $$
DECLARE
    v_admin_id UUID;
BEGIN
    -- Cari ID akun dari auth.users
    SELECT id INTO v_admin_id 
    FROM auth.users 
    WHERE email = 'sipetaabumanshur@gmail.com';

    IF v_admin_id IS NOT NULL THEN
        -- Sinkronisasi ke public.profiles
        INSERT INTO public.profiles (
            id, 
            nama_lengkap, 
            email, 
            username, 
            no_telepon, 
            role, 
            is_active, 
            must_change_password,
            created_at, 
            updated_at
        ) VALUES (
            v_admin_id,
            'Superadmin Abu Manshur',
            'sipetaabumanshur@gmail.com',
            'superadmin',
            '081234567890',
            'superadmin',
            true,
            false,
            now(),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            role = 'superadmin',
            username = 'superadmin',
            is_active = true,
            updated_at = now();
            
        RAISE NOTICE 'Profil Superadmin berhasil disinkronisasi: %', v_admin_id;
    ELSE
        RAISE NOTICE 'User auth untuk sipetaabumanshur@gmail.com belum terdaftar di Supabase Auth. Daftarkan terlebih dahulu via Supabase Authentication Dashboard.';
    END IF;
END $$;
```

---

## 5. ANALISIS RISIKO DAN MITIGASI KEAMANAN

| Potensi Risiko | Tingkat Dampak | Mekanisme Pertahanan SIPETA |
|---|:---:|---|
| **Akses Keuangan Ilegal oleh Anon/Publik** | KRITIS | Anon di-`REVOKE` sepenuhnya dari seluruh tabel keuangan (`rekening_pesantren`, `tagihan`, `transaksi_pembayaran`, `mutasi_uang_saku`). |
| **Manipulasi Saldo Uang Saku** | KRITIS | Mutasi uang saku dikelola secara `append-only` menggunakan Trigger PostgreSQL. Saldo hanya dihitung dari riwayat mutasi sah. |
| **Penyerahan Uang Saku Fiktif** | TINGGI | Constraint database mewajibkan mutasi `KELUAR` menyertakan `foto_penyerahan_url`. |
| **Kebocoran Bukti Transfer Bank** | TINGGI | Bucket `bukti-pembayaran` bersifat `private` (`public = false`). Akses file hanya melalui *Signed URL* berbatas waktu 15 menit. |
| **Penghapusan Riwayat Transaksi Santri** | TINGGI | Trigger `fn_prevent_hard_delete_santri_with_history()` memblokir penghapusan santri yang memiliki riwayat transaksi/tahfidz. |
| **Orphaned Auth User pada Pembuatan Akun** | SEDANG | Backend API menerapkan *atomic compensation* (`adminClient.auth.admin.deleteUser`) jika penyimpanan profil gagal. |

---

## 6. PROSEDUR CADANGAN (BACKUP) & PEMULIHAN (RESTORE)

### A. Prosedur Cadangan Rutin
1. **Cadangan Logis Skema & Data (pg_dump)**:
   ```bash
   pg_dump -h db.PROJECT_REF.supabase.co -U postgres -d postgres -F c -b -v -f "sipeta_backup_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Cadangan File Storage**:
   Gunakan Supabase CLI atau skrip ekspor berkas untuk mencadangkan bucket `bukti-pembayaran` dan `foto-penyerahan-saku` secara mingguan.

### B. Prosedur Pemulihan Skema & Data
Jika terjadi anomali migrasi atau kerusakan data:
1. Putuskan sementara akses publik melalui Vercel (*Maintenance Mode*).
2. Jalankan perintah *restore*:
   ```bash
   pg_restore -h db.PROJECT_REF.supabase.co -U postgres -d postgres -v -c "sipeta_backup_TARGET.dump"
   ```
3. Jalankan query verifikasi (Bagian 3 dokumen ini).
4. Aktifkan kembali akses aplikasi setelah verifikasi berhasil.
