# DOKUMENTASI ALUR BISNIS RESMI SIPETA
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur

---

## 1. PENDAHULUAN

Dokumen ini menguraikan 16 alur kerja bisnis (*Business Process Workflows*) end-to-end yang berjalan di lingkungan Pondok Pesantren Modern Abu Manshur. Seluruh proses telah diselaraskan dengan arsitektur database, otorisasi berbasis role, dan validasi transaksi nyata.

---

## 2. PETA 16 ALUR BISNIS UTAMA

```
[1. Pendaftaran Santri Baru] ──────> [2. Pembuatan Akun Wali Otomatis]
                                             │
                                             ▼
[4. Wajib Ganti Password] <────────── [3. Login Pertama Wali (NIS/NIS)]
         │
         ▼
[5. Pembuatan Tagihan/SPP] ────────> [6. Pembayaran & Cicilan Wali]
                                             │
                                             ▼
[8. Verifikasi Bendahara] <────────── [7. Upload Bukti Transfer]
         │
         ▼
[9. Pengajuan Top-up Uang Saku] ───> [10. Penyerahan Uang Saku + Wajib Foto]
                                             │
                                             ▼
[11. Setoran Tahfidz & Mengaji] ────> [12. Catatan Prestasi Santri]
                                             │
                                             ▼
[13. Pembinaan Disiplin Santri] ───> [14. Penerbitan Pengumuman]
                                             │
                                             ▼
[15. Pengiriman Notifikasi] ───────> [16. Pencatatan Audit Log Otomatis]
```

---

## 3. RINCIAN 16 ALUR BISNIS END-TO-END

### Alur 1: Pendaftaran & Pembuatan Data Santri Baru
1. **Aktor**: Admin Administrasi Pesantren.
2. **Proses**:
   - Admin membuka portal Administrasi $\rightarrow$ *Master Santri* $\rightarrow$ *Tambah Santri*.
   - Mengisi NIS (disimpan sebagai format `TEXT` murni), Nama Lengkap, Tempat & Tanggal Lahir, Jenis Kelamin, Alamat, Tahun Masuk, Kelas, dan Kamar.
   - Sistem memvalidasi keunikan NIS terhadap database `public.santri`.
3. **Hasil**: Data santri tersimpan berstatus `AKTIF` dengan ID UUID unik.

---

### Alur 2: Pembuatan Akun Orang Tua/Wali Santri (Relasi 1:1)
1. **Aktor**: Admin Administrasi Pesantren (secara otomatis saat registrasi santri atau impor massal Excel).
2. **Aturan Kebijakan**:
   - **Username**: NIS Santri (identik, termasuk angka 0 di depan).
   - **Password Awal**: NIS Santri.
   - Satu akun wali hanya terhubung ke tepat satu santri (`UNIQUE(user_id)` & `UNIQUE(santri_id)` pada `public.wali_santri`).
3. **Mekanisme Teknis**:
   - Server memanggil Supabase Admin API untuk mendaftarkan akun di `auth.users` dengan email sintetis internal: `${nis}@akun.sipeta.invalid`.
   - Menambahkan profil di `public.profiles` dengan `role = 'wali'` dan flag `must_change_password = true`.
   - Menautkan ID wali dan ID santri ke `public.wali_santri`.
   - Jika salah satu proses gagal, server menjalankan kompensasi atomik menghapus akun Auth yang telah dibuat agar tidak menimbulkan akun yatim.

---

### Alur 3: Login Orang Tua / Wali Santri Berbasis NIS
1. **Aktor**: Orang Tua / Wali Santri.
2. **Proses**:
   - Wali membuka portal publik SIPETA di perangkat mobile/komputer.
   - Memasukkan NIS pada kolom *Username* dan NIS pada kolom *Kata Sandi*.
   - Sistem memetakan username ke email autentikasi tanpa meminta Gmail pribadi.
   - Supabase Auth memverifikasi kecocokan kredensial dan memeriksa status akun `is_active = true`.

---

