# SIPETA — FIRST SUPERADMIN SECURE INITIALIZATION GUIDE
## Prosedur Inisialisasi Akun Superadmin Pertama (Pondok Pesantren Modern Abu Manshur)

Dokumen ini adalah panduan resmi operasional untuk pemilik proyek dalam membuat dan menginisialisasi akun **Superadmin Pertama** SIPETA secara aman pada database Supabase Cloud.

---

## 1. Identitas Akun Superadmin Pertama

| Atribut | Nilai Resmi | Keterangan |
|---|---|---|
| **Email Pengguna** | `sipetaabumanshur@gmail.com` | Email resmi pengelola sistem SIPETA |
| **Peran (Role)** | `superadmin` | Otoritas tertinggi sistem (Bab 3.1 PRD) |
| **Status Akun** | `is_active = true` | Status akun aktif operasional |
| **Nama Lengkap Default** | `Superadmin SIPETA Abu Manshur` | Nama profil pada `public.profiles` |
| **Tipe Inisialisasi** | First Bootstrap (Final Hardened Patch) | Hanya boleh dijalankan tepat 1 kali pada fase awal |

> [!IMPORTANT]
> **Batasan Keamanan**: Asisten AI dilarang keras membuat akun Auth, menjalankan SQL bootstrap, atau mengeksekusi DDL/DML pada Supabase Cloud. Seluruh tindakan pembuatan akun di bawah ini dilakukan secara mandiri oleh **Pemilik Proyek** melalui antarmuka resmi Supabase.

---

## 2. Audit Struktur Database & Temuan Teknis

Berdasarkan audit langsung pada file migrasi `0001_enums_and_extensions.sql` hingga `008_security_remediation.sql` dan PostgreSQL lokal:

### 2.1. Struktur Lengkap Tabel `public.profiles`
```sql
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama_lengkap TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    no_telepon TEXT,
    role public.user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2. Integritas Relasi & Constraint
- **Primary Key & Foreign Key**: Kolom `id` bertipe `UUID` bertindak sebagai Primary Key sekaligus Foreign Key yang merujuk langsung ke `auth.users(id)` dengan relasi `ON DELETE CASCADE`.
- **Kolom Wajib (NOT NULL)**: `id`, `nama_lengkap`, `email`, `role`, `is_active`, `created_at`, `updated_at`.
- **Kolom Opsional**: `no_telepon` (diizinkan `NULL`).
- **Constraint Unik**: 
  - `public.profiles_pkey` (PRIMARY KEY pada `id`).
  - `public.profiles_email_key` (UNIQUE pada `email`).
- **Tipe Data Role**: Enum `public.user_role` yang bernilai `('superadmin', 'admin', 'bendahara', 'pengelola', 'wali')`.

### 2.3. Trigger pada Tabel `public.profiles`
- `trg_profiles_updated_at`: `BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();`
- **Tidak ada** trigger BEFORE/AFTER INSERT pada tabel `public.profiles`.

### 2.4. Mekanisme Otomatis Registrasi (Auth Hooks)
- Pada skema SIPETA, **TIDAK ADA** trigger pada tabel internal `auth.users` maupun Auth Webhook yang secara otomatis menyisipkan data profil ke `public.profiles` saat pendaftaran pengguna di Supabase Auth.
- Hal ini merupakan desain keamanan yang disengaja agar pendaftaran akun tidak dapat menyisipkan profil tanpa otorisasi.

### 2.5. Analisis Kebijakan RLS (The Chicken-and-Egg Problem)
Kebijakan RLS pada `public.profiles` hasil Migration 008:
```sql
-- 1. SELECT
CREATE POLICY "Profiles: baca profil sendiri atau petugas internal"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola'));

