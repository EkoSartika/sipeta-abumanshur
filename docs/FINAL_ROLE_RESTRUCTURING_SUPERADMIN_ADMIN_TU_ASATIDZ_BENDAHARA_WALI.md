# LAPORAN FINAL RESTRUKTURISASI ROLE, HAK AKSES, DAN PORTAL PENGASUH SIPETA

**Sistem Informasi Pelayanan Terpadu (SIPETA)**  
**Pondok Pesantren Modern Abu Manshur — Cirebon**  
*Tanggal Finalisasi:* 9 November 2026  
*Status Implementasi:* SELESAI & TERVERIFIKASI  
*Repositori:* `https://github.com/EkoSartika/sipeta-abumanshur.git`  
*Branch:* `main`  
*Domain Resmi:* `https://sipetaabumanshur.vercel.app` (Alias: `https://sipeta-abumanshur.vercel.app`)

---

## 1. RINGKASAN EKSEKUTIF RESTRUKTURISASI

Berdasarkan mandat penyesuaian struktur organisasi kepengurusan Pondok Pesantren Modern Abu Manshur, sistem SIPETA telah direstrukturisasi secara menyeluruh dari model 5 role generik menjadi **6 role spesifik berbasis tata kelola pesantren**:

1. **SUPERADMIN (Pemilik / Pembuat SIPETA)** — Akun teknis tingkat tertinggi pembuat aplikasi dengan proteksi mutlak.
2. **ADMIN (Pengasuh Pondok)** — Pimpinan tertinggi pesantren dengan kewenangan pengawasan eksekutif lintas divisi.
3. **TU (Tata Usaha)** — Pengelola administrasi kesantrian, master data kelas, kamar asrama, dan perpindahan penempatan.
4. **ASATIDZ** — Dewan asatidz dan pembina kamar untuk pencatatan ibadah, tahfidz, kedisiplinan, dan prestasi.
5. **BENDAHARA** — Pengelola perbendaharaan dan keuangan pesantren (memiliki seluruh fitur Asatidz + Keuangan Lengkap).
6. **WALI SANTRI** — Orang tua/wali murid dengan akses terisolasi 1:1 ke data putra/putrinya.

Seluruh kode aplikasi, navigasi sidebar, sistem autentikasi, API route, Server Action, serta unit test telah diselaraskan tanpa merusak integritas database Supabase Cloud yang sedang beroperasi.

---

## 2. DETAIL STRUKTUR 6 ROLE & KEBIJAKAN KEAMANAN

### A. SUPERADMIN — Pemilik / Pembuat SIPETA
* **Akun Utama:**
  - Email: `sipetaabumanshur@gmail.com`
  - Username: `superadmin`
  - UUID: `af7315fd-a82f-4c73-9bd1-4967d038ae7e`
  - Role: `superadmin`
* **Kebijakan Keamanan Mutlak (Hard-Locked):**
  1. **Anti-Hapus:** Tombol delete dinonaktifkan di frontend, dan API route (`DELETE /api/admin-users`) menolak keras penghapusan akun ber-role `superadmin` dengan status proteksi sistem.
  2. **Anti-Nonaktif:** Status aktif `is_active` akun Superadmin utama dikunci dan tidak dapat di-toggle menjadi `false`.
  3. **Anti-Duplikasi:** Opsi role `superadmin` dihilangkan dari dropdown pembuatan akun baru. API route menolak jika ada request pembuatan role `superadmin`.
  4. **Anti-Promosi:** Akun non-superadmin tidak dapat dipromosikan menjadi `superadmin` melalui API pengelolaan akun mana pun.
  5. **Anti-Mutasi Role:** Role akun Superadmin tidak dapat diubah oleh siapa pun.
  6. **Cakupan Akses:** Pemeliharaan sistem, manajemen staf/pengguna, konfigurasi, reset kata sandi staf, dan backup/ekspor.

### B. ADMIN — Pengasuh Pondok (Portal Pengawasan Eksekutif)
* **Karakteristik & Filosofi:**
  - Pengasuh Pondok memegang amanah kepemimpinan moral, syar'i, dan manajerial tertinggi pesantren.
  - Peran Pengasuh berfokus pada **pengawasan menyeluruh (executive oversight)** dan **evaluasi kebijakan**, bukan pekerjaan teknis entri harian atau mutasi kasir.