### Alur 4: Kewajiban Penggantian Password Login Pertama Kali
1. **Aktor**: Orang Tua / Wali Santri & Sistem Keamanan.
2. **Proses**:
   - Sistem mendeteksi `must_change_password = true` pada profil wali.
   - Akses data santri **segera diblokir sementara** oleh middleware/portal, dan layar menampilkan modal *Wajib Ganti Kata Sandi*.
   - Wali memasukkan kata sandi baru (minimal 8 karakter alfanumerik) dan konfirmasi sandi.
   - Sistem memvalidasi bahwa kata sandi baru **tidak boleh sama dengan NIS**.
   - Setelah berhasil disimpan via `/api/auth/change-password`, flag diubah menjadi `false` dan wali dialihkan ke Dashboard Santri Asuhan.

---

### Alur 5: Penerbitan & Pembuatan Tagihan Santri
1. **Aktor**: Admin Administrasi Pesantren.
2. **Proses**:
   - Admin membuka menu *Keuangan & Tagihan* $\rightarrow$ *Buat Tagihan*.
   - Memilih jenis tagihan (SPP Bulanan, Daftar Ulang, Uang Gedung, Kitab, dll), tahun ajaran, bulan, dan nominal standar.
   - Dapat diterbitkan secara massal ke seluruh santri aktif dalam kelas tertentu.
3. **Hasil**: Record tagihan terbentuk di `public.tagihan` berstatus `BELUM_LUNAS` dengan snapshot aturan cicilan.

---

### Alur 6: Pembayaran Tagihan & Pilihan Cicilan oleh Wali
1. **Aktor**: Orang Tua / Wali Santri.
2. **Proses**:
   - Wali melihat daftar tagihan aktif di menu *Tagihan & SPP*.
   - Untuk tagihan yang mendukung cicilan, wali dapat memasukkan nominal angsuran sesuai kemampuan (di atas nominal minimum cicilan).
   - Menambahkan satu atau beberapa tagihan ke *Keranjang Pembayaran*.
   - Sistem menampilkan rincian total dan mengarahkan pembayaran ke rekening resmi tunggal BSI pesantren.

---

### Alur 7: Unggah Bukti Struk Transfer Bank
1. **Aktor**: Orang Tua / Wali Santri.
2. **Proses**:
   - Wali melakukan transfer ke nomor rekening resmi BSI yang tertera.
   - Wali mengunggah foto struk bukti transfer (format JPG, PNG, atau WEBP).
   - Berkas diunggah secara aman ke bucket privat Supabase Storage: `bukti-pembayaran`.
   - Transaksi tersimpan di `public.transaksi_pembayaran` dengan status `MENUNGGU` verifikasi bendahara.

---

### Alur 8: Verifikasi Pembayaran oleh Bendahara Pesantren
1. **Aktor**: Bendahara Pesantren.
2. **Proses**:
   - Bendahara menerima daftar antrean verifikasi pembayaran di portal Bendahara.
   - Bendahara memeriksa foto bukti transfer menggunakan *Signed URL* privat berbatas waktu.
   - **Jika Valid**: Bendahara menekan tombol *Setujui Pembayaran*. Transaksi berubah status menjadi `DISETUJUI`, nominal alokasi otomatis memotong saldo tagihan, dan jika terbayar penuh status tagihan berubah menjadi `LUNAS`.
   - **Jika Tidak Valid**: Bendahara menolak pembayaran dengan menyertakan alasan tertulis yang dapat dibaca oleh wali santri.

---

### Alur 9: Pengajuan Top-up Saldo Uang Saku Santri
1. **Aktor**: Orang Tua / Wali Santri & Bendahara.
2. **Proses**:
   - Wali santri membuka menu *Uang Saku* $\rightarrow$ *Top-up Saldo*.
   - Mengisi nominal transfer dan mengunggah struk transfer bank.
   - Data tersimpan di `public.pengajuan_topup_saku` status `MENUNGGU`.
   - Bendahara memverifikasi mutasi bank dan menyetujui pengajuan.
   - Saldo santri di `public.saldo_uang_saku` bertambah dan tercatat di ledger `public.mutasi_uang_saku` (`MASUK_TOPUP`).

---

### Alur 10: Penyerahan Uang Saku Tunai ke Santri (Wajib Foto Fisik)
1. **Aktor**: Bendahara Pesantren & Santri.
2. **Aturan Bisnis Kritis**:
   - Uang saku tunai hanya dapat diserahkan jika saldo mencukupi.
   - **Wajib mengambil foto penyerahan fisik** santri saat menerima uang saku sebagai bukti otentik anti-manipulasi.
