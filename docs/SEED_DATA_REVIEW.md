# TINJAUAN DATA AWAL (SEED DATA REVIEW) SIPETA
**Pondok Pesantren Modern Abu Manshur**  
**Berkas Sumber**: `supabase/seed.sql`  
**Tanggal Audit**: 8 November 2026  
**Status**: Aman Secara Struktur — **Wajib Konfirmasi Data Perbankan Sebelum Penggunaan Operasional**

---

## 1. Ikhtisar Isi `seed.sql`

Berkas `supabase/seed.sql` berisi data dasar (master data) untuk inisialisasi awal sistem SIPETA:
- **Jumlah Baris Data**: 13 baris pada 6 tabel master.
- **Tabel Sasaran**:
  1. `public.rekening_pesantren` (1 baris)
  2. `public.tahun_ajaran` (1 baris)
  3. `public.kelas` (3 baris)
  4. `public.kamar` (3 baris)
  5. `public.master_kategori_pelanggaran` (4 baris)
  6. `public.jenis_pembayaran` (4 baris)

---

## 2. Pemeriksaan Keamanan dan Privasi Data

| Parameter Pemeriksaan | Status | Keterangan Temuan |
| :--- | :---: | :--- |
| **Data Santri Riil** | **BERSIH** | `seed.sql` **TIDAK** memuat data santri, NIS, nama santri, maupun biodata santri nyata. |
| **Identitas Wali Riil** | **BERSIH** | `seed.sql` **TIDAK** memuat data orang tua/wali, nomor telepon pribadi, maupun alamat tinggal nyata. |
| **Kredensial / Kata Sandi** | **BERSIH** | `seed.sql` **TIDAK** memuat hash password, token JWT, maupun kredensial akun pengguna. |
| **Kunci Rahasia (API Keys)** | **BERSIH** | Tidak ada API Key Supabase atau Service Role Key di dalam berkas. |
| **Akun Administratif** | **BERSIH** | Tabel `auth.users` dan `public.profiles` sama sekali tidak diinjeksi melalui seed. Akun Superadmin dibuat tersendiri melalui Supabase Auth resmi. |
| **Transaksi Keuangan Palsu** | **BERSIH** | `seed.sql` **TIDAK** memuat data pada `tagihan`, `transaksi_pembayaran`, `alokasi_pembayaran`, `mutasi_uang_saku`, atau `saldo_uang_saku`. Tidak ada risiko laporan keuangan semu tercatat dalam pembukuan resmi. |

---

## 3. Hasil Remediasi C-01: Penghapusan Rekening Placeholder

### Status: **CLOSED (Terverifikasi)**
- **Tindakan**:
  Nomor rekening placeholder `7198823456` dan Bank Syariah Indonesia telah **DIHAPUS** secara permanen dari berkas `supabase/seed.sql`.
- **Mekanisme Tata Kelola Rekening Resmi**:
  1. Tabel `public.rekening_pesantren` pada inisialisasi awal dibiarkan steril (0 baris).
  2. Fungsi RPC transaksi `rpc_checkout_pembayaran` menahan pembuatan transaksi jika belum ada rekening resmi yang aktif.
  3. Superadmin mengonfigurasi dan mengaktifkan nomor rekening resmi yayasan secara langsung melalui menu *Rekening Resmi Tunggal Pesantren* di Portal Superadmin setelah akun pimpinan terverifikasi.
  4. Tidak ada risiko nomor rekening rekaan atau salah sasaran tampil di aplikasi wali santri.

---

## 4. Evaluasi Variasi Kebijakan Cicilan pada Master Pembayaran

Empat jenis pembayaran awal pada `seed.sql` dirancang untuk menguji 3 model kebijakan cicilan PRD:
1. **`SPP-NOV-2026`** (Rp 850.000):
   - Kebijakan Cicilan: `TIDAK_BOLEH`
   - Menguji penolakan cicilan; wajib dibayar penuh.
2. **`MKN-NOV-2026`** (Rp 650.000):
   - Kebijakan Cicilan: `MINIMAL_NOMINAL` (Min. Rp 300.000)
   - Menguji batas bawah cicilan uang makan.
3. **`KEG-RIHLAH-2026`** (Rp 1.200.000):
   - Kebijakan Cicilan: `MINIMAL_NOMINAL` (Min. Rp 400.000)
   - Menguji pembayaran bertahap kegiatan semesteran.
4. **`SRG-KITAB-2026`** (Rp 950.000):
   - Kebijakan Cicilan: `BEBAS`
   - Menguji kebebasan nominal pembayaran sesuai kemampuan wali.

Seluruh data master jenis pembayaran telah mematuhi constraint `chk_kebijakan_minimal_cicilan` dan `chk_jenis_pembayaran_tanggal`.

---

## 5. Checklist Kesiapan Seed Data Produksi

Sebelum `seed.sql` dieksekusi di Supabase Cloud:
- [ ] Konfirmasi nomor rekening resmi Yayasan Pondok Pesantren Modern Abu Manshur dengan Pimpinan/Bendahara.
- [ ] Konfirmasi nama kelas aktual tahun ajaran berjalan.
- [ ] Konfirmasi nama kamar dan gedung asrama putra/putri aktual.
- [ ] Konfirmasi besaran tarif syahriyah (SPP) dan uang makan santri yang berlaku resmi.
- [ ] Pastikan seluruh migrasi `0001` s.d. `0007` telah berstatus sukses sebelum menjalankan `seed.sql`.

