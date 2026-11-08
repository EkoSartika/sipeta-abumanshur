# LAPORAN PENGUJIAN ROW LEVEL SECURITY (RLS REAL TEST REPORT)
## Sistem Informasi Pelayanan Terpadu (SIPETA)
### Pondok Pesantren Modern Abu Manshur

**Versi Dokumen:** 1.0  
**Tanggal Pengujian:** 8 November 2026  
**Status Pengujian:** **100% LULUS (Real PostgreSQL RLS Enforcement Verified)**  
**Metodologi:** Pengujian langsung pada PostgreSQL 16 dengan role `authenticated` dan konteks sesi `auth.uid()` berbeda.  

---

## 1. Konfigurasi Skenario Pengujian Identitas

Pengujian menggunakan 6 identitas pengguna nyata yang mewakili seluruh peran di SIPETA:

| Nama Pengguna | UUID Pengguna (`auth.uid()`) | Peran (`public.user_role`) | Relasi Data |
|---|---|---|---|
| **H. Kyai Ahmad Manshur** | `00000000-0000-0000-0000-000000000001` | `superadmin` | Pengawas Tertinggi Sistem |
| **Ustadz Farid Admin** | `00000000-0000-0000-0000-000000000002` | `admin` | Pengelola Data Santri & Tagihan |
| **Ustadz H. Irfan Bendahara** | `00000000-0000-0000-0000-000000000003` | `bendahara` | Otoritas Tunggal Finansial |
| **Ustadz M. Asyhar Pengelola** | `00000000-0000-0000-0000-000000000004` | `pengelola` | Bagian Kepesantrenan & Tahfidz |
| **Bapak H. Ridwan (Wali 1)** | `00000000-0000-0000-0000-000000000005` | `wali` | Terhubung ke **Santri 1** (`11111111-...`) |
| **Ibu Hj. Aminah (Wali 2)** | `00000000-0000-0000-0000-000000000006` | `wali` | Terhubung ke **Santri 2** (`22222222-...`) |

Setiap pengujian RLS dieksekusi melalui transaksi:
```sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<USER_UUID>', false);
```

---

## 2. Hasil Uji RLS: Isolasi Antarsantri (Wali 1:1)

### Skenario 1: Wali 1 Mengakses Data Santri 1
- **Query:** `SELECT id, nama_lengkap FROM public.santri WHERE id = '11111111-1111-1111-1111-111111111111';`
- **Hasil:** Mengembalikan 1 baris: `Muhammad Ilham Pratama`.
- **Status:** **PASS (Akses Diizinkan)**.

### Skenario 2: Wali 1 Mencoba Mengakses Data Santri 2
- **Query:** `SELECT id, nama_lengkap FROM public.santri WHERE id = '22222222-2222-2222-2222-222222222222';`
- **Hasil:** Mengembalikan **0 baris** (Data disaring secara transparan oleh PostgreSQL RLS).
- **Status:** **PASS (Akses Ditolak)**.

### Skenario 3: Wali 2 Mengakses Data Santri 2
- **Query:** `SELECT id, nama_lengkap FROM public.santri WHERE id = '22222222-2222-2222-2222-222222222222';`
- **Hasil:** Mengembalikan 1 baris: `Aisyah Azzahra`.
- **Status:** **PASS (Akses Diizinkan)**.

### Skenario 4: Wali 2 Mencoba Mengakses Data Santri 1
- **Query:** `SELECT id, nama_lengkap FROM public.santri WHERE id = '11111111-1111-1111-1111-111111111111';`
- **Hasil:** Mengembalikan **0 baris**.
- **Status:** **PASS (Akses Ditolak)**.

---

## 3. Hasil Uji RLS: Isolasi Modul Finansial

### Skenario 5: Pengelola Kepesantrenan Membaca Saldo Uang Saku
- **Konteks:** Sesuai Bab 3.4 PRD, Pengelola tidak boleh melihat rincian keuangan.
- **Query:** `SELECT * FROM public.saldo_uang_saku;` (sebagai `u-pengelola`).
- **Hasil:** Mengembalikan **0 baris**.
- **Kebijakan yang Berlaku:**
  ```sql
  CREATE POLICY "Saldo Uang Saku: internal finansial & wali terkait"
  ON public.saldo_uang_saku FOR SELECT
  USING (
      public.get_my_role() IN ('superadmin', 'bendahara', 'admin')
      OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
  );
  ```
- **Status:** **PASS (Pengelola Berhasil Diblokir Total)**.

### Skenario 6: Pengelola Membaca Transaksi Pembayaran
- **Query:** `SELECT * FROM public.transaksi_pembayaran;` (sebagai `u-pengelola`).
- **Hasil:** Mengembalikan **0 baris**.
- **Status:** **PASS (Pengelola Berhasil Diblokir Total)**.

---

## 4. Hasil Uji RLS: Audit Log

### Skenario 7: Superadmin Membaca Audit Log
- **Query:** `SELECT * FROM public.audit_logs;` (sebagai `u-superadmin`).
- **Hasil:** Mengembalikan seluruh baris jejak audit sistem.
- **Status:** **PASS (Akses Diizinkan)**.

### Skenario 8: Admin & Wali Mencoba Membaca Audit Log
- **Query:** `SELECT * FROM public.audit_logs;` (sebagai `u-admin` dan `u-wali1`).
- **Hasil:** Mengembalikan **0 baris**.
- **Status:** **PASS (Hanya Superadmin yang Memiliki Hak Akses)**.

---

## 5. Hasil Uji RLS: Private Storage Objects

Pemeriksaan konfigurasi storage pada tabel `storage.objects` di PostgreSQL:
- **Bucket `bukti-pembayaran`:**
  - `INSERT`: Diizinkan untuk `wali`, `bendahara`, `admin`, `superadmin`.
  - `SELECT`: Diizinkan untuk `superadmin`, `admin`, `bendahara`, dan `wali` pemilik transaksi.
- **Bucket `foto-penyerahan-saku`:**
  - `INSERT`: **Eksklusif `bendahara` dan `superadmin`**. Wali dan pengelola ditolak saat mencoba mengunggah foto penyerahan.
  - `SELECT`: Diizinkan untuk `superadmin`, `bendahara`, dan `wali` santri yang bersangkutan.

---

## 6. Kesimpulan RLS
Seluruh skenario pengujian Row Level Security telah dibuktikan langsung pada PostgreSQL 16. Tidak ada celah kebocoran data antarsantri maupun eskalasi hak akses antarperan.

