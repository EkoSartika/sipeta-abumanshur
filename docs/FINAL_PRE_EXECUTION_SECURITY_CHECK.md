# LAPORAN FINAL PRE-EXECUTION SECURITY CHECK MIGRATION 013 SIPETA

**Sistem Informasi Pelayanan Terpadu (SIPETA)**  
**Pondok Pesantren Modern Abu Manshur — Cirebon**  
*Tanggal Pemeriksaan:* 9 November 2026  
*Dasar Komparasi:* Commit `0f0218e` (Branch `main`)  
*Mode Pemeriksaan:* READ-ONLY (Tanpa Mutasi Data / Skema Cloud)  
*Status Verifikasi:* Audit RLS, Privilege SQL GRANT, Service Role API, & Integritas Akun Superadmin  

---

## 1. KEPUTUSAN AKHIR & EXECUTIVE SUMMARY

| Komponen | Status Keamanan | Keputusan |
| :--- | :--- | :--- |
| **Naskah SQL Migration 013** | **100% Lolos Audit** (Anti-Delete, Additive, Bebas Lock Transaksi) | **AMAN DIEKSEKUSI DI SUPABASE CLOUD** |
| **Isolasi RLS Database** | **100% Lolos Audit** (Evaluasi `OR` PostgreSQL bernilai `FALSE` untuk DELETE TU) | **AMAN DIEKSEKUSI** |
| **Endpoint Service Role Backend** | **Temuan Kritis Teridentifikasi** (`DELETE /api/admin-santri` menyertakan role `tu`) | **PERLU REVISI KODE APLIKASI** |

> [!IMPORTANT]
> ### KEPUTUSAN AKHIR: **AMAN DIEKSEKUSI UNTUK NASKAH SQL MIGRATION 013 — DENGAN CATATAN REVISI PADA ENDPOINT SERVICE ROLE SEBELUM AKUN TU DIAKTIFKAN**
>
> 1. **Naskah SQL Migration 013** berstatus **AMAN DIEKSEKUSI** ke Supabase Cloud SQL Editor. Di tingkat database, tidak ada hak `DELETE` yang diberikan kepada role TU, tidak ada kebijakan role lain yang dihapus, dan tidak ada tabel keuangan yang disentuh.
> 2. **Namun pada API Layer (`src/app/api/admin-santri/route.ts`)**, ditemukan celah otorisasi di mana fungsi `DELETE` masih mengizinkan role `tu` mengeksekusi penghapusan santri melalui *Supabase Admin Client (Service Role Key)* yang membypass RLS database.
> 3. Oleh karena itu, sebelum akun staf dengan role TU diberikan akses operasional di produksi, baris otorisasi pada endpoint `DELETE /api/admin-santri` wajib direvisi agar konsisten dengan prinsip *Anti-Delete*.

---

## 2. HASIL AUDIT PRIVILEGE SQL GRANT & RLS (POINT 1 & 2)

### A. Analisis Privilege SQL GRANT (`authenticated`)
Berdasarkan audit terhadap migrasi dasar `0007_rls_and_storage_policies.sql` (baris 497–500):
```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
```
- **Hak SQL GRANT:** Role database `authenticated` memiliki privilege baseline `SELECT, INSERT, UPDATE, DELETE` pada seluruh tabel `public`.
- **Mekanisme Supabase:** Ini adalah arsitektur standar Supabase di mana otorisasi granular dibebankan sepenuhnya kepada **Row Level Security (RLS)**. Tanpa adanya policy RLS yang mengizinkan (`USING` / `WITH CHECK`), privilege GRANT tersebut tidak dapat dieksekusi oleh pengguna.
- **Kondisi TU:** Karena Migration 013 **TIDAK** mendefinisikan policy `DELETE` untuk TU, maka baseline GRANT `DELETE` pada tabel `santri`, `wali_santri`, `kelas`, dan `kamar` terblokir total oleh RLS.

### B. Status RLS & `FORCE ROW LEVEL SECURITY`
- **Status RLS Aktif:** Terkonfirmasi aktif pada ke-27 tabel `public` via migration `0007` dan `012`.
- **Pengujian Probing Langsung ke Cloud (Read-Only via Anon Key):**
  - `GET https://jvhzrhfzkjqzlhsvvbgy.supabase.co/rest/v1/santri` -> HTTP 200, Hasil: `[]` (Kosong).
  - `GET https://jvhzrhfzkjqzlhsvvbgy.supabase.co/rest/v1/tagihan` -> HTTP 200, Hasil: `[]` (Kosong).
  - *Kesimpulan:* RLS aktif 100% memfilter data dari akses publik tanpa otentikasi.