* **Internal Role Compatibility:** Menggunakan internal role `admin` pada database Cloud untuk menjamin kompatibilitas 100% tanpa risiko migrasi data lama.
* **Hak Akses & Dashboard Eksekutif:**
  - **Kuadran 1 (Kependudukan Santri):** Total santri, rincian status (Aktif, Cuti, Lulus, Pindah), rasio santri putra/putri, serta distribusi kelas dan kamar.
  - **Kuadran 2 (Pengawasan Keuangan):** Rekapitulasi global tagihan, total penerimaan SPP/uang pangkal, tunggakan berjalan, saldo uang saku santri, dan status verifikasi bendahara (**Read-Only / Hak Pantau**, tanpa hak manipulasi jurnal pembukuan).
  - **Kuadran 3 (Pengawasan Kepesantrenan):** Setoran tahfidz Al-Qur'an terbaru, sebaran mutaba'ah mengaji, rekapitulasi poin pelanggaran kedisiplinan, serta raihan prestasi santri.
  - **Kuadran 4 (Operasional & Warta):** Penyiaran pengumuman/agenda pondok dan audit trail seluruh aktivitas mutasi staf.

### C. TU — Tata Usaha (Administrasi Santri & Penempatan)
* **Karakteristik & Tanggung Jawab:**
  - Divisi teknis administrasi dan kependudukan santri.
* **Fitur Utama Portal TU (`/tu`):**
  1. **Data Santri & Akun Wali:** Pencarian, filter per kelas/kamar/status, ekspor data santri ke format Excel resmi.
  2. **Registrasi Santri Baru:** Pendaftaran santri baru dengan otomatisasi pembuatan akun Orang Tua / Wali Santri (Username = NIS, Password Awal = NIS, kewajiban ganti password).
  3. **Import Batch Excel:** Pengunggahan massal data santri via file Excel resmi dengan validasi bertahap, auto-resolve NIS duplikat, dan pembuatan akun wali otomatis.
  4. **Master Kelas & Kamar Asrama:** Tambah, edit, dan pengelolaan kapasitas kelas serta kamar asrama.
  5. **Pemindahan Penempatan Santri (Mutasi Kelas & Kamar):**
     - Form pemindahan santri antar kelas dan asrama.
     - Pencatatan riwayat penempatan santri ke tabel `public.riwayat_penempatan_santri`.
     - Trigger database `handle_after_santri_placement_update` secara otomatis merekam histori dan alasan pemindahan.
  6. **Safe-Delete Santri:** Penghapusan aman santri (mendeteksi relasi pembayaran, tabungan, dan riwayat disiplin). Jika santri memiliki relasi keuangan/historis, sistem mengalihkannya menjadi soft-delete (`status = 'PINDAH'` / `'NONAKTIF'`) demi integritas audit.

### D. ASATIDZ (Pengganti Nama Pengelola Kepesantrenan)
* **Karakteristik & Penamaan:**
  - Label resmi UI: **Asatidz** (menggantikan istilah "Pengelola Kepesantrenan").
  - Internal DB compatibility: Role database tetap `pengelola` (dengan dukungan transparan untuk kode `asatidz`).
  - Halaman Login Resmi: `/asatidz/login` (URL lama `/pengelola/login` dialihkan secara otomatis dengan HTTP 307 redirect).
* **Fitur Utama:**
  - Mutaba'ah Halaqah Mengaji.
  - Pencatatan Setoran Tahfidz Al-Qur'an (Juz, Surah, Ayat, Nilai Tajwid).
  - Buku Catatan Prestasi Santri.
  - Buku Kedisiplinan & Poin Pelanggaran Asrama.
  - Master Kategori Pelanggaran (Poin & Konsekuensi).

### E. BENDAHARA (Asatidz + Keuangan Lengkap)
* **Karakteristik:**
  - Sesuai struktur organisasi pesantren, Bendahara merupakan Asatidz senior yang diberi amanah keuangan.
  - Portal Bendahara mengintegrasikan **seluruh modul Asatidz** (mengaji, tahfidz, prestasi, kedisiplinan) ditambah **seluruh modul Keuangan**.
* **Fitur Tambahan Keuangan:**
  - Pembuatan & Pengelolaan Master Tarif Pembayaran.
  - Penagihan SPP dan Uang Pangkal.
  - Verifikasi Bukti Pembayaran Tagihan.
  - Verifikasi Setoran Titipan Uang Saku Digital.
  - Penyerahan Uang Saku Tunai Santri.
  - Ringkasan Saldo, Riwayat Mutasi Buku Besar, dan Jurnal Koreksi Finansial yang immutable (append-only ledger).

