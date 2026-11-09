-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 011: Must Change Password Support & NIS-Based Wali Accounts
-- ============================================================================
-- Prioritas Keamanan:
-- 1. Bersifat non-breaking, idempotent, dan backward-compatible.
-- 2. Menambahkan kolom must_change_password pada public.profiles untuk mewajibkan
--    wali santri mengganti kata sandi awal (yang diset sama dengan NIS) saat pertama kali login.
-- 3. Menjaga integritas data akun Superadmin resmi dan role internal lainnya.
-- 4. PENTING: Jangan jalankan migrasi ini pada Supabase Cloud secara otomatis tanpa izin.
-- ============================================================================

-- 1. Tambahkan kolom must_change_password pada public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Index untuk query pengecekan status must_change_password
CREATE INDEX IF NOT EXISTS idx_profiles_must_change_pwd
ON public.profiles (must_change_password)
WHERE must_change_password = TRUE;

-- 3. Catatan Dokumentasi Kebijakan:
-- - Wali yang dibuat otomatis dengan Password awal = NIS diberi nilai must_change_password = TRUE.
-- - Saat login pertama kali, sistem memeriksa kolom ini. Jika TRUE, wali wajib mengganti password.
-- - Password baru tidak boleh sama dengan NIS.
-- - Setelah penggantian kata sandi berhasil, kolom ini diubah menjadi FALSE.

-- ============================================================================
-- DOKUMENTASI ROLLBACK MIGRASI 011:
-- ============================================================================
-- DROP INDEX IF EXISTS public.idx_profiles_must_change_pwd;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS must_change_password;
-- ============================================================================

