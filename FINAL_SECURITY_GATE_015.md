# LAPORAN FINAL PRE-DEPLOYMENT REVIEW — MIGRASI DATABASE 015
## Rekonsiliasi RLS Policy 001–015, Hardening Otorisasi Granular, & Validasi Engine PostgreSQL

**Pondok Pesantren Modern Abu Manshur — Cirebon**  
**Tanggal Audit & Verifikasi:** 10 November 2026  
**Commit Naskah:** `e86ed16` (dan commit final)  
**File Target:** `supabase/migrations/015_profil_pesantren.sql`  
**Status Naskah Migrasi:** **AUDITED, VERIFIED & FINAL READY TO EXECUTE**  
**Status Keputusan Akhir:** **SIAP MIGRASI**  
**Kondisi Eksekusi:** **DITAHAN LOKAL (TIDAK DIJALANKAN KE SUPABASE CLOUD)**  

---

## 1. Temuan dan Perbaikan

### A. Rekonsiliasi Menyeluruh Policy RLS `tahun_ajaran` (001–014 vs 015)
- **Riwayat Migrasi Sebelumnya:**
  - Migrasi `0007_rls_and_storage_policies.sql` membuat:
    - `"Master Kelas/Kamar/TahunAjaran: baca oleh akun aktif berwenang"`
    - `"Master Kelas/Kamar/TahunAjaran: admin & superadmin kelola"`
  - Migrasi `008_security_remediation.sql` merevisi menjadi:
    - `"Master TahunAjaran: baca oleh akun aktif berwenang"`
    - `"Master TahunAjaran: admin & superadmin kelola"`
- **Tindakan Pembersihan Total pada Migrasi 015:**
  Seluruh policy lama di atas, termasuk kemungkinan draft terdahulu (`"Master TahunAjaran: TU kelola status aktif"`), secara eksplisit **DIBERSIHKAN DENGAN `DROP POLICY IF EXISTS`**.
- **Hasil Audit Permissive OR:**
  Tidak ada satu pun policy lama yang tersisa. Tabel `public.tahun_ajaran` kini hanya memiliki 4 policy atomik:
  1. `SELECT`: `TO anon, authenticated USING (true)` (Kebutuhan tampilan login dan seluruh role).
  2. `INSERT`: `TO authenticated WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'))`.
  3. `UPDATE`: `TO authenticated USING/WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'))` (Hanya metadata; `is_active` dikunci oleh trigger guard).
  4. `DELETE`: `TO authenticated USING (public.get_my_role() = 'superadmin')`.
- **Status Policy TU:** TU **TIDAK DIBERIKAN** hak UPDATE langsung pada tabel `tahun_ajaran`. TU hanya dapat mengganti tahun ajaran aktif melalui RPC `rpc_set_active_tahun_ajaran()`.

### B. Matriks GRANT, REVOKE, RLS & SECURITY DEFINER
- **Tabel `public.profil_pesantren`:**
  - `GRANT SELECT ON public.profil_pesantren TO anon, authenticated;`
  - `GRANT INSERT, UPDATE ON public.profil_pesantren TO authenticated;`
  - RLS UPDATE/INSERT: Dibatasi ketat hanya untuk role `'tu'`, `'admin'`, `'superadmin'`.
  - RLS DELETE: **TIDAK ADA POLICY DELETE** (Dilarang dihapus via API).
- **Tabel `public.tahun_ajaran`:**
  - `GRANT SELECT ON public.tahun_ajaran TO anon, authenticated;`
  - `GRANT INSERT, UPDATE, DELETE ON public.tahun_ajaran TO authenticated;` (Diatur ketat oleh RLS 4-lapis di atas).
- **Fungsi SECURITY DEFINER:**
  - `public.prevent_direct_tahun_ajaran_active_update()`: `REVOKE EXECUTE FROM PUBLIC; GRANT TO anon, authenticated;` (dieksekusi konteks trigger).
  - `public.rpc_set_active_tahun_ajaran()`: `REVOKE EXECUTE FROM PUBLIC; GRANT TO authenticated;` (hanya dapat dipanggil akun login sah dengan role TU/Admin/Superadmin).
  - `public.trg_audit_profil_pesantren()`: `REVOKE EXECUTE FROM PUBLIC; GRANT TO anon, authenticated;`.
  - `public.trg_audit_tahun_ajaran()`: `REVOKE EXECUTE FROM PUBLIC; GRANT TO anon, authenticated;`.
  - Seluruh fungsi `SECURITY DEFINER` menggunakan `SET search_path = public, pg_temp;` dan kualifikasi schema penuh.

### C. Validasi Trigger Guard `PG_CONTEXT` Lintas Skenario
- Menggunakan regex POSIX resmi: `IF v_context !~ '(^|\n)PL/pgSQL function (public\.)?rpc_set_active_tahun_ajaran\('`.
- **Hasil Skenario:**
  1. Direct `UPDATE tahun_ajaran SET is_active = true`: **DITOLAK** (`RAISE EXCEPTION`).
  2. RPC resmi dipanggil oleh TU: **SUKSES**.
  3. RPC resmi dipanggil oleh Admin (Pengasuh): **SUKSES**.
  4. RPC resmi dipanggil oleh Superadmin: **SUKSES**.
  5. RPC resmi dipanggil oleh Wali: **DITOLAK** (`Akses ditolak: Hanya Tata Usaha...`).
  6. Fungsi liar lain (`fake_rpc_set_active_tahun_ajaran`): **DITOLAK**.

