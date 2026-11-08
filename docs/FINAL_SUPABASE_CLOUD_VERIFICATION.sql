-- ============================================================================
-- SIPETA — FINAL SUPABASE CLOUD POST-MIGRATION READ-ONLY VERIFICATION SCRIPT
-- Pondok Pesantren Modern Abu Manshur (Project Ref: jvhzrhfzkjqzlhsvvbgy)
-- ============================================================================
-- SIFAT SKRIP: 100% READ-ONLY (SELECT murni, nol DDL, nol DML, nol perubahan state)
-- TUJUAN: Menghasilkan satu laporan komprehensif langsung di Supabase SQL Editor
-- ============================================================================

-- 1. RINGKASAN METRIK KUNCI DATABASE (SINGLE-ROW EXECUTIVE SUMMARY)
SELECT 
    (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') AS total_tabel_public,
    (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) AS tabel_rls_aktif,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND roles @> ARRAY['authenticated'::name]) AS policy_public_authenticated,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND roles @> ARRAY['anon'::name]) AS policy_public_anon,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND (roles = '{public}' OR roles = '{}' OR roles IS NULL)) AS policy_public_residual_default,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage') AS policy_storage,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname IN ('public', 'storage')) AS total_policy_database,
    (SELECT COUNT(*) FROM storage.buckets) AS total_bucket_storage,
    (SELECT COUNT(*) FROM storage.buckets WHERE public = true) AS bucket_storage_publik,
    (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public') AS total_trigger_non_internal,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public') AS total_fungsi_public;

-- 2. VERIFIKASI 4 STORAGE BUCKET PRIVATE
SELECT 
    id AS bucket_id,
    name,
    public AS is_public,
    file_size_limit / 1048576 AS limit_mb,
    allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 3. VERIFIKASI 14 TRIGGER NON-INTERNAL
SELECT 
    trigger_name,
    event_object_table AS tabel,
    action_timing AS timing,
    event_manipulation AS event,
    action_statement AS procedure_call
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 4. VERIFIKASI 17 FUNGSI PUBLIC & CONFIGURASI SECURITY DEFINER
SELECT 
    p.proname AS nama_fungsi,
    pg_get_function_result(p.oid) AS tipe_return,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_type,
    COALESCE(array_to_string(p.proconfig, ', '), 'DEFAULT') AS runtime_config,
    pg_get_userbyid(p.proowner) AS function_owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- 5. VERIFIKASI POLICIES KHUSUS TABEL PENGUMUMAN & PRIVASI KEDISIPLINAN
SELECT 
    tablename,
    policyname,
    cmd,
    roles,
    qual IS NOT NULL AS has_using,
    with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('pengumuman', 'riwayat_perubahan_kedisiplinan')
ORDER BY tablename, cmd, policyname;

-- 6. VERIFIKASI PRIVILEGE ANON (MEMASTIKAN HANYA BACA PENGUMUMAN)
SELECT 
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- 7. INDIKATOR KELAYAKAN AKHIR (BOOLEAN READINESS HEALTH CHECK)
SELECT 
    CASE 
        WHEN (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false) = 0
         AND (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND (roles = '{public}' OR roles IS NULL)) = 0
         AND (SELECT COUNT(*) FROM storage.buckets WHERE public = true) = 0
         AND (SELECT COUNT(*) FROM pg_policies WHERE schemaname IN ('public', 'storage')) = 61
         AND (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public') = 14
        THEN 'PASSED: SUPABASE CLOUD DATABASE IS SECURED AND MATCHES 100% SPECIFICATIONS'
        ELSE 'FAILED: CHECK DISCREPANCIES IN OUTPUT ABOVE'
    END AS final_cloud_security_verdict;

