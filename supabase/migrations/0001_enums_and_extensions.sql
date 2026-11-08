-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 0001: Extensions & Enum Types
-- ============================================================================

DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    -- Fallback jika runtime PostgreSQL telah menyematkan gen_random_uuid() secara native
    NULL;
END $$;

DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Pastikan role Supabase standar tersedia untuk portabilitas skema
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
    END IF;
END $$;

-- 1. Role Pengguna (Sesuai Bab 3 PRD)
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM (
        'superadmin',
        'admin',
        'bendahara',
        'pengelola',
        'wali'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Status Santri (Sesuai Bab 4.1 PRD)
DO $$ BEGIN
    CREATE TYPE public.status_santri AS ENUM (
        'AKTIF',
        'CUTI',
        'LULUS',
        'PINDAH',
        'TIDAK_AKTIF'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Jenis Kelamin
DO $$ BEGIN
    CREATE TYPE public.jenis_kelamin AS ENUM ('L', 'P');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Kebijakan Cicilan (Sesuai Bab 5.2 PRD)
DO $$ BEGIN
    CREATE TYPE public.kebijakan_cicilan AS ENUM (
        'TIDAK_BOLEH',
        'MINIMAL_NOMINAL',
        'BEBAS'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Status Tagihan (Sesuai Bab 5.6 PRD)
DO $$ BEGIN
    CREATE TYPE public.status_tagihan AS ENUM (
        'BELUM_BAYAR',
        'DIBAYAR_SEBAGIAN',
        'LUNAS',
        'DIBATALKAN'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Status Transaksi Pembayaran & Pengajuan Uang Saku (Sesuai Bab 5.6 & 6.2 PRD)
DO $$ BEGIN
    CREATE TYPE public.status_transaksi AS ENUM (
        'MENUNGGU_TRANSFER',
        'MENUNGGU_VERIFIKASI',
        'DISETUJUI',
        'DITOLAK',
        'KEDALUWARSA',
        'DIBATALKAN'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Jenis Mutasi Uang Saku (Sesuai Bab 6.2 - 6.4 PRD)
DO $$ BEGIN
    CREATE TYPE public.jenis_mutasi_saku AS ENUM (
        'MASUK',
        'KELUAR',
        'PENYESUAIAN_TAMBAH',
        'PENYESUAIAN_KURANG'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Jenis Setoran Tahfidz (Sesuai Bab 8 PRD)
DO $$ BEGIN
    CREATE TYPE public.jenis_setoran_tahfidz AS ENUM (
        'HAFALAN_BARU',
        'MUROJAAH'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Tingkat Prestasi (Sesuai Bab 9 PRD)
DO $$ BEGIN
    CREATE TYPE public.tingkat_prestasi AS ENUM (
        'INTERNAL',
        'KECAMATAN',
        'KABUPATEN',
        'PROVINSI',
        'NASIONAL',
        'INTERNASIONAL'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. Status Tindak Lanjut Kedisiplinan (Sesuai Bab 10 PRD)
DO $$ BEGIN
    CREATE TYPE public.status_tindak_lanjut AS ENUM (
        'TERCATAT',
        'DALAM_PEMBINAAN',
        'SELESAI'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Helper function untuk auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

