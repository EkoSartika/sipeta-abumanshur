# LAPORAN FINAL SECURITY GATE — MIGRASI DATABASE 015
## Audit Kemanan, Pembatasan RPC Eksklusif, Anti-Bypass Trigger Guard, & RLS Hardening

**Pondok Pesantren Modern Abu Manshur — Cirebon**  
**Tanggal Audit:** 10 November 2026  
**Status Keamanan:** **SECURITY GATE PASSED — READY FOR APPROVAL**  
**Eksekusi Cloud:** **DITAHAN SECARA LOKAL (TIDAK DIJALANKAN KE SUPABASE CLOUD)**  

---

## 1. Ringkasan Eksekutif Hasil Pemeriksaan

Berdasarkan mandat pemeriksaan final keamanan migrasi `015_profil_pesantren.sql`, telah dilakukan audit forensik dan hardening tingkat tinggi pada level PostgreSQL, RLS, RPC, dan lapisan kode aplikasi.

### Matriks Kepatuhan 8 Fokus Utama:
| No | Fokus Utama Pemeriksaan | Status Gate | Mekanisme Pertahanan Database |
|:---|:---|:---:|:---|
| 1 | **Akses Eksklusif RPC untuk Tahun Pelajaran** | **PASS** | Trigger guard `prevent_direct_tahun_ajaran_active_update` memblokir seluruh UPDATE langsung pada kolom `is_active`. Pergantian tahun ajaran hanya bisa berhasil jika dipanggil melalui `rpc_set_active_tahun_ajaran()`. |
| 2 | **Cegah Multiple Active Tahun Pelajaran** | **PASS** | Terproteksi ganda: (a) Unique partial index `idx_single_active_tahun_ajaran` di level storage engine, dan (b) RPC atomik yang menonaktifkan seluruh baris lama sebelum mengaktifkan baris baru. |
| 3 | **Pembersihan Seluruh Policy Lama `tahun_ajaran`** | **PASS** | Menghapus seluruh 5 policy lama pada `public.tahun_ajaran` untuk mengeliminasi celah permissive `OR`. Menggantinya dengan 4 policy baru yang terisolasi ketat. |
| 4 | **Kesesuaian Wewenang Role (TU, Admin, Superadmin)** | **PASS** | TU memiliki hak mengelola profil lembaga dan memicu aktivasi tahun ajaran via RPC, namun TU **tidak memiliki** izin UPDATE langsung, INSERT, atau DELETE master data `tahun_ajaran`. |
| 5 | **Pembatasan Hak EXECUTE RPC** | **PASS** | Izin `EXECUTE` pada `rpc_set_active_tahun_ajaran` secara eksplisit dicabut dari `PUBLIC` (`REVOKE EXECUTE ... FROM PUBLIC`) dan hanya diberikan kepada `authenticated`. Role dicek di awal fungsi. |
| 6 | **Audit Trail Database-Level (`audit_logs`)** | **PASS** | Trigger berhak `SECURITY DEFINER` `trg_audit_profil_pesantren_logger` dan `trg_audit_tahun_ajaran_logger` menjamin setiap perubahan tercatat ke tabel append-only `public.audit_logs`. |
| 7 | **Kelangsungan Realtime & Penyimpanan Permanen** | **PASS** | Tabel `profil_pesantren` dan `tahun_ajaran` terdaftar pada `supabase_realtime`. State tersinkronisasi instan ke seluruh browser aktif dengan fallback `localStorage`. |
| 8 | **Proteksi Data Produksi yang Sudah Ada** | **PASS** | Menggunakan klausul `WHERE NOT EXISTS (SELECT 1 FROM public.profil_pesantren)`. Jika data profil sudah ada di produksi, tidak akan ditimpa atau diubah. |

---

## 2. Rincian Teknis & Rekayasa Pertahanan

### A. Anti-Bypass Trigger Guard pada Kolom `is_active`
Untuk memastikan bahwa tidak ada pengguna, skrip API, atau peretas yang dapat mengubah status aktif tahun pelajaran secara langsung tanpa melalui RPC, diterapkan mekanisme session-flag guarded trigger:

