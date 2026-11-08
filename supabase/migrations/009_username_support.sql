-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 009: Username Support for Internal Accounts (Non-Gmail Login)
-- ============================================================================
-- Prioritas Keamanan:
-- 1. Bersifat non-breaking, idempotent, dan backward-compatible.
-- 2. Tidak mengubah, menghapus, atau merusak akun Superadmin 'sipetaabumanshur@gmail.com'.
-- 3. Menjamin keunikan username secara case-insensitive tanpa memicu konflik.
-- ============================================================================

-- 1. Tambahkan kolom username pada public.profiles jika belum ada
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Backfill username secara aman & terisolasi
-- A. Akun Superadmin resmi (sipetaabumanshur@gmail.com) mendapatkan username 'superadmin'
UPDATE public.profiles
SET username = 'superadmin'
WHERE email = 'sipetaabumanshur@gmail.com'
  AND username IS NULL;

-- B. Akun internal sintetis (@akun.sipeta.invalid) mengambil prefix email
UPDATE public.profiles
SET username = LOWER(split_part(email, '@', 1))
WHERE email LIKE '%@akun.sipeta.invalid'
  AND username IS NULL;

-- C. Akun pengguna lain yang belum memiliki username (hanya jika memenuhi regex 3-30 karakter)
UPDATE public.profiles
SET username = LOWER(split_part(email, '@', 1))
WHERE username IS NULL
  AND email IS NOT NULL
  AND LOWER(split_part(email, '@', 1)) ~ '^[a-z0-9_.-]{3,30}$'
  AND NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE LOWER(p2.username) = LOWER(split_part(public.profiles.email, '@', 1))
  );

-- 3. Tambahkan constraint validasi format username
-- Username harus lowercase, panjang 3-30 karakter, alfanumerik, titik, strip, underscore
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

-- 4. Unique Index pada LOWER(username) untuk keunikan Case-Insensitive
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_username
ON public.profiles (LOWER(username))
WHERE username IS NOT NULL;

-- 5. Catatan Verifikasi Pasca-Migrasi:
-- Query 1 (Verifikasi kolom):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username';
--
-- Query 2 (Verifikasi Superadmin):
--   SELECT id, email, username, role, is_active
--   FROM public.profiles
--   WHERE email = 'sipetaabumanshur@gmail.com';
--
-- Query 3 (Verifikasi Unik Index):
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'profiles' AND indexname = 'idx_profiles_lower_username';
