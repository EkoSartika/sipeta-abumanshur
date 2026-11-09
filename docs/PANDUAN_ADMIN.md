# PANDUAN OPERASIONAL ADMIN ADMINISTRASI PESANTREN
## SIPETA — Pondok Pesantren Modern Abu Manshur (Plered - Cirebon)

---

## 1. PENDAHULUAN & PERAN KERJA

Sebagai **Admin Administrasi Pesantren**, Anda bertanggung jawab atas:
1. Pengelolaan data induk santri, tahun ajaran, kelas, dan asrama/kamar.
2. Impor massal data santri menggunakan file Excel dan ekspor data santri.
3. Otomatisasi pembentukan akun Orang Tua / Wali Santri berbasis NIS.
4. Pengelolaan rekening bank resmi BSI pesantren bersama Superadmin *(Migrasi 012)*.
5. Pembuatan dan penerbitan tagihan/SPP santri.
6. Publikasi pengumuman resmi pesantren.

---

## 2. CARA MASUK KE SISTEM (LOGIN)

1. Buka alamat web resmi SIPETA di browser: `https://sipeta-abumanshur.vercel.app` (atau alamat lokal jika di intranet).
2. Pada form **Masuk ke Sistem**:
   - Masukkan **Username** akun admin Anda (contoh: `admin01` atau username yang diberikan Superadmin).
   - Masukkan **Kata Sandi** akun Anda.
3. Klik tombol **Masuk ke Sistem**.
4. Anda akan langsung diarahkan ke **Portal Administrasi Pesantren**.

> [!NOTE]
> Akun Admin Administrasi dibuat oleh Superadmin melalui menu Manajemen Akun. Admin tidak perlu menggunakan email Gmail untuk masuk.

---

## 3. PANDUAN PENGELOLAAN DATA SANTRI

### A. Menambah Santri Secara Satuan (Manual)
1. Pada navigasi sidebar kiri, klik menu **Master Santri**.
2. Klik tombol **+ Tambah Santri Baru**.
3. Isi formulir pendaftaran santri:
   - **NIS**: Masukkan Nomor Induk Santri (contoh: `20260001`). Format adalah teks, angka nol di awal tetap dipertahankan.
   - **Nama Lengkap**: Nama santri sesuai akta kelahiran.
   - **Tempat & Tanggal Lahir**.
   - **Jenis Kelamin**: Laki-laki / Perempuan.
   - **Tahun Masuk**: Tahun santri mulai mondok (contoh: `2026`).
   - **Tahun Ajaran, Kelas, dan Kamar**: Pilih dari dropdown yang tersedia.
   - **Data Orang Tua / Wali**: Nama wali dan nomor telepon/WhatsApp.
4. Klik **Simpan Data Santri**.
5. Sistem secara otomatis membuat akun wali santri dengan username = NIS dan password = NIS.

### B. Mengubah Data Santri
1. Pada tabel santri, cari nama atau NIS santri yang ingin diubah menggunakan kotak pencarian.
2. Klik tombol **Edit** (ikon pensil).
3. Lakukan pembaruan data yang diperlukan, lalu klik **Simpan Perubahan**.

### C. Menghapus Santri (Safe Delete)
1. Klik tombol **Hapus** (ikon tempat sampah) pada baris santri terkait.
2. **Aturan Safe Delete (Migrasi 010)**:
   - Jika santri **memiliki riwayat keuangan** (tagihan, pembayaran, mutasi uang saku) atau setoran tahfidz, sistem akan **menolak penghapusan permanen** demi menjaga integritas pembukuan audit.
   - Santri tersebut hanya dapat dinonaktifkan statusnya menjadi `TIDAK_AKTIF` / `MUTASI` / `ALUMNI`.
   - Hanya santri baru yang belum memiliki transaksi apa pun yang dapat dihapus dari database.

---

## 4. PANDUAN IMPOR MASSAL EXCEL SANTRI

1. Buka menu **Master Santri** $\rightarrow$ klik tombol **Import Santri Excel**.
2. **Unduh Template Resmi**:
   - Klik tautan **Unduh Template Excel Resmi (.xlsx)**.
   - Jangan mengubah judul kolom pada baris pertama template.
