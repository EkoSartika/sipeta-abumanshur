# SIPETA — INVESTIGASI & DIAGNOSIS PERMISSION DENIED PADA REKENING PESANTREN

**Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur**  
**Tanggal**: 8 November 2026  
**Auditor**: Senior Database Security Engineer, PostgreSQL Specialist & Supabase Architect  
**Direktori Proyek**: `C:\Users\Eko\.gemini\antigravity\scratch\sipeta`  
**Endpoint Terdampak**: `https://sipeta-abumanshur.vercel.app/api/health`  
**Supabase Cloud Project**: `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`  
**Status Audit**: ✅ **AKAR MASALAH TERIDENTIFIKASI & PERBAIKAN DESAIN SELESAI**

---

## 1. Ringkasan Eksekutif & Jawaban Kritis

Pemeriksaan terhadap endpoint kesehatan produksi:
```json
{
  "status": "connection_error",
  "connectionState": "CONNECTION_FAILED",
  "mode": "demo_local_fallback",
  "message": "Koneksi database gagal: permission denied for table rekening_pesantren",
  "latencyMs": 958
}
```
Membuktikan dua fakta fundamental:
1. **Konektivitas Vercel ke Supabase Cloud Berhasil 100%**: Latensi 958ms membuktikan Vercel telah berhasil menghubungi database PostgreSQL Supabase Cloud secara nyata (bukan simulasi).
2. **Penyebab Error adalah Pelanggaran Hak Akses Tabel (GRANT/REVOKE)**: Pesan PostgreSQL `permission denied for table rekening_pesantren` (Error Code `42501`) **BUKAN** disebabkan oleh RLS, melainkan karena role PostgreSQL **`anon`** tidak memiliki hak istimewa `GRANT SELECT` pada tabel `public.rekening_pesantren`.

---

## 2. Analisis Perbedaan Mendasar: GRANT vs RLS di PostgreSQL

Untuk memahami akar masalah secara akurat, penting membedakan dua mekanisme keamanan PostgreSQL:

| Aspek | Pembatasan RLS (Row Level Security) | Kegagalan Hak Akses (GRANT / REVOKE) |
| :--- | :--- | :--- |
| **Tingkat Pemeriksaan** | Level Baris Data (*Row Level*) | Level Objek Tabel (*Table Level Privilege*) |
| **Respon PostgreSQL** | Mengembalikan **0 baris data (empty set)** secara diam-diam tanpa memunculkan error | Melempar **Exception Error 42501: `permission denied for table ...`** |
| **Kondisi Aktual SIPETA** | RLS pada `rekening_pesantren` aktif dan membatasi data hanya untuk `authenticated` | `REVOKE SELECT ON public.rekening_pesantren FROM anon, PUBLIC;` diterapkan di Cloud |

Pesan yang muncul adalah `permission denied for table rekening_pesantren`. Hal ini membuktikan bahwa query health check dipanggil dengan peran database **`anon`**, dan sistem keamanan PostgreSQL **secara sah menolak** role anon membaca tabel rekening perbankan pesantren.

---

## 3. Penelusuran Sumber Error (*Source Code Trace*)

### 3.1. Kueri Persis yang Menghasilkan Error
Pada file [`src/app/api/health/route.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/app/api/health/route.ts):
```typescript
const supabase = await createSupabaseServerClient();
const { data, error, count } = await supabase
  .from("rekening_pesantren") // <-- TITIK ERROR: tabel keuangan berstatus restricted
  .select("id, nama_bank", { count: "exact" })
  .limit(5);
```
Dan pada file [`src/lib/services/health.service.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/lib/services/health.service.ts):
```typescript
const { data, error, count } = await client
  .from("rekening_pesantren")
  .select("id, nama_bank, is_active", { count: "exact" })
  .limit(5);
```