- **Analisis `FORCE ROW LEVEL SECURITY`:**
  - Klausa `FORCE ROW LEVEL SECURITY` tidak diterapkan pada tabel (hanya `ENABLE ROW LEVEL SECURITY`).
  - *Evaluasi Keamanan:* Dalam PostgreSQL, `FORCE ROW LEVEL SECURITY` hanya memengaruhi *table owner* (`postgres`). Bagi role `authenticated` (pengguna web/klien), perintah `ENABLE ROW LEVEL SECURITY` **selalu dipaksakan secara mutlak**. Pengguna biasa tidak pernah bertindak sebagai table owner, sehingga ketiadaan klausa `FORCE` tidak menimbulkan celah eskalasi hak akses bagi pengguna aplikasi.

---

## 3. AUDIT EVALUASI LOGIKA `OR` PERMISSIVE POLICY (POINT 3)

Dalam PostgreSQL, beberapa kebijakan permissif untuk aksi yang sama digabungkan dengan operator logika `OR`:
$$\text{Izin Operasi} = (\text{Syarat Policy 1}) \lor (\text{Syarat Policy 2}) \lor \dots \lor (\text{Syarat Policy } N)$$

### Matriks Komparasi pada Tabel Administrasi:

| Tabel | Kebijakan DELETE yang Ada di Cloud | Kebijakan TU di Migration 013 | Hasil Evaluasi Logika untuk TU |
| :--- | :--- | :--- | :--- |
| `public.santri` | `public.get_my_role() IN ('superadmin', 'admin')` | **Nihil (0 policy DELETE)** | `FALSE OR [Nihil] = FALSE` (DITOLAK) |
| `public.wali_santri` | `public.get_my_role() IN ('superadmin', 'admin')` | **Nihil (0 policy DELETE)** | `FALSE OR [Nihil] = FALSE` (DITOLAK) |
| `public.kelas` | `public.get_my_role() IN ('superadmin', 'admin')` | **Nihil (0 policy DELETE)** | `FALSE OR [Nihil] = FALSE` (DITOLAK) |
| `public.kamar` | `public.get_my_role() IN ('superadmin', 'admin')` | **Nihil (0 policy DELETE)** | `FALSE OR [Nihil] = FALSE` (DITOLAK) |
| `public.riwayat_penempatan_santri` | `public.get_my_role() = 'superadmin'` | **Nihil (0 policy DELETE)** | `FALSE OR [Nihil] = FALSE` (DITOLAK) |
| Seluruh Tabel Keuangan (9 tabel) | Sesuai role Bendahara & Superadmin | **Nihil (0 policy TU)** | `FALSE OR [Nihil] = FALSE` (DITOLAK) |

**Kesimpulan:** Tidak ada celah di mana role TU dapat menghapus data melalui logika `OR` pada level PostgreSQL RLS.

---

## 4. AUDIT SELURUH API ENDPOINT DENGAN SERVICE ROLE KEY (POINT 4 & 5)

Pemeriksaan mendalam terhadap seluruh endpoint yang menggunakan `createSupabaseAdminClient()` (`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`):

### 1. `src/app/api/admin-users/route.ts`
- **GET (List Akun Staf):** Dibatasi strictly `callerProfile.role === 'superadmin'`. TU ditolak (403).
- **POST (Buat Akun Staf):** Dibatasi strictly `callerProfile.role === 'superadmin'`. TU ditolak (403).
- **PATCH (Edit Akun & Reset Sandi):** Dibatasi strictly `callerProfile.role === 'superadmin'`. TU ditolak (403).
- **DELETE (Hapus Akun Staf):** Dibatasi strictly `callerProfile.role === 'superadmin'`. TU ditolak (403).
- **Status:** **AMAN & TERISOLASI 100%**.

