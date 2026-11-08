-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Bootstrap 001: First Superadmin Secure Initialization (Transaction-Hardened)
--
-- Target Akun:
--   Email: sipetaabumanshur@gmail.com
--   Role: superadmin
--   Status: is_active = true
--
-- Fitur Keamanan & Transaction-Safety:
--   1. Transaction-level Advisory Lock (pg_advisory_xact_lock) untuk serialisasi antar-eksekusi bootstrap.
--   2. Explicit Table Lock (LOCK TABLE public.profiles IN EXCLUSIVE MODE):
--      - Memblokir seluruh transaksi lain yang mencoba INSERT/UPDATE/DELETE pada profiles selama proses.
--      - Tetap mengizinkan operasi baca konkuren (SELECT).
--      - Menjamin tidak ada race condition atau phantom inserts dari API/trigger/SQL eksternal.
--   3. Deteksi duplikasi email case-insensitive pada auth.users (Temuan 1).
--   4. Deteksi duplikasi email case-insensitive pada public.profiles (Temuan 1).
--   5. Validasi terpisah antara UUID Auth dan benturan Email di public.profiles.
--   6. Validasi integritas: Memastikan UUID dan Email menunjuk ke baris profil yang sama persis.
--   7. Validasi Auth: Memastikan akun terdaftar dan terkonfirmasi (confirmed_at IS NOT NULL).
--   8. Pemeriksaan Superadmin lain KONSISTEN sebelum jalur idempotensi (Temuan 2).
--   9. Strict Idempotency: Jika profil sudah aktif dan tidak ada superadmin lain, proses berhenti aman.
--  10. Proteksi Akun Nonaktif: Menolak re-aktivasi otomatis tanpa investigasi administratif.
--  11. Zero Credential: Tidak memuat password, secret key, atau mengubah data Auth.
-- ============================================================================

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
    -- 0. Dapatkan transaction-level advisory lock untuk mencegah race condition antar-sesi bootstrap
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

    -- 2. Dapatkan Table Lock pada public.profiles dalam mode EXCLUSIVE
    -- Mengunci tabel public.profiles dari mutasi konkuren (INSERT/UPDATE/DELETE) oleh transaksi eksternal
    -- yang tidak menggunakan advisory lock yang sama, namun TETAP MENGIZINKAN operasi SELECT biasa.
    LOCK TABLE public.profiles IN EXCLUSIVE MODE;

    -- 3. Validasi Case-Insensitive Email pada public.profiles (Temuan 1)
    SELECT count(*)
    INTO v_profile_email_match_count
    FROM public.profiles
    WHERE lower(email) = lower(v_target_email);

    IF v_profile_email_match_count > 1 THEN
        RAISE EXCEPTION 'BOOTSTRAP DITOLAK (DUPLIKASI PROFIL EMAIL): Terdeteksi % profil pada public.profiles dengan variasi kapitalisasi email "%". Lakukan investigasi manual.', v_profile_email_match_count, v_target_email;
    END IF;

    -- 4. Periksa Keberadaan Profil Berdasarkan UUID Auth Secara Terpisah
    SELECT id, email, role, is_active
    INTO v_profile_by_id
    FROM public.profiles
    WHERE id = v_auth_user_id;

    -- 5. Periksa Benturan Profil Berdasarkan Email Target Secara Terpisah
    SELECT id, email, role, is_active
    INTO v_profile_by_email
    FROM public.profiles
    WHERE lower(email) = lower(v_target_email);

    -- 6. Validasi Relasi dan Konsistensi Profil
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

    -- 7. PEMERIKSAAN SUPERADMIN LAIN SECARA KONSISTEN SEBELUM JALUR IDEMPOTENSI ATAU INSERT (Temuan 2)
    -- Menghitung seluruh Superadmin lain di database (selain v_auth_user_id)
    SELECT count(*)
    INTO v_other_superadmin_count
    FROM public.profiles
    WHERE role = 'superadmin' AND id <> v_auth_user_id;

    IF v_other_superadmin_count > 0 THEN
        RAISE EXCEPTION 'BOOTSTRAP DITOLAK: Ditemukan % akun Superadmin lain di database. Prosedur bootstrap 001 hanya diizinkan untuk inisialisasi akun Superadmin PERTAMA.',
            v_other_superadmin_count;
    END IF;

    -- 8. Jalur Idempotensi (Hanya diproses setelah dipastikan TIDAK ADA Superadmin lain)
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

    -- 9. Inisialisasi Profil Superadmin Pertama (Atomic INSERT terlindungi Table Lock)
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