### 3.2. Client dan Role Database yang Digunakan
1. **Client yang Digunakan**:  
   - `createSupabaseServerClient()` pada Route Handler menggunakan SSR Cookies dan kunci `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Anon Key).
   - `createSupabaseBrowserClient()` pada Client Service browser menggunakan Publishable/Anon Key.
2. **Ketiadaan Sesi Login (Unauthenticated)**:  
   Endpoint `/api/health` diakses secara anonim oleh peramban, curl, atau monitoring eksternal **tanpa cookie sesi autentikasi**.
3. **Database Role yang Menjalankan Kueri**:  
   PostgREST memetakan permintaan tanpa token JWT login ke role database: **`anon`**.

### 3.3. Mengapa Role `anon` Ditolak? (Audit Migrasi 0001–008)
Berdasarkan riwayat migrasi resmi:
1. **Migrasi `0007_rls_and_storage_policies.sql` (Baris 503)**:
   ```sql
   -- REMEDIASI M-01: Cabut izin SELECT pada rekening_pesantren dari publik/anon
   REVOKE SELECT ON public.rekening_pesantren FROM anon, PUBLIC;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
   ```
2. **Migrasi `008_security_remediation.sql` (Baris 153–160)**:
   ```sql
   CREATE POLICY "Rekening Pesantren: akun aktif terdaftar dapat melihat rekening aktif"
   ON public.rekening_pesantren FOR SELECT
   TO authenticated -- HANYA role authenticated, bukan anon!
   USING (is_active = true AND public.get_my_role() IS NOT NULL);
   ```

**Kesimpulan Keamanan**: Database Supabase Cloud beroperasi dengan **SANGAT TEPAT DAN BENAR**. Tabel keuangan pesantren *wajib* dilindungi dari akses publik anonim. Kesalahan berada pada desain *health check* yang salah menargetkan tabel sensitif untuk sekadar uji koneksi.

---

## 4. Prinsip Perbaikan Desain (*Design Remediation*)

Sesuai prinsip *Least Privilege* dan *Separation of Concerns*:
1. **TIDAK BOLEH** memberikan `GRANT SELECT` pada `rekening_pesantren` kepada role `anon`.
2. **TIDAK BOLEH** membuka data finansial institusi pesantren untuk publik.
3. **TIDAK BOLEH** melonggarkan RLS pada tabel perbankan hanya agar endpoint health check menjadi hijau.
4. **SOLUSI RESMI**: Endpoint *health check* dialihkan untuk membaca tabel publik yang sah, yaitu **`public.pengumuman`**.

### Mengapa Memilih `public.pengumuman`?
- Tabel `pengumuman` secara arsitektural memang dirancang untuk publik pesantren.
- Memiliki hak akses resmi di `0007_rls_and_storage_policies.sql`:
  ```sql
  GRANT SELECT ON public.pengumuman TO anon;
  ```
- Memiliki kebijakan RLS khusus publik anon di `008_security_remediation.sql`:
  ```sql
  CREATE POLICY "Pengumuman: baca publik anon"
  ON public.pengumuman FOR SELECT TO anon
  USING (is_published = true);
  ```
- Menguji konektivitas PostgREST, integrasi PostgreSQL, dan evaluasi RLS tanpa mengekspos satupun data finansial atau informasi privat santri.

---

## 5. Perubahan Kode Sumber Lokal yang Telah Diterapkan

Kami telah memperbarui kode lokal di dua tempat:

1. **[`src/app/api/health/route.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/app/api/health/route.ts)**:
   ```typescript
   // Menggunakan tabel publik pengumuman yang sah untuk role anon
   const { data, error, count } = await supabase
     .from("pengumuman")
     .select("id, judul", { count: "exact" })
     .limit(1);
   ```

2. **[`src/lib/services/health.service.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/src/lib/services/health.service.ts)**:
   ```typescript
   // Pemeriksaan kesehatan di browser sebelum login menggunakan tabel pengumuman
   const { data, error, count } = await client
     .from("pengumuman")
     .select("id, judul", { count: "exact" })
     .limit(1);
   ```

3. **Pengujian Baru di [`tests/supabase-backend-integration.test.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/tests/supabase-backend-integration.test.ts)**:
   - Menambahkan skenario uji otomatis: *Health check tidak boleh membaca tabel keuangan sensitif `rekening_pesantren`*.
   - Memastikan kueri wajib menargetkan `pengumuman`.