### 2. `src/app/api/admin-santri/import/route.ts`
- **POST (Import Excel Santri & Akun Wali):** Diizinkan untuk `superadmin`, `admin`, dan `tu`.
- **Aksi:** Hanya melakukan validasi, registrasi massal santri, dan pembuatan akun wali (INSERT). Rollback cleanup hanya terjadi saat transaksi gagal di baris terkait.
- **Status:** **AMAN** (Sesuai tugas administrasi Tata Usaha).

### 3. `src/app/api/auth/change-password/route.ts` & `profile/route.ts`
- **Aksi:** Hanya mengubah kata sandi dan biodata akun milik pemanggil sendiri (`id = auth.uid()`).
- **Status:** **AMAN**.

### 4. `src/app/api/admin-santri/route.ts` (TEMUAN KRITIS)
- **POST (Registrasi Santri Baru):** Diizinkan untuk `superadmin`, `admin`, dan `tu`. (Aman, tugas sah TU).
- **DELETE (Penghapusan Santri Terpilih):**
  - **Lokasi Kode:** `src/app/api/admin-santri/route.ts` baris 359–367:
    ```typescript
    // Verifikasi Hak Akses:
    if (
      !callerProfile ||
      !callerProfile.is_active ||
      (callerProfile.role !== "superadmin" && callerProfile.role !== "admin" && callerProfile.role !== "tu")
    ) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menghapus data santri." },
        { status: 403 }
      );
    }
    ```
  - **Analisis Dampak:**
    Karena `callerProfile.role !== "tu"` dimasukkan dalam kondisi lolos, pengguna dengan role TU dapat memanggil `DELETE /api/admin-santri`. Endpoint ini menggunakan `adminClient` (Service Role Key) yang membypass RLS, sehingga TU dapat:
    1. Melakukan hard-delete pada baris `santri`, `wali_santri`, `profiles`, dan `riwayat_penempatan_santri` jika santri belum memiliki histori transaksi keuangan.
    2. Melakukan soft-delete (`status = 'TIDAK_AKTIF'`) jika santri memiliki histori transaksi.
  - **Rekomendasi Revisi:** Ubah baris 362 menjadi:
    ```typescript
    (callerProfile.role !== "superadmin" && callerProfile.role !== "admin")
    ```
    sehingga role `tu` dilarang memanggil `DELETE /api/admin-santri` (HTTP 403).

---

## 5. AUDIT PROTEKSI AKUN SUPERADMIN UTAMA (POINT 6)

### A. Verifikasi Status Langsung di Supabase Cloud (Live Read-Only)
Hasil query langsung ke endpoint Supabase Cloud (`https://jvhzrhfzkjqzlhsvvbgy.supabase.co/rest/v1/profiles`):
```json
{
  "id": "af7315fd-a82f-4c73-9bd1-4967d038ae7e",
  "email": "sipetaabumanshur@gmail.com",
  "username": "superadmin",
  "role": "superadmin",
  "is_active": true
}
```
- Akun Superadmin utama **tetap utuh, aktif, dan tidak mengalami perubahan apa pun**.

### B. Proteksi Multi-Lapis pada Kode Backend
1. **Kebijakan Anti-Deaktivasi Diri Sendiri:**  
   Superadmin dicegah menonaktifkan akunnya sendiri (`admin-users/route.ts` baris 752).
2. **Kebijakan Imunitas Superadmin:**  
   Pemeriksaan `isSuperadminTarget` (berdasarkan role `superadmin`, email `sipetaabumanshur@gmail.com`, atau username `superadmin`) memblokir upaya penonaktifan (`TOGGLE_ACTIVE`) dan perubahan status dari pihak mana pun (baris 765).
3. **Kebijakan Anti-Hapus Mutlak:**  
   Pemeriksaan `isSuperadminTarget` pada operasi DELETE (`admin-users/route.ts` baris 1006) secara eksplisit memasukkan akun Superadmin ke status `SKIPPED` dengan pesan: *"Keamanan: Akun Superadmin dilindungi sistem dan tidak boleh dihapus."*
4. **Kebijakan Anti-Demotion & Anti-Promotion:**  
   Promosi akun lain menjadi Superadmin dilarang keras (baris 466), dan penurunan peran Superadmin dilarang keras (baris 473).

---

## 6. VERIFIKASI KEAMANAN PENAMBAHAN ENUM `tu` (POINT 7 & 8)