### F. WALI SANTRI
* **Karakteristik:**
  - Akses terisolasi 1:1 ke santri yang bersangkutan.
  - Identitas Login: Nomor Induk Santri (NIS).
  - Kata Sandi Pertama: NIS (dengan kewajiban `must_change_password` saat login pertama).
  - Portal Wali: Pembayaran tagihan, permohonan uang saku, pemantauan tahfidz, nilai mengaji, dan rekam kedisiplinan putra/putri.

---

## 3. MATRIKS HAK AKSES & KEWENANGAN FINAL

| Modul / Fitur | Superadmin | Pengasuh (Admin) | Tata Usaha (TU) | Asatidz | Bendahara | Wali Santri |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Manajemen Pengguna Staf** | Full (Kecuali Superadmin Baru) | Read-Only | No | No | No | No |
| **Audit Log Lintas Staf** | Full | Read-Only | No | No | No | No |
| **Data Santri (Lihat & Cari)** | Read-Only | Read-Only | Full | Read-Only | Read-Only | Anak Sendiri |
| **Registrasi & Import Santri** | No | No | Full | No | No | No |
| **Hapus Santri (Safe Delete)** | No | No | Full (Safe/Soft) | No | No | No |
| **Master Kelas & Kamar** | Read-Only | Read-Only | Full | Read-Only | Read-Only | No |
| **Pemindahan Kelas & Kamar** | No | No | Full | No | No | No |
| **Mutaba'ah Mengaji** | Read-Only | Read-Only | No | Full | Full | Read (Anak) |
| **Setoran Tahfidz Qur'an** | Read-Only | Read-Only | No | Full | Full | Read (Anak) |
| **Buku Kedisiplinan & Poin** | Read-Only | Read-Only | No | Full | Full | Read (Anak) |
| **Master Kategori Pelanggaran** | Read-Only | Read-Only | No | Full | Full | No |
| **Catatan Prestasi Santri** | Read-Only | Read-Only | No | Full | Full | Read (Anak) |
| **Master Tagihan & Tarif SPP** | No | Read-Only | No | No | Full | No |
| **Verifikasi Pembayaran SPP** | No | Read-Only | No | No | Full | Upload Bukti |
| **Kelola Uang Saku Santri** | No | Read-Only | No | No | Full | Ajukan Titipan |
| **Jurnal Koreksi & Saldo** | No | Read-Only | No | No | Full (Append-Only) | No |
| **Pengumuman & Agenda** | Full | Full | Buat Warta Santri | Read-Only | Read-Only | Read-Only |

---

## 4. PEMETAAN LOGIN URL, REDIRECT, DAN ISOLASI KEAMANAN

### A. Rute Login Resmi
Setiap role memiliki pintu masuk terisolasi dengan validasi kredensial dan role:

| Role Pengguna | URL Login Resmi | Label Portal | Catatan Redirection |
|---|---|---|---|
| **Superadmin** | `/superadmin/login` | Portal Superadmin | Isolasi ketat akun teknis |
| **Pengasuh Pondok** | `/admin/login` | Portal Pengasuh Pondok | Portal eksekutif pimpinan |
| **Tata Usaha (TU)** | `/tu/login` | Portal Tata Usaha (TU) | Khusus administrasi santri |
| **Asatidz** | `/asatidz/login` | Portal Asatidz | Rute resmi asatidz & pembina |
| **Bendahara** | `/bendahara/login` | Portal Bendahara Pesantren | Layanan perbendaharaan |
| **Wali Santri** | `/login` | Portal Orang Tua / Wali Santri | Login menggunakan NIS santri |

### B. Backward Compatibility & Rute Redirection Otomatis
Untuk mencegah broken link bagi pengguna yang menyimpan bookmark rute lama:
- `/pengelola/login` -> Dialihkan otomatis (HTTP 307) ke `/asatidz/login`.
- `/pengelola` -> Dialihkan otomatis (HTTP 307) ke `/asatidz`.
- `/tu` -> Memeriksa otentikasi dan mengarahkan ke dashboard utama `/`.
- `/asatidz` -> Memeriksa otentikasi dan mengarahkan ke dashboard utama `/`.