-- 2. ALL (INSERT, UPDATE, DELETE)
CREATE POLICY "Profiles: superadmin kelola semua akun"
ON public.profiles FOR ALL TO authenticated
USING (public.get_my_role() = 'superadmin')
WITH CHECK (public.get_my_role() = 'superadmin');
```
**Mengapa Bootstrap Superadmin Pertama Wajib Menggunakan SQL Server-Side?**
1. Setiap panggilan API Supabase Client (`@supabase/supabase-js`) dieksekusi dengan role `authenticated`.
2. Satu-satunya policy yang mengizinkan operasi `INSERT` adalah `Profiles: superadmin kelola semua akun`, yang mengevaluasi `WITH CHECK (public.get_my_role() = 'superadmin')`.
3. Fungsi `public.get_my_role()` menjalankan `SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true`.
4. Jika profil Superadmin pertama belum ada, fungsi `public.get_my_role()` menghasilkan nilai `NULL`.
5. Akibatnya, `WITH CHECK (NULL = 'superadmin')` bernilai `FALSE`, dan operasi `INSERT` ditolak oleh engine PostgreSQL (`42501: new row violates row-level security policy`).
6. **Kesimpulan**: Akun Superadmin Pertama **TIDAK BISA** dibuat melalui antarmuka web aplikasi (frontend) atau client API. Inisialisasi **WAJIB** dilakukan melalui SQL script di **Supabase Dashboard SQL Editor** (yang berjalan dengan privilege database superuser/role `postgres` yang membypass RLS).

---

## 3. Prosedur Pembuatan Akun Auth di Supabase Dashboard (Pemilik Proyek)

Lakukan langkah berikut untuk mendaftarkan akun di layer Supabase Auth:

1. Buka browser dan login ke **Supabase Management Dashboard**:  
   `https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy`
2. Pada navigasi sebelah kiri, buka menu **Authentication** > **Users**.
3. Klik tombol hijau **Add user** di sudut kanan atas, lalu pilih **Create user**.
4. Isi formulir dengan data berikut:
   - **User Email**: `sipetaabumanshur@gmail.com`
   - **User Password**: Masukkan kata sandi yang sangat kuat (minimal 12–16 karakter, kombinasi huruf besar, kecil, angka, dan karakter khusus).
     > [!WARNING]
     > Jangan pernah mencatat, mengirimkan, atau membagikan kata sandi ini ke obrolan AI, file proyek, atau source code Git.
   - **Auto Confirm User?**: **CENTANG / AKTIFKAN** toggle ini.
     - *Penjelasan Teknis*: Menandai opsi ini akan langsung mengisi nilai `confirmed_at = now()` pada `auth.users`, sehingga Supabase Auth tidak memblokir proses login dengan alasan email belum diverifikasi.
5. Klik **Create user**.
6. Periksa tabel pengguna pada dashboard, pastikan baris untuk `sipetaabumanshur@gmail.com` telah muncul dengan status `Confirmed`.
7. Catat atau salin **UID** (contoh: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`) untuk keperluan verifikasi.

---

## 4. Prosedur Eksekusi SQL Bootstrap Superadmin (Final Hardened Patch)

Setelah akun Auth terdaftar di dashboard, jalankan skrip bootstrap aman berikut di SQL Editor Supabase Cloud.

### 4.1. Lokasi File Skrip
File skrip lokal tersedia di:  
[`supabase/bootstrap/001_first_superadmin.sql`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/bootstrap/001_first_superadmin.sql)