1. **Idempotensi Penambahan Enum:**
   ```sql
   DO $$
   BEGIN
       IF NOT EXISTS (
           SELECT 1 FROM pg_type t 
           JOIN pg_enum e ON t.oid = e.enumtypid 
           WHERE t.typname = 'user_role' AND e.enumlabel = 'tu'
       ) THEN
           ALTER TYPE public.user_role ADD VALUE 'tu';
       END IF;
   END $$;
   ```
   Klausa ini tidak akan menyebabkan konflik atau duplikasi jika dijalankan ulang di Supabase SQL Editor.
2. **Kemandirian Migrasi (Zero Impact to Previous Migrations):**
   - Tidak ada file migrasi lama (`001` s.d. `012`) yang disentuh atau diubah.
   - Menggunakan casting eksplisit `public.get_my_role()::text = 'tu'` untuk mencegah kesalahan transactional lock PostgreSQL (`unsafe use of new value in transaction`).
3. **Integritas Data Produksi:**
   - Migration 013 murni bersifat *Data Definition Language* (DDL) untuk penambahan enum dan policy.
   - Tidak ada perintah `UPDATE`, `DELETE`, `TRUNCATE`, atau manipulasi data apa pun.
   - Tidak ada kebijakan role lain yang di-drop.

---

## 7. PERNYATAAN TRANSPARANSI BATASAN AKSES CLOUD

Sesuai instruksi untuk menyatakan secara jujur bagian yang dapat dan belum dapat diverifikasi secara langsung pada Cloud:

1. **Bagian yang Telah Diverifikasi Langsung pada Supabase Cloud (Live):**
   - Keterjangkauan REST API Cloud (`https://jvhzrhfzkjqzlhsvvbgy.supabase.co`).
   - Keberadaan dan integritas akun Superadmin utama (`af7315fd-a82f-4c73-9bd1-4967d038ae7e`).
   - Ketersediaan tabel-tabel utama (`santri`, `wali_santri`, `kelas`, `kamar`, `riwayat_penempatan_santri`, `tagihan`, `transaksi_pembayaran`, `profiles`).
   - Keaktifan proteksi RLS terhadap akses anonim publik (`anonKey` mengembalikan record kosong).
2. **Bagian yang Tidak Dapat Diverifikasi Langsung via REST API Cloud:**
   - Katalog sistem tingkat rendah `pg_catalog.pg_class` (kolom `relrowsecurity` dan `relforcerowsecurity`) serta `information_schema.role_table_grants` tidak diekspos oleh PostgREST secara langsung ke publik.
   - *Mitigasi:* Verifikasi dilakukan melalui komparasi historis naskah migrasi DDL resmi yang telah dieksekusi sebelumnya (`0007_rls_and_storage_policies.sql`) serta uji fungsional perilaku respons HTTP database.

---

## 8. RISIKO YANG MASIH TERSISA & REKOMENDASI TINDAKAN

| No | Komponen | Deskripsi Risiko | Tingkat Risiko | Tindakan Perbaikan yang Direkomendasikan |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `src/app/api/admin-santri/route.ts` | Endpoint `DELETE` mengizinkan role `tu` menghapus santri via service role key | **Sedang-Tinggi** | Hapus `callerProfile.role !== "tu"` dari baris 362 agar role TU ditolak dengan kode HTTP 403 saat memanggil DELETE. |
| 2 | `src/modules/tu/tu-portal.tsx` | UI portal TU masih menampilkan tombol dan modal "Hapus Terpilih" untuk santri | **Rendah** | Sembunyikan atau nonaktifkan tombol bulk delete pada tampilan tabel santri khusus role TU. |

---

## 9. PETUNJUK TINDAK LANJUT BAGI ADMINISTRATOR

1. **Eksekusi SQL Migration 013 di Supabase Cloud:**  
   Naskah SQL `supabase/migrations/013_tu_role_and_class_room_transfer.sql` dapat dieksekusi secara aman melalui **Supabase Dashboard > SQL Editor**. Di tingkat database, skema dan RLS telah mengunci role TU tanpa hak hapus.
2. **Perbaikan Otorisasi Backend Aplikasi:**  
   Sebelum membuat akun pengguna ber-role `tu` pertama kali di sistem, lakukan penyesuaian 1 baris kode pada `src/app/api/admin-santri/route.ts` agar otorisasi server-side sejalan 100% dengan kebijakan RLS database.