### C. Kartu Masuk pada Halaman Utama (Homepage)
Halaman utama non-login (`/`) menampilkan **6 Kartu Pintu Masuk Resmi**:
1. **Portal Orang Tua / Wali Santri** (Aksen Hijau Zamrud - Kartu Utama)
2. **Portal Asatidz & Pembina** (Aksen Indigo / Teal)
3. **Portal Bendahara Pesantren** (Aksen Emas / Amber)
4. **Portal Tata Usaha (TU)** (Aksen Biru Royal)
5. **Portal Pengasuh Pondok** (Aksen Cyan / Slate Gelap)
6. **Portal Superadmin** (Aksen Abu-abu Gelap / Monokromatik)

---

## 5. LOCAL MIGRATION 013 & PANDUAN AKTIVASI CLOUD MANDIRI

Berkas migrasi lokal telah disiapkan di:
`supabase/migrations/013_tu_role_and_class_room_transfer.sql`

> [!NOTE]
> **Kebijakan Eksekusi Cloud:** Sesuai instruksi aman, berkas ini **TIDAK DIJALANKAN OTOMATIS** ke Supabase Cloud production. Aplikasi saat ini menggunakan fallback mapping yang sepenuhnya kompatibel dengan database berjalan. Jika pihak yayasan/administrator ingin menambahkan nilai enum `'tu'` secara permanen ke Supabase Cloud, jalankan script berikut melalui Supabase SQL Editor.

### Script SQL Migration 013:
```sql
-- ============================================================================
-- SIPETA MIGRATION 013: TU ROLE AND CLASS/ROOM TRANSFER HISTORICAL LOGS
-- ============================================================================

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

-- Pastikan tabel riwayat penempatan santri memiliki indeks performa
CREATE TABLE IF NOT EXISTS public.riwayat_penempatan_santri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE CASCADE,
    kelas_id_lama UUID REFERENCES public.kelas(id) ON DELETE SET NULL,
    kelas_id_baru UUID REFERENCES public.kelas(id) ON DELETE SET NULL,
    kamar_id_lama UUID REFERENCES public.kamar(id) ON DELETE SET NULL,
    kamar_id_baru UUID REFERENCES public.kamar(id) ON DELETE SET NULL,
    alasan_pindah TEXT,
    tanggal_pindah DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_riwayat_penempatan_santri_santri_id 
ON public.riwayat_penempatan_santri(santri_id);

CREATE INDEX IF NOT EXISTS idx_riwayat_penempatan_santri_tgl 
ON public.riwayat_penempatan_santri(tanggal_pindah DESC);
```

---

## 6. HASIL PENGUJIAN OTOMATIS & VERIFIKASI BUILD

### A. Vitest Suite
- **Total Test Files:** 18 berkas (100% Passed)
- **Total Unit & Integration Tests:** 313 skenario uji (100% Passed, 0 Failed)
- **Cakupan Pengujian Baru (`tests/final-role-restructuring.test.ts`):**
  - Proteksi anti-delete & anti-deactivate Superadmin utama.
  - Penolakan pembuatan superadmin tambahan & promosi role.
  - Sifat Read-Only pengawasan Pengasuh Pondok pada tagihan dan transaksi.
  - Akses penuh Tata Usaha (TU) pada registrasi, kelas, kamar, dan transfer.
  - Safe-delete santri TU dengan fallback soft-delete pada santri berelasi.
  - Penyatuan modul Asatidz (mengaji, tahfidz, disiplin) ke dalam Bendahara.
  - Pengalihan otomatis URL `/pengelola/login` ke `/asatidz/login`.
  - Isolasi data 1:1 akun Orang Tua / Wali Santri berdasarkan NIS.
  - Verifikasi 6 kartu pintu masuk homepage.

### B. TypeScript Compilation (`tsc --noEmit`)
- Hasil: **0 Error**. Seluruh tipe database, schema payload, dan interface modul bersesuaian penuh.

### C. Next.js Production Build (`npm run build`)
- Hasil: **Compiled Successfully**.
- Halaman statis (21/21) berhasil di-generate termasuk route `/admin/login`, `/tu/login`, `/asatidz/login`, `/bendahara/login`, `/login`, dan seluruh Server Action API.

---

## 7. KESIMPULAN

Restrukturisasi role dan portal SIPETA telah selesai secara tuntas, aman, dan berstandar enterprise. Seluruh hak akses mencerminkan hierarki kepemimpinan dan operasional harian Pondok Pesantren Modern Abu Manshur dengan perlindungan data yang ketat.