### 4.2. Isi Skrip SQL Bootstrap (Final Patch)
```sql
DO $$
DECLARE
    v_target_email CONSTANT TEXT := 'sipetaabumanshur@gmail.com';
    v_auth_match_count INT;
    v_auth_user_id UUID;
    v_auth_email TEXT;
    v_is_confirmed BOOLEAN;
    v_profile_email_match_count INT;
    v_other_superadmin_count INT;
    v_profile_by_id RECORD;
    v_profile_by_email RECORD;
BEGIN
    -- 0. Dapatkan transaction-level advisory lock untuk mencegah race condition / konkurensi
    -- Lock akan otomatis dilepaskan saat transaksi COMMIT atau ROLLBACK.
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_first_superadmin_bootstrap_lock')::bigint);

    -- 1. Validasi Case-Insensitive Email pada auth.users (Temuan 1)
    SELECT count(*)
    INTO v_auth_match_count
    FROM auth.users
    WHERE lower(email) = lower(v_target_email);

    IF v_auth_match_count = 0 THEN
        RAISE EXCEPTION 'BOOTSTRAP GAGAL: Akun Auth dengan email "%" belum terdaftar di auth.users. Silakan buat akun terlebih dahulu melalui Supabase Dashboard (Authentication -> Users -> Add user -> Create user).', v_target_email;
    ELSIF v_auth_match_count > 1 THEN
        RAISE EXCEPTION 'BOOTSTRAP DITOLAK (DUPLIKASI AUTH EMAIL): Terdeteksi % akun pada auth.users dengan variasi kapitalisasi email "%". Hapus akun duplikat pada Supabase Auth sebelum melanjutkan.', v_auth_match_count, v_target_email;
    END IF;

    -- Ambil data tunggal akun Auth yang terverifikasi
    SELECT id, email, (confirmed_at IS NOT NULL)
    INTO v_auth_user_id, v_auth_email, v_is_confirmed
    FROM auth.users
    WHERE lower(email) = lower(v_target_email);

    IF lower(v_auth_email) <> lower(v_target_email) THEN
        RAISE EXCEPTION 'BOOTSTRAP GAGAL: Email akun Auth ("%") tidak sesuai dengan email target ("%").', v_auth_email, v_target_email;
    END IF;

    IF NOT v_is_confirmed THEN
        RAISE EXCEPTION 'BOOTSTRAP GAGAL: Akun Auth "%" belum terkonfirmasi (confirmed_at IS NULL). Pastikan opsi "Auto Confirm User" dicentang saat pembuatan akun di Dashboard atau konfirmasi email terlebih dahulu.', v_target_email;
    END IF;

    -- 2. Validasi Case-Insensitive Email pada public.profiles (Temuan 1)
    SELECT count(*)
    INTO v_profile_email_match_count
    FROM public.profiles
    WHERE lower(email) = lower(v_target_email);

    IF v_profile_email_match_count > 1 THEN
        RAISE EXCEPTION 'BOOTSTRAP DITOLAK (DUPLIKASI PROFIL EMAIL): Terdeteksi % profil pada public.profiles dengan variasi kapitalisasi email "%". Lakukan investigasi manual.', v_profile_email_match_count, v_target_email;
    END IF;

    -- 3. Periksa Keberadaan Profil Berdasarkan UUID Auth Secara Terpisah
    SELECT id, email, role, is_active
    INTO v_profile_by_id
    FROM public.profiles
    WHERE id = v_auth_user_id;

    -- 4. Periksa Benturan Profil Berdasarkan Email Target Secara Terpisah
    SELECT id, email, role, is_active
    INTO v_profile_by_email
    FROM public.profiles
    WHERE lower(email) = lower(v_target_email);

    -- 5. Validasi Relasi dan Konsistensi Profil
    IF v_profile_by_id.id IS NOT NULL AND v_profile_by_email.id IS NOT NULL THEN
        -- Pastikan keduanya merujuk pada baris profil yang sama persis
        IF v_profile_by_id.id <> v_profile_by_email.id THEN
            RAISE EXCEPTION 'BOOTSTRAP DITOLAK (INTEGRITAS TERNODAI): Terdeteksi dua profil berbeda! Profil ID % memiliki UUID target tetapi email berbeda (%), sedangkan profil ID % memiliki email target tetapi UUID berbeda. Batalkan dan lakukan investigasi manual.',
                v_profile_by_id.id, v_profile_by_id.email, v_profile_by_email.id;
        END IF;

        -- Jika merujuk row yang sama, periksa role
        IF v_profile_by_id.role <> 'superadmin' THEN
            RAISE EXCEPTION 'BOOTSTRAP DITOLAK: Profil untuk "%" (UUID: %) sudah ada namun memiliki role "%" (bukan superadmin). Hubungi administrator sistem.',
                v_target_email, v_auth_user_id, v_profile_by_id.role;
        END IF;

    ELSIF v_profile_by_id.id IS NOT NULL AND v_profile_by_email.id IS NULL THEN
        RAISE EXCEPTION 'BOOTSTRAP DITOLAK (KONFLIK UUID): UUID Auth % sudah terdaftar di public.profiles dengan email yang berbeda ("%").',
            v_auth_user_id, v_profile_by_id.email;

    ELSIF v_profile_by_id.id IS NULL AND v_profile_by_email.id IS NOT NULL THEN
        RAISE EXCEPTION 'BOOTSTRAP DITOLAK (KONFLIK EMAIL): Email target "%" sudah terdaftar di public.profiles dengan UUID yang berbeda (%).',
            v_target_email, v_profile_by_email.id;
    END IF;

    -- 6. PEMERIKSAAN SUPERADMIN LAIN SECARA KONSISTEN SEBELUM JALUR IDEMPOTENSI ATAU INSERT (Temuan 2)
    -- Menghitung seluruh Superadmin lain di database (selain v_auth_user_id)
    SELECT count(*)
    INTO v_other_superadmin_count
    FROM public.profiles
    WHERE role = 'superadmin' AND id <> v_auth_user_id;

    IF v_other_superadmin_count > 0 THEN
        RAISE EXCEPTION 'BOOTSTRAP DITOLAK: Ditemukan % akun Superadmin lain di database. Prosedur bootstrap 001 hanya diizinkan untuk inisialisasi akun Superadmin PERTAMA.',
            v_other_superadmin_count;
    END IF;

    -- 7. Jalur Idempotensi (Hanya diproses setelah dipastikan TIDAK ADA Superadmin lain)
    IF v_profile_by_id.id IS NOT NULL THEN
        IF v_profile_by_id.is_active = true THEN
            RAISE NOTICE 'INFORMASI: Profil Superadmin pertama untuk "%" (UUID: %) SUDAH TERDAFTAR dan berstatus AKTIF. Tidak ada akun Superadmin lain. Tidak ada perubahan yang dilakukan.',
                v_target_email, v_auth_user_id;
            RETURN;
        ELSE
            -- Strict Idempotency: JANGAN mengaktifkan otomatis tanpa keputusan administratif eksplisit
            RAISE EXCEPTION 'BOOTSTRAP DITOLAK: Profil Superadmin untuk "%" (UUID: %) ditemukan dalam status NONAKTIF. Sistem menolak re-aktivasi otomatis demi alasan keamanan. Periksa riwayat penonaktifan secara manual.',
                v_target_email, v_auth_user_id;
        END IF;
    END IF;

    -- 8. Inisialisasi Profil Superadmin Pertama (Atomic INSERT)
    INSERT INTO public.profiles (
        id,
        nama_lengkap,
        email,
        no_telepon,
        role,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_auth_user_id,
        'Superadmin SIPETA Abu Manshur',
        lower(v_target_email),
        NULL,
        'superadmin'::public.user_role,
        true,
        now(),
        now()
    );

    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'BOOTSTRAP BERHASIL!';
    RAISE NOTICE 'Akun Superadmin Pertama telah diinisialisasi secara aman:';
    RAISE NOTICE '  - Email      : %', v_target_email;
    RAISE NOTICE '  - Auth UID   : %', v_auth_user_id;
    RAISE NOTICE '  - Role       : superadmin';
    RAISE NOTICE '  - Status     : AKTIF (is_active = true)';
    RAISE NOTICE '====================================================================';
END $$;
```