```sql
CREATE OR REPLACE FUNCTION public.prevent_direct_tahun_ajaran_active_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (OLD.is_active IS DISTINCT FROM NEW.is_active) AND current_setting('sipeta.allow_tahun_ajaran_switch', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Akses ditolak: Status aktif tahun pelajaran HANYA dapat diubah melalui rpc_set_active_tahun_ajaran(). UPDATE langsung dilarang.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_direct_tahun_ajaran_update ON public.tahun_ajaran;
CREATE TRIGGER trg_guard_direct_tahun_ajaran_update
BEFORE UPDATE ON public.tahun_ajaran
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_tahun_ajaran_active_update();
```

Di dalam fungsi RPC `rpc_set_active_tahun_ajaran`, session setting dibuka secara lokal untuk transaksi tersebut:
```sql
PERFORM set_config('sipeta.allow_tahun_ajaran_switch', 'on', true);
```
Dengan demikian:
- Upaya direct update seperti `supabase.from('tahun_ajaran').update({ is_active: true })` akan **selalu dilempar exception dan gagal**.
- Hanya eksekusi melalui RPC resmi yang dapat mengubah kolom `is_active`.

---

### B. Eliminasi Celah Permissive `OR` pada RLS `public.tahun_ajaran`
Dalam PostgreSQL, kebijakan RLS bersifat kumulatif permissive (`OR`). Jika ada satu policy lama yang mengizinkan `UPDATE` atau `FOR ALL` untuk role tertentu, maka pembatasan pada policy lain dapat ditembus.

Pada migrasi 015, **SEMUA policy lama dibersihkan**:
1. `DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: baca oleh akun aktif berwenang"`
2. `DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: admin & superadmin kelola"`
3. `DROP POLICY IF EXISTS "Master TahunAjaran: baca oleh akun aktif berwenang"`
4. `DROP POLICY IF EXISTS "Master TahunAjaran: admin & superadmin kelola"`
5. `DROP POLICY IF EXISTS "Master TahunAjaran: TU kelola status aktif"`

Lalu digantikan dengan kebijakan baru yang spesifik per operasi:
1. **SELECT:** `TO anon, authenticated USING (true)` — Semua pengguna dan halaman login publik dapat membaca tahun pelajaran aktif.
2. **INSERT:** `TO authenticated WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'))` — Hanya Admin/Pengasuh dan Superadmin yang dapat menambah tahun pelajaran baru. Role TU, Bendahara, Asatidz, dan Wali dilarang.
3. **UPDATE:** `TO authenticated USING (public.get_my_role() IN ('superadmin', 'admin')) WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'))` — Hanya Admin/Pengasuh dan Superadmin yang dapat memperbarui metadata nama/tanggal master. Perubahan `is_active` tetap diblokir oleh Trigger Guard.
4. **DELETE:** `TO authenticated USING (public.get_my_role() = 'superadmin')` — Hanya Superadmin yang dapat menghapus master tahun ajaran (terikat FK integrity).

---

### C. Pembatasan EXECUTE pada RPC `rpc_set_active_tahun_ajaran`
Fungsi RPC diproteksi di dua lapis:
1. **Lapis Hak Akses SQL:**
   ```sql
   REVOKE EXECUTE ON FUNCTION public.rpc_set_active_tahun_ajaran(UUID) FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION public.rpc_set_active_tahun_ajaran(UUID) TO authenticated;
   ```
2. **Lapis Logika Bisnis:**
   ```sql
   v_role := public.get_my_role();
   IF v_role NOT IN ('tu', 'admin', 'superadmin') THEN
       RAISE EXCEPTION 'Akses ditolak: Hanya Tata Usaha (TU), Pengasuh (Admin), atau Superadmin yang berwenang mengaktifkan tahun pelajaran.';
   END IF;
   ```
Role `wali`, `pengelola` (asatidz), dan `bendahara` yang mencoba memanggil RPC ini akan langsung menerima penolakan error resmi.