3. **Isi Data Santri pada Excel**:
   - Kolom `NIS`: Pastikan diformat sebagai `TEXT` agar angka nol di awal tidak hilang oleh Excel.
   - Kolom `Nama Lengkap`, `Tempat Lahir`, `Tanggal Lahir` (format `YYYY-MM-DD` atau teks tanggal).
   - Kolom `Jenis Kelamin` (`L` atau `P`).
   - Kolom `Nama Kelas` dan `Nama Kamar`: Pastikan nama kelas dan kamar **sudah dibuat terlebih dahulu** di menu Kelas & Kamar SIPETA.
   - Kolom `Nama Wali` dan `No Telepon Wali`.
4. **Unggah dan Pratinjau**:
   - Seret atau pilih file Excel yang sudah diisi.
   - Sistem akan memeriksa validasi data dan menampilkan tabel **Pratinjau Impor**.
   - Jika terdapat NIS duplikat atau kelas tidak ditemukan, sistem akan menandai baris dengan warna merah beserta pesan kesalahannya.
5. **Eksekusi Impor**:
   - Jika seluruh data valid, klik **Proses Impor Santri & Buat Akun Wali**.
   - Sistem akan menginsert santri, membentuk akun auth wali, dan menautkan relasi 1:1.
   - Setelah selesai, sistem menampilkan laporan: jumlah data berhasil dan gagal.

---

## 5. PANDUAN EKSPOR EXCEL SANTRI

1. Buka menu **Master Santri**.
2. Anda dapat memfilter santri berdasarkan Kelas, Kamar, atau Status Aktif jika diperlukan.
3. Klik tombol **Ekspor Data Excel**.
4. Berkas Excel (.xlsx) rapi dengan header resmi Pondok Pesantren Modern Abu Manshur akan terunduh otomatis ke komputer Anda.

---

## 6. PANDUAN REKENING RESMI PESANTREN (MIGRASI 012)

Berdasarkan *Migrasi 012*, Admin Administrasi berwenang mengelola rekening bank resmi BSI pesantren bersama Superadmin:
1. Buka menu **Rekening Pesantren**.
2. Tampilan menunjukkan rekening resmi tunggal Bank Syariah Indonesia (BSI) yang berstatus **Aktif**.
3. **Mengubah Rekening**:
   - Klik **Kelola Rekening**.
   - Masukkan Nomor Rekening BSI dan Atas Nama rekening resmi pesantren.
   - Klik **Simpan Perubahan**.
4. **Peringatan Penting**:
   - Hanya boleh ada **satu rekening aktif** serentak. Rekening ini adalah rekening tujuan transfer bagi seluruh pembayaran SPP dan uang saku oleh wali santri.

---

## 7. PANDUAN PEMBUATAN TAGIHAN / SPP SANTRI

1. Buka menu **Keuangan & Tagihan** $\rightarrow$ **Generator Tagihan**.
2. Pilih jenis pembayaran (contoh: *SPP Bulanan*, *Daftar Ulang*, dll).
3. Pilih Tahun Ajaran, Bulan, dan Tahun Tagihan.
4. Tentukan sasaran santri: Seluruh Santri Aktif, atau per Kelas tertentu.
5. Masukkan nominal tagihan dan tanggal jatuh tempo pembayaran.
6. Tentukan opsi cicilan: centang **Izinkan Pembayaran Dicicil** jika tagihan boleh diangsur.
7. Klik **Terbitkan Tagihan Massal**.
8. Tagihan akan langsung muncul di akun wali santri masing-masing.

---

## 8. PANDUAN PENERBITAN PENGUMUMAN

1. Buka menu **Pengumuman Pesantren** $\rightarrow$ klik **Buat Pengumuman Baru**.
2. Isi **Judul Pengumuman**, **Kategori** (Akademik, Keuangan, Liburan, dll), dan **Isi Pengumuman**.
3. Jika pengumuman sangat mendesak, centang **Tandai sebagai Pengumuman Penting**.
4. Pastikan status **Publikasikan Sekarang** aktif.
5. Klik **Simpan & Publikasikan**.
6. Pengumuman langsung tampil di gerbang publik dan portal wali santri.
