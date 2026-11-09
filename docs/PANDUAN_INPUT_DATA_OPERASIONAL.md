# PANDUAN INPUT DATA OPERASIONAL RESMI SIPETA
**Pondok Pesantren Modern Abu Manshur**  
**Sasaran Pengguna**: Superadmin & Admin Administrasi (Tata Usaha)  
**File Template Excel**: `public/templates/template-import-santri-sipeta.xlsx`  
**Lokasi Unduh Web**: Menu Santri > Import Data Santri > "Download Template Excel Resmi"

---

## 1. URUTAN TAHAPAN PERSIAPAN DATA OPERASIONAL

Agar tidak terjadi benturan relasi data (Foreign Key Dependency), pengisian data master wajib dilakukan dengan urutan sebagai berikut:

```
[Tahap 1: Konfigurasi Rekening Resmi Pesantren]
                      ↓
[Tahap 2: Input Tahun Ajaran Aktif]
                      ↓
[Tahap 3: Input Master Data Kelas & Kamar]
                      ↓
[Tahap 4: Buat Akun Petugas Internal (Admin, Bendahara, Pengelola)]
                      ↓
[Tahap 5: Import Excel Data Santri & Otomatisasi Akun Wali]
```

---

## 2. PANDUAN PENGISIAN SETIAP TAHAP

### Tahap 1: Konfigurasi Rekening Resmi Pesantren
* **Akses**: Superadmin atau Admin Administrasi (Menu: *Rekening Resmi Pesantren*).
* **Kebijakan Penting**:
  - Hanya ada **1 rekening resmi yang aktif** (`is_active = true`) dalam satu waktu.
  - Rekening ini akan otomatis menjadi rekening tujuan pembayaran pada seluruh bukti transfer dan checkout tagihan wali santri.
* **Kolom Input**:
  1. *Nama Bank*: Contoh: `Bank Syariah Indonesia (BSI)` atau `Bank Rakyat Indonesia (BRI)`.
  2. *Nomor Rekening*: Nomor rekening resmi atas nama yayasan/pesantren.
  3. *Atas Nama*: Contoh: `Yayasan Pondok Pesantren Modern Abu Manshur`.
  4. *Catatan Instruksi*: Petunjuk transfer bagi orang tua/wali santri.

### Tahap 2: Input Master Tahun Ajaran
* **Akses**: Admin Administrasi (Menu: *Tahun Ajaran*).
* **Kolom Input**:
  1. *Tahun Ajaran*: Contoh: `2026/2027`.
  2. *Semester*: Ganjil atau Genap.
  3. *Status*: Set `Aktif`.

### Tahap 3: Input Master Kelas & Kamar Asrama
* **Akses**: Admin Administrasi (Menu: *Data Kelas* & *Data Kamar*).
* **Ketentuan Kelas**:
  - *Nama Kelas*: Contoh: `Kelas VII-A (MTs Putra)`.
  - *Kode Kelas*: Harus unik, contoh: `KLS-7A`.
  - *Tingkat*: 7, 8, 9, 10, 11, atau 12.
* **Ketentuan Kamar**:
  - *Nama Kamar*: Contoh: `Kamar Abu Bakar 01`.
  - *Kode Kamar*: Harus unik, contoh: `KMR-AB-01`.
  - *Kapasitas*: Jumlah maksimal santri per kamar.

### Tahap 4: Buat Akun Petugas Internal Pesantren
* **Akses**: Superadmin (Menu: *Manajemen Akun & Role* > *Buat Pengguna Baru*).
* **Kebijakan SIPETA**:
  - **TIDAK MEMERLUKAN INPUT EMAIL**. Superadmin hanya mengisi nama lengkap, role, username, dan kata sandi.
  - Pilihan role yang tersedia:
    1. **Admin Administrasi** (Petugas Tata Usaha/Sekretariat).
    2. **Bendahara Pesantren** (Petugas Keuangan).
    3. **Pengelola Kepesantrenan** (Petugas Pengasuhan/Tahfidz).
  - Username harus berupa huruf kecil, angka, titik, atau strip (3–30 karakter).

### Tahap 5: Import Excel Data Santri & Pembuatan Akun Wali Berbasis NIS
* **Akses**: Admin Administrasi (Menu: *Santri* > *Import Data Santri*).
* **Struktur 13 Kolom Excel Template**:
  1. `NIS`: **Wajib Format Text**. Angka nol di depan (misal: `02026002`) tidak boleh terpotong.
  2. `Nama Lengkap Santri`: Nama lengkap santri.
  3. `Jenis Kelamin`: `L` (Laki-laki) atau `P` (Perempuan).
  4. `Tempat Lahir`: Nama kota/kabupaten kelahiran.
  5. `Tanggal Lahir`: Format `YYYY-MM-DD` (contoh: `2013-05-12`).
  6. `Kelas`: Nama kelas sesuai master data.
  7. `Kode Kelas`: Kode kelas sesuai master data.
  8. `Kamar Asrama`: Nama kamar asrama sesuai master data.
  9. `Nama Orang Tua/Wali`: Nama lengkap wali santri.
  10. `Hubungan Wali`: Pilihan `Ayah`, `Ibu`, atau `Wali`.
  11. `Nomor Telepon Wali`: Nomor WhatsApp aktif wali.
  12. `Email Kontak (Opsional)`: Boleh dikosongkan.
  13. `Alamat`: Alamat domisili lengkap wali santri.

* **Otomatisasi Akun Wali**:
  - Setiap santri yang berhasil diimport otomatis dibuatkan 1 Akun Wali di Supabase Auth.
  - **Username Wali**: Sama persis dengan NIS santri.
  - **Password Awal**: Sama persis dengan NIS santri.
  - **Status Ganti Password**: Diset `must_change_password = true`.
  - Saat login pertama kali, wali santri diwajibkan mengganti kata sandi sebelum dapat melihat dashboard.

---

## 3. CHECKLIST INTEGRITAS DATA SEBELUM GO-LIVE

- [ ] Pastikan migrasi `008` s/d `012` telah dijalankan di Supabase Cloud.
- [ ] Pastikan rekening bank resmi pesantren sudah tersimpan dan aktif.
- [ ] Pastikan master kelas dan kamar sudah diinput sebelum menjalankan import santri.
- [ ] Pastikan kolom NIS pada file Excel santri bertipe TEXT.
- [ ] Jalankan tombol **Validasi File** (Dry-run) sebelum menekan tombol **Eksekusi Import**.
- [ ] Pastikan tidak ada data santri dummy/fiktif yang tertinggal di produksi.

