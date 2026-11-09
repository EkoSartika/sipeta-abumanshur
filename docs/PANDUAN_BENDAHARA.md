# PANDUAN OPERASIONAL BENDAHARA PESANTREN
## SIPETA — Pondok Pesantren Modern Abu Manshur (Plered - Cirebon)

---

## 1. PENDAHULUAN & PERAN KERJA

Sebagai **Bendahara Pesantren**, Anda adalah pemegang otoritas tunggal untuk transaksi keuangan operasional:
1. Memverifikasi bukti transfer pembayaran SPP/tagihan dari wali santri.
2. Mencatat pembayaran cicilan tagihan tunai langsung di kantor bendahara.
3. Memverifikasi pengajuan top-up saldo uang saku santri.
4. Menyerahkan uang saku tunai ke santri dengan **wajib mengunggah foto penyerahan fisik**.
5. Mengunduh laporan rekapitulasi kas masuk dan keluar pesantren.
6. Melihat rekening resmi BSI pesantren berstatus aktif (*Read-Only*).

---

## 2. CARA MASUK KE SISTEM (LOGIN)

1. Buka `https://sipeta-abumanshur.vercel.app`.
2. Masukkan **Username** akun bendahara Anda (contoh: `bendahara01`).
3. Masukkan **Kata Sandi** akun Anda.
4. Klik **Masuk ke Sistem**.
5. Anda akan masuk ke **Portal Bendahara Pesantren**.

---

## 3. PANDUAN VERIFIKASI PEMBAYARAN SPP / TAGIHAN

### A. Melihat Antrean Pembayaran Masuk
1. Pada menu navigasi sebelah kiri, klik **Verifikasi Pembayaran**.
2. Tab **Menunggu Verifikasi** menampilkan seluruh transaksi transfer yang telah diunggah oleh wali santri namun belum disahkan.
3. Rincian menampilkan: Nama Santri, NIS, Kelas, Tanggal Transfer, Nominal Pembayaran, dan Alokasi Tagihan.

### B. Memeriksa Bukti Transfer & Mengesahkan
1. Klik tombol **Periksa Bukti** pada transaksi yang dipilih.
2. Sistem akan membuka modal pratinjau bukti transfer yang diunduh secara aman melalui *Private Signed URL*.
3. Periksa kesesuaian:
   - Nominal transfer pada struk vs nominal transaksi di sistem.
   - Rekening tujuan (wajib rekening resmi BSI pesantren).
   - Tanggal dan jam transfer.
4. **Jika Valid**:
   - Klik tombol hijau **Setujui & Sahkan Pembayaran**.
   - Saldo tagihan santri otomatis terpotong. Jika terbayar penuh, status tagihan otomatis menjadi `LUNAS`.
   - Wali santri otomatis menerima notifikasi bahwa pembayaran telah disetujui.
5. **Jika Tidak Valid / Palsu / Struk Buram**:
   - Klik tombol merah **Tolak Pembayaran**.
   - Masukkan **Alasan Penolakan** secara jelas (contoh: *Struk transfer tidak terbaca / Nominal transfer tidak sesuai*).
   - Klik **Kirim Penolakan**. Status tagihan santri tidak berubah dan wali diminta mengunggah ulang.

---

## 4. PANDUAN PENERIMAAN PEMBAYARAN TUNAI DI KANTOR

Jika wali santri datang langsung ke kantor pesantren untuk membayar tunai:
1. Buka menu **Pembayaran Kasir / Tunai**.
2. Cari santri berdasarkan Nama atau NIS.
3. Pilih tagihan yang ingin dibayar. Jika tagihan mendukung cicilan, masukkan nominal yang diserahkan wali secara tunai.
4. Pilih metode pembayaran: **Tunai di Bendahara**.
5. Klik **Simpan Transaksi Kas Masuk**.
6. Transaksi tunai otomatis berstatus `DISETUJUI` tanpa perlu tahap verifikasi tambahan karena diterima langsung oleh bendahara.
7. Anda dapat langsung mencetak kuitansi tanda terima untuk diserahkan kepada wali santri.

---

## 5. PANDUAN PENGELOLAAN UANG SAKU SANTRI

### A. Memverifikasi Top-up Uang Saku
1. Buka menu **Uang Saku Santri** $\rightarrow$ tab **Verifikasi Top-up**.
2. Periksa bukti transfer top-up yang diajukan oleh wali santri.
3. Klik **Setujui Top-up**.
4. Saldo santri pada buku besar otomatis bertambah (`MASUK_TOPUP`) dan wali santri menerima konfirmasi.

### B. Penyerahan Uang Saku Tunai ke Santri (Wajib Foto Fisik)
Saat santri mengambil uang saku di kantor bendahara:
1. Buka menu **Uang Saku Santri** $\rightarrow$ klik **Penyerahan Uang Saku Tunai**.
2. Cari santri berdasarkan Nama atau NIS.
3. Sistem akan menampilkan **Saldo Tersedia** santri saat ini.
4. Masukkan **Nominal Penarikan** (tidak boleh melebihi saldo tersedia).
5. **Ambil / Unggah Foto Fisik Penyerahan**:
   - Ambil foto santri saat menerima uang saku tunai menggunakan kamera ponsel/tablet, atau pilih berkas foto dari komputer.
   - Sistem **menolak penyimpanan** jika foto penyerahan tidak dilampirkan (*Aturan Database PRD Bab 15.5*).
6. Tulis keterangan keperluan (contoh: *Uang jajan mingguan santri*).
7. Klik **Catat Penyerahan Uang Saku**.
8. Saldo santri langsung berkurang, mutasi dicatat secara *immutable* di ledger, dan foto penyerahan dapat langsung dilihat oleh orang tua santri melalui aplikasi mereka.

---

## 6. PANDUAN LAPORAN KEUANGAN & EKSPOR

1. Buka menu **Laporan Keuangan**.
2. Tentukan periode tanggal laporan yang diinginkan.
3. Pilih jenis laporan:
   - Rekapitulasi Pembayaran SPP & Tagihan.
   - Rekapitulasi Mutasi Uang Saku Santri.
   - Daftar Santri dengan Tunggakan Tagihan.
4. Klik **Ekspor ke Excel** untuk mengunduh rekapitulasi pembukuan dalam format spreadsheet resmi.