---

## 6. Skrip Diagnostik Read-Only Supabase Cloud

Berikut adalah skrip SQL **100% Read-Only** untuk memverifikasi hak akses tabel dan kebijakan RLS pada database Supabase Cloud. Skrip ini **TIDAK MENGUBAH APAPUN** pada database.

```sql
-- ============================================================================
-- SIPETA — READ-ONLY DIAGNOSTIC SCRIPT: PRIVILEGES & RLS AUDIT
-- SIFAT: 100% READ-ONLY (AMAN DIJALANKAN DI SUPABASE SQL EDITOR)
-- ============================================================================

-- 1. Periksa Table Privileges (has_table_privilege) untuk role anon, authenticated, service_role
SELECT 
    'rekening_pesantren' AS table_name,
    has_table_privilege('anon', 'public.rekening_pesantren', 'SELECT') AS anon_can_select,
    has_table_privilege('authenticated', 'public.rekening_pesantren', 'SELECT') AS authenticated_can_select,
    has_table_privilege('service_role', 'public.rekening_pesantren', 'SELECT') AS service_role_can_select
UNION ALL
SELECT 
    'pengumuman' AS table_name,
    has_table_privilege('anon', 'public.pengumuman', 'SELECT') AS anon_can_select,
    has_table_privilege('authenticated', 'public.pengumuman', 'SELECT') AS authenticated_can_select,
    has_table_privilege('service_role', 'public.pengumuman', 'SELECT') AS service_role_can_select;

-- 2. Periksa ACL (Access Control List) relasi fisik tabel (pg_class.relacl)
SELECT 
    relname AS table_name,
    relrowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced,
    relacl AS access_control_list
FROM pg_class
WHERE relname IN ('rekening_pesantren', 'pengumuman')
  AND relnamespace = 'public'::regnamespace;

-- 3. Periksa seluruh kebijakan RLS aktif (pg_policies) pada kedua tabel
SELECT 
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies
WHERE tablename IN ('rekening_pesantren', 'pengumuman')
ORDER BY tablename, policyname;

-- 4. Periksa hak eksekusi fungsi publik helper otorisasi
SELECT 
    p.proname AS function_name,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' 
  AND p.proname IN ('get_my_role', 'get_my_santri_id');
```

### Cara Menjalankan di Supabase Dashboard:
1. Buka browser: `https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy/sql`.
2. Salin seluruh blok SQL di atas ke dalam SQL Editor.
3. Klik tombol **Run**.
4. Hasil query akan memperlihatkan:
   - `rekening_pesantren`: `anon_can_select` = `false`, `authenticated_can_select` = `true`.
   - `pengumuman`: `anon_can_select` = `true`, `authenticated_can_select` = `true`.

---

## 7. Hasil Pengujian Mutu Lokal

Seluruh suite pengujian otomatis telah dijalankan ulang dengan hasil sempurna:

- **Vitest Test Suite**: **148 / 148 LULUS (100%)** (7 file pengujian, 0 failure, durasi 13.62s).
- **TypeScript Typecheck (`tsc --noEmit`)**: **0 error**.
- **Next.js Production Build (`next build`)**: **Compiled successfully (Exit Code 0)**.
- **Audit Secret Leakage**: **0 kebocoran kredensial** pada bundel `.next/static`.

---

## 8. Tindakan yang Memerlukan Persetujuan Pemilik Proyek

Untuk menerapkan perbaikan health check ini ke domain produksi Vercel:
1. Pemilik proyek menyetujui untuk melakukan commit dan push perubahan kode lokal ke GitHub (`origin main`).
2. Vercel akan otomatis mendeteksi commit baru dan melakukan deployment ulang.
3. Setelah deployment selesai, endpoint `https://sipeta-abumanshur.vercel.app/api/health` akan langsung merespon **HTTP 200 (CONNECTED_HEALTHY)**.