3. **Mekanisme Teknis**:
   - Bendahara mengunggah foto penyerahan ke bucket privat `foto-penyerahan-saku`.
   - Transaksi dicatat ke ledger `public.mutasi_uang_saku` dengan jenis `KELUAR_TUNAI`.
   - Trigger database memvalidasi bahwa `foto_penyerahan_url` tidak boleh kosong untuk mutasi keluar.
   - Saldo santri berkurang otomatis dan wali santri dapat langsung melihat foto penyerahan di ponsel mereka.

---

### Alur 11: Pencatatan Setoran Tahfidz & Mengaji Kitab
1. **Aktor**: Pengelola Kepesantrenan / Asatidz Tahfidz.
2. **Proses**:
   - Memilih santri yang menyetorkan hafalan di portal Pengelola.
   - Menentukan kategori: *Hafalan Baru* atau *Muroja'ah*.
   - Mengisi Juz (1–30), Surat, Ayat Awal s.d. Ayat Akhir.
   - Memberikan penilaian kelancaran, tajwid, dan makhrojul huruf.
3. **Hasil**: Tersimpan di `public.setoran_tahfidz` dan langsung tersinkronisasi ke grafik capaian hafalan wali santri.

---

### Alur 12: Pencatatan Prestasi Santri
1. **Aktor**: Pengelola Kepesantrenan.
2. **Proses**:
   - Menginput prestasi santri (Akademik, Pidato Bahasa Arab/Inggris, Musabaqah Tilawatil Quran, Olahraga/Pramuka).
   - Mengisi judul prestasi, tingkat kejuaraan (Pesantren, Kecamatan, Kabupaten/Kota, Provinsi, Nasional), dan tanggal perolehan.
3. **Hasil**: Tersimpan di `public.prestasi_santri` dan menjadi piagam rekam jejak santri.

---

### Alur 13: Pencatatan Pelanggaran Kedisiplinan & Konseling
1. **Aktor**: Pengelola Kepesantrenan / Musyrif Asrama.
2. **Proses**:
   - Mencatat tindakan indisipliner santri beserta tingkat pelanggaran: *Ringan*, *Sedang*, atau *Berat*.
   - Mengisi bobot poin pelanggaran dan tindakan pembinaan yang diberikan.
   - Menginput riwayat konseling di `public.riwayat_pembinaan_disiplin`.
3. **Hasil**: Wali santri menerima informasi transparan mengenai catatan pembinaan anak asuhan.

---

### Alur 14: Penerbitan Pengumuman Resmi Pesantren
1. **Aktor**: Admin Administrasi Pesantren.
2. **Proses**:
   - Admin menulis pengumuman (Judul, Kategori, Isi Pengumuman, dan Tanda Pengumuman Penting).
   - Menetapkan status `is_published = true`.
3. **Hasil**: Tersimpan di `public.pengumuman` dan tampil pada papan pengumuman portal publik maupun dashboard wali santri.

---

### Alur 15: Notifikasi Terarah Sistem
1. **Aktor**: Sistem SIPETA Otomatis.
2. **Proses**:
   - Setiap terjadi peristiwa penting (verifikasi pembayaran disetujui, penyerahan uang saku tunai, terbit tagihan baru, setoran tahfidz baru), sistem menginsert record ke `public.notifikasi`.
   - Wali santri atau pengguna terkait menerima lonceng notifikasi dan dapat menandai sebagai telah dibaca (`is_read = true`).

---

### Alur 16: Pencatatan Audit Log Otomatis (Append-Only)
1. **Aktor**: Sistem Keamanan SIPETA & PostgreSQL Trigger.
2. **Proses**:
   - Seluruh mutasi akun, pembuatan santri, dan perubahan kritis dicatat ke `public.audit_logs`.
   - Mencakup: `user_id`, `user_role`, `aktivitas`, `jenis_objek`, `objek_id`, snapshot `data_sesudah`, dan `alasan_perubahan`.
   - **Keamanan Ketat**: Password pengguna **tidak pernah dicatat**.
   - **Trigger Immutability**: Menolak mutasi `UPDATE` atau `DELETE` pada tabel audit logs untuk menjamin transparansi data audit pimpinan.

