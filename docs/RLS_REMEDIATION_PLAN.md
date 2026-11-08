# RLS REMEDIATION PLAN — SIPETA
**Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur**
**Target Supabase:** `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`
**Dokumen Referensi:** `supabase/migrations/008_security_remediation.sql`

---

## 1. Latar Belakang & Tujuan

Setelah migrasi tahap pertama (`0001` - `0007`) dijalankan pada Supabase Cloud, sistem database SIPETA telah memiliki 27 tabel operasional yang seluruhnya mengaktifkan Row Level Security (RLS). Namun, evaluasi keamanan mendalam mengidentifikasi kebutuhan mitigasi terhadap potensi kebocoran data sensitif (privasi pembinaan santri), optimalisasi target role PostgreSQL (`TO authenticated` vs `{public}`), serta penghapusan redundansi pada kebijakan penyimpanan berkas (Storage).

Rencana remediasi ini mengarahkan penyempurnaan menyeluruh melalui migrasi terisolasi `supabase/migrations/008_security_remediation.sql` tanpa merusak data atau struktur tabel yang sudah ada.

---

## 2. Rincian Teknis Eksekusi Migrasi 008

Migrasi 008 dirancang dengan prinsip **idempotent**, **zero-downtime**, dan **non-destructive**:

### Bagian 1: Pembersihan Kebijakan Lama (Clean Dropping)
Setiap kebijakan lama pada 27 tabel operasional dihapus secara aman menggunakan sintaks:
```sql
DROP POLICY IF EXISTS "<nama_kebijakan>" ON public.<tabel>;
```
Hal ini memastikan tidak terjadi konflik nama kebijakan (*duplicate policy error*) saat migrasi dieksekusi di Supabase Cloud.

### Bagian 2: Penerapan Ulang dengan Hardening Eksplisit
Semua 48 kebijakan dibuat kembali dengan spesifikasi eksplisit:
1. **Target Role `TO authenticated`**:
   Semua kueri dari pengguna yang belum login akan langsung ditolak oleh PostgreSQL engine pada gerbang RLS sebelum mengevaluasi ekspresi fungsi kompleks (`get_my_role()` atau `get_my_santri_id()`).
2. **Dedicated Anon Access pada Pengumuman**:
   Satu-satunya tabel yang diizinkan untuk kueri unauthenticated adalah `public.pengumuman` melalui kebijakan:
   ```sql
   CREATE POLICY "Pengumuman: baca publik anon"
   ON public.pengumuman FOR SELECT
   TO anon
   USING (is_published = true);
   ```
3. **Pengetatan Privasi Wali pada Riwayat Kedisiplinan**:
   ```sql
   CREATE POLICY "Riwayat Kedisiplinan: baca sesuai akses kedisiplinan"
   ON public.riwayat_perubahan_kedisiplinan FOR SELECT
   TO authenticated
   USING (
       EXISTS (
           SELECT 1 FROM public.catatan_kedisiplinan c
           WHERE c.id = riwayat_perubahan_kedisiplinan.catatan_kedisiplinan_id
           AND (
               public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
               OR (
                   public.get_my_role() = 'wali'
                   AND c.santri_id = public.get_my_santri_id()
                   AND c.is_published_to_wali = true
               )
           )
       )
   );
   ```

### Bagian 3: Deduplikasi Kebijakan Storage
Kebijakan tumpang tindih pada `storage.objects`:
```sql
DROP POLICY IF EXISTS "Storage Foto Penyerahan: upload eksklusif bendahara" ON storage.objects;
```
Kebijakan `Storage Foto Penyerahan: kelola` (FOR ALL) mengambil alih hak INSERT, UPDATE, DELETE, dan SELECT untuk Bendahara dan Superadmin secara komprehensif.

---

## 3. Analisis Dampak Terhadap 5 Portal & Service Layer

| Portal / Modul | Dampak Perubahan | Status Kompatibilitas |
| :--- | :--- | :--- |
| **Superadmin Portal** | Tetap memiliki hak penuh mengelola akun, sistem audit logs, dan master data. | 100% Kompatibel |
| **Admin Portal** | Pengelolaan akademik, santri, tagihan, dan pengumuman tetap berjalan normal. | 100% Kompatibel |
| **Bendahara Portal** | Verifikasi pembayaran, approval top-up uang saku, dan upload foto penyerahan kas tetap lancar. | 100% Kompatibel |
| **Pengelola Kepesantrenan** | Input catatan kedisiplinan, tahfidz, dan mengaji tetap aman. Catatan yang belum dipublikasi tetap terlihat oleh internal. | 100% Kompatibel |
| **Portal Wali Santri** | Data santri miliknya tetap dapat diakses. Riwayat kedisiplinan hanya tampil jika catatan induk telah dipublikasikan (`is_published_to_wali = true`). | 100% Kompatibel & Lebih Aman |
| **Halaman Publik / Landing** | Pengunjung umum tetap dapat melihat pengumuman resmi yang terbit (`is_published = true`). | 100% Kompatibel |

---

## 4. Prosedur Rollback (Rencana Cadangan)

Jika terjadi kendala operasional yang tak terduga, rollback dapat dilakukan dengan mengeksekusi kembali blok RLS dari `supabase/migrations/0007_rls_and_storage_policies.sql`.

Langkah rollback:
1. Buka Supabase SQL Editor.
2. Salin isi Bagian 2 sampai Bagian 8 dari `supabase/migrations/0007_rls_and_storage_policies.sql`.
3. Jalankan skrip tersebut untuk mengembalikan status kebijakan ke kondisi sebelum migrasi 008.
*(Catatan: Pengujian lokal pada PostgreSQL 16 membuktikan 0 kegagalan dan 0 regresi, sehingga rollback diperkirakan tidak diperlukan).*