### D. Audit Indeks Unik Partial & Mitigasi Konflik
- Indeks `idx_single_active_tahun_ajaran` (`ON public.tahun_ajaran ((is_active)) WHERE is_active = true;`) telah ada sejak migrasi `0002_core_admin_tables.sql` (baris 57).
- Klausa `CREATE UNIQUE INDEX IF NOT EXISTS` menjamin jika indeks sudah aktif di produksi, PostgreSQL akan melewatinya tanpa error.
- **Prosedur Manual (Bila Terjadi Anomali Data):**
  Sebelum menjalankan migrasi 015, jalankan query verifikasi read-only:
  ```sql
  SELECT id, nama, is_active FROM public.tahun_ajaran WHERE is_active = true;
  ```
  Jika muncul lebih dari 1 baris aktif akibat anomali masa lalu, jalankan resolusi manual sebelum migrasi:
  ```sql
  -- Tentukan satu ID tahun ajaran yang sah aktif, matikan yang lain:
  UPDATE public.tahun_ajaran SET is_active = false WHERE id <> '<ID_TAHUN_AJARAN_AKTIF>';
  ```

### E. Verifikasi Kesesuaian Skema Pendukung
- `public.audit_logs`: Kolom `user_id`, `user_role`, `aktivitas`, `jenis_objek`, `objek_id`, `data_sebelum`, `data_sesudah`, `alasan_perubahan` terbukti 100% identik dengan definisi migrasi `0005_kepesantrenan_and_audit_tables.sql`.
- `public.profiles`: Relasi FK `updated_by REFERENCES public.profiles(id)` terbukti cocok dengan migrasi `0001`.
- `public.set_updated_at()`: Fungsi trigger telah aktif sejak migrasi `0001` dan dapat digunakan tanpa kendala.

### F. Identitas Pesantren & Placeholder
- Nilai nama resmi `'Pondok Pesantren Modern Abu Manshur'` telah terkonfirmasi.
- Nilai NSPP, NPSN, SK Pendirian, alamat, dan nomor kontak pada baris default diberi penjelasan resmi sebagai **rujukan operasional awal / placeholder** yang dapat disunting dan disesuaikan sewaktu-waktu oleh staf TU melalui antarmuka menu *Pengaturan Profil Pesantren*.

---

## 2. Hasil Pengujian Database Nyata & Sistem

1. **Uji Nyata PostgreSQL In-Memory (`@electric-sql/pglite`):**
   - 11/11 skenario lulus: eksekusi utuh tanpa error, inisialisasi dinamis mengadopsi tahun aktif, idempotensi re-run tidak menimpa data, direct update is_active ditolak, fake RPC ditolak, RPC TU/Admin/Superadmin berhasil, role wali ditolak, unique index memblokir duplikasi active, dan audit log terekam lengkap.
2. **Vitest Comprehensive Suite:**
   - 25 file test, **407/407 passed (100% lulus)**.
3. **TypeScript Strict Typecheck:**
   - `npx tsc --noEmit` -> **0 errors**.
4. **Next.js Production Build:**
   - 21/21 static & dynamic routes **terkompilasi sukses** (exit code 0).

---

## 3. Risiko yang Masih Tersisa & Mitigasinya

| Potensi Risiko | Tingkat | Mitigasi yang Diterapkan |
|:---|:---:|:---|
| **Konflik Baris Ganda Aktif Lama** | Sangat Rendah | Indeks unik parsial sudah ada sejak migrasi 0002. Tersedia kueri pra-cek mandiri read-only. |
| **Bypass UPDATE Status Aktif** | Nihil | Diamankan ganda oleh RLS (hanya admin/superadmin) dan trigger PG_CONTEXT regex call-stack guard. |
| **Data Profil Tertimpa saat Deployment Ulang** | Nihil | Klausa `WHERE NOT EXISTS (SELECT 1 FROM public.profil_pesantren) ON CONFLICT (id) DO NOTHING` menjamin data yang diinput TU tidak hilang. |
| **Eksploitasi Role Tak Berizin** | Nihil | Proteksi otorisasi eksplisit di dalam RPC dengan penanganan khusus SQL NULL three-valued logic. |

---

## 4. Status Akhir & Commit Terbaru

- **Commit Terbaru:** `e86ed16` (dan pembaruan sinkronisasi ini).
- **Status Akhir:** **SIAP MIGRASI**

Naskah SQL final pada berkas [`supabase/migrations/015_profil_pesantren.sql`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/015_profil_pesantren.sql) telah diverifikasi aman, konsisten, dan siap dijalankan di Supabase Cloud SQL Editor.
