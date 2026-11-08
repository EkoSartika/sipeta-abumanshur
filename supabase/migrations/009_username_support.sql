-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 009: Username Support for Internal Accounts (Non-Gmail Login)
-- ============================================================================

-- 1. Tambahkan kolom username pada public.profiles jika belum ada
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Backfill username untuk akun yang sudah terdaftar
-- Superadmin resmi menggunakan username 'superadmin'
UPDATE public.profiles
SET username = 'superadmin'
WHERE role = 'superadmin' AND username IS NULL;

-- Akun internal dengan format email '@akun.sipeta.invalid' mengambil prefix email sebagai username
UPDATE public.profiles
SET username = split_part(email, '@', 1)
WHERE email LIKE '%@akun.sipeta.invalid' AND username IS NULL;

-- 3. Tambahkan constraint unik dan format validasi username
-- Username harus unik (case-insensitive), panjang 3-30 karakter, alfanumerik, titik, strip, underscore
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_username_format'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT chk_profiles_username_format
        CHECK (username IS NULL OR username ~ '^[a-z0-9_.-]{3,30}$');
    END IF;
END $$;

-- 4. Unique Index pada LOWER(username)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_username
ON public.profiles (LOWER(username))
WHERE username IS NOT NULL;

-- 5. Catatan Review Keamanan Migrasi:
-- - Migrasi ini bersifat non-breaking dan backward-compatible.
-- - Akun Superadmin 'sipetaabumanshur@gmail.com' tetap dapat login dengan email aslinya.
-- - Akun internal login menggunakan username yang dipetakan ke email sintetis '@akun.sipeta.invalid'.
-- - Tidak ada password yang disimpan pada tabel profiles (password tetap dikelola oleh Supabase Auth).