---

### D. Jaminan Pencatatan Audit Trail Database (`audit_logs`)
Trigger database dengan hak `SECURITY DEFINER` mencatat setiap mutasi secara otomatis:
1. **Tabel `profil_pesantren`:**
   Mencatat `UPDATE_PROFIL_PESANTREN` dengan payload lengkap `data_sebelum` (OLD) dan `data_sesudah` (NEW).
2. **Tabel `tahun_ajaran`:**
   Mencatat `UPDATE_STATUS_TAHUN_AJARAN` setiap kali status `is_active` beralih.
Karena trigger berjalan sebagai `SECURITY DEFINER`, catatan audit tetap berhasil ditulis meskipun pengguna tidak memiliki hak INSERT langsung ke tabel `public.audit_logs`.

---

## 3. Matriks Otoritas Pengguna Pasca-Migrasi 015

| Fitur / Operasi | TU | Pengasuh (Admin) | Superadmin | Bendahara | Asatidz | Wali Santri | Publik / Anon |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Lihat Profil Pesantren** | Ya | Ya | Ya | Ya | Ya | Ya | Ya (Login) |
| **Ubah Profil Pesantren** | **Ya** | **Ya** | **Ya** | Tidak (RLS) | Tidak (RLS) | Tidak (RLS) | Tidak (RLS) |
| **Hapus Profil Pesantren** | **Ditolak** | **Ditolak** | **Ditolak** | **Ditolak** | **Ditolak** | **Ditolak** | **Ditolak** |
| **Lihat Tahun Pelajaran** | Ya | Ya | Ya | Ya | Ya | Ya | Ya (Login) |
| **Aktifkan Tahun Pelajaran (via RPC)** | **Ya** | **Ya** | **Ya** | Ditolak | Ditolak | Ditolak | Ditolak |
| **UPDATE Langsung `is_active`** | **Diblokir** | **Diblokir** | **Diblokir** | **Diblokir** | **Diblokir** | **Diblokir** | **Diblokir** |
| **Tambah Master Tahun Ajaran** | Tidak (RLS) | **Ya** | **Ya** | Tidak (RLS) | Tidak (RLS) | Tidak (RLS) | Tidak (RLS) |
| **Hapus Master Tahun Ajaran** | Tidak (RLS) | Tidak (RLS) | **Ya** | Tidak (RLS) | Tidak (RLS) | Tidak (RLS) | Tidak (RLS) |

---

## 4. Hasil Verifikasi Pengujian Menyeluruh

| Jenis Pengujian | Target Cakupan | Hasil | Keterangan |
|:---|:---|:---:|:---|
| **TypeScript Typecheck** | `npx tsc --noEmit` | **PASS** | 0 error |
| **Migration 015 Security Audit Test** | `tests/migration-015-audit.test.ts` | **PASS (10/10)** | Seluruh trigger guard, RLS, RPC, dan audit logger terverifikasi |
| **UI/UX Refinements Unit Test** | `tests/ui-ux-refinements.test.ts` | **PASS (7/7)** | Seluruh integrasi portal TU dan pembersihan tampilan terverifikasi |
| **All Test Suites** | `npm test` (Vitest) | **PASS (25/25 files, 406 tests)** | 100% kelulusan seluruh modul aplikasi |
| **Production Build** | `npm run build` | **PASS** | 21 routes terkompilasi optimal |

---

## 5. Keputusan Final & Rekomendasi

1. **Status Kelayakan:** File migrasi `015_profil_pesantren.sql` telah memenuhi seluruh standar keamanan tertinggi (*zero vulnerability, zero permissive leakage, zero direct-mutation bypass*).
2. **Kondisi Produksi Saat Ini:** Database Supabase Cloud dan aplikasi produksi di Vercel **tetap aman, berjalan normal, dan belum tersentuh mutasi database**.
3. **Rekomendasi:** Skrip SQL final dinyatakan **SIAP DAN AMAN UNTUK DIAPLIKASIKAN KE SUPABASE CLOUD** saat Anda memberikan persetujuan.