### 4.3. Cara Menjalankan di Supabase Cloud:
1. Buka Supabase Dashboard > **SQL Editor**.
2. Klik **New query**.
3. Tempelkan seluruh isi SQL di atas.
4. Klik **Run** (atau tekan `Ctrl + Enter`).
5. Periksa panel output / Messages: Harus menampilkan pesan `BOOTSTRAP BERHASIL!`.

---

## 5. Kueri Verifikasi Kesiapan Superadmin

Setelah bootstrap dijalankan, jalankan kueri verifikasi berikut di SQL Editor untuk memvalidasi seluruh relasi:

```sql
SELECT
    u.id AS auth_user_id,
    u.email AS auth_email,
    u.confirmed_at AS auth_confirmed_at,
    p.id AS profile_id,
    p.nama_lengkap AS profile_nama_lengkap,
    p.email AS profile_email,
    p.role AS profile_role,
    p.is_active AS profile_is_active,
    (u.id = p.id) AS is_fk_valid,
    (p.role = 'superadmin' AND p.is_active = true) AS is_superadmin_active,
    (SELECT count(*) FROM public.profiles WHERE role = 'superadmin') AS total_superadmin_count
FROM auth.users u
INNER JOIN public.profiles p ON u.id = p.id
WHERE lower(u.email) = 'sipetaabumanshur@gmail.com';
```

### Parameter Keberhasilan Verifikasi:
| Kolom Output | Nilai yang Wajib Muncul | Keterangan |
|---|---|---|
| `auth_email` | `sipetaabumanshur@gmail.com` | Email cocok |
| `auth_confirmed_at` | *Tidak boleh NULL* | Akun terkonfirmasi |
| `profile_role` | `superadmin` | Role terpasang dengan benar |
| `profile_is_active` | `true` | Status profil aktif |
| `is_fk_valid` | `true` | Relasi 1:1 `auth.users` ke `profiles` valid |
| `is_superadmin_active` | `true` | Superadmin berhak login dan mengakses sistem |
| `total_superadmin_count` | `1` | Tidak ada duplikasi akun Superadmin |

---

## 6. Panduan Login & Pengujian Sistem

Setelah verifikasi database sukses:
1. **Akses Aplikasi**: Buka aplikasi SIPETA di browser.
2. **Form Login**: Masukkan email `sipetaabumanshur@gmail.com` dan kata sandi yang telah Anda buat.
3. **Verifikasi Hak Akses Portal**:
   - Sistem mengenali peran `superadmin` dan mengarahkan ke **Portal Superadmin — Pondok Pesantren Modern Abu Manshur**.
   - **Tab Manajemen Pengguna**: Memungkinkan pembuatan akun staf operasional (`Admin`, `Bendahara`, `Pengelola`, `Wali`) melalui endpoint aman `/api/admin-users`.
   - **Tab Rekening Resmi Pesantren**: Memungkinkan konfigurasi rekening resmi tunggal pesantren (`public.rekening_pesantren`).
   - **Tab Audit Log Sistem**: Menampilkan riwayat transaksi dan audit sistem (`public.audit_logs`).
4. **Anti-Privilege Escalation**: Pengguna non-Superadmin diblokir secara mutlak oleh RLS dan server guard dari endpoint pengelolaan akun dan rekening.
5. **Uji Sesi**: Lakukan **Logout** dan login kembali untuk memastikan token sesi Supabase Auth diterbitkan dan divalidasi dengan benar.
