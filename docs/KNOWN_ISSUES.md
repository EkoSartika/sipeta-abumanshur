# DAFTAR CATATAN TEKNIS & ISU TERIDENTIFIKASI (KNOWN ISSUES)
## Sistem Informasi Pelayanan Terpadu (SIPETA)
### Pondok Pesantren Modern Abu Manshur

**Versi Dokumen:** 1.0  
**Tanggal:** 8 November 2026  
**Status Evaluasi:** Terpantau & Memiliki Rencana Mitigasi  

---

## 1. Ikhtisar

Dokumen ini mencatat batasan teknis, kondisi tepi (*edge cases*), dan area perbaikan di masa depan yang telah diidentifikasi selama audit menyeluruh. Seluruh isu yang tercatat di bawah ini tidak menghalangi fungsionalitas inti SIPETA dan telah disediakan penanganan (*fallback/mitigation*) yang aman.

---

## 2. Daftar Catatan & Mitigasi

### 2.1 Mode Offline / Local Storage vs Supabase Remote
- **Deskripsi:** Aplikasi saat ini memiliki store lokal (`src/lib/store/sipeta-context.tsx`) dengan persistensi `localStorage` untuk mendukung demonstrasi dan verifikasi fungsional tanpa ketergantungan jaringan eksternal. Di saat yang sama, lapisan Supabase SSR client telah disiapkan di `src/lib/supabase/`.
- **Dampak:** Perubahan data yang dilakukan saat menguji aplikasi dalam mode demo lokal tidak langsung tersinkronisasi ke server Supabase jika variabel environment Supabase belum dihubungkan.
- **Mitigasi:** Ketika kredensial Supabase (`NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`) telah dipasang di produksi, aplikasi akan otomatis beralih menggunakan Supabase Auth dan PostgreSQL RPCs via adapter database.

### 2.2 Penanganan Berkas PDF Besar pada Pratinjau Modal
- **Deskripsi:** Komponen `MediaPreviewModal` saat ini dioptimalkan untuk berkas citra gambar (JPEG, PNG, WebP) dan menampilkan dokumen PDF dengan tag pratinjau. Pada perangkat mobile tertentu dengan browser berbasis WebKit lama, berkas PDF di atas 4MB mungkin memerlukan unduhan terpisah dan tidak dapat dirender secara inline.
- **Mitigasi:** Telah disediakan tombol fallback "Buka / Unduh Dokumen Asli" di dalam modal pratinjau.

### 2.3 Transient `EPERM` pada Windows File System saat Build
- **Deskripsi:** Pada lingkungan sistem operasi Windows, proses `next build` yang dijalankan di direktori scratch kadang mengalami `EPERM: operation not permitted, mkdir` ketika proses build Next.js membersihkan folder cache `.next`.
- **Mitigasi:** Proyek telah dikonfigurasi agar script build dapat membersihkan folder cache `.next` terlebih dahulu sebelum build dijalankan. Build terbukti berhasil 100% pada eksekusi ulang.

### 2.4 Pembatalan Tagihan yang Sudah Memiliki Transaksi Tertunda
- **Deskripsi:** Jika admin hendak membatalkan tagihan, sistem memeriksa apakah sudah ada pembayaran yang disetujui (`total_terbayar > 0`). Namun, jika ada pembayaran yang masih berstatus `MENUNGGU_VERIFIKASI`, admin disarankan menyelesaikan verifikasi terlebih dahulu sebelum mengubah nominal tagihan.
- **Mitigasi:** RPC `public.rpc_penyesuaian_tagihan` dan validasi Zod mengunci baris tagihan dengan `FOR UPDATE` untuk mencegah *race condition* antara admin yang mengubah tagihan dan bendahara yang memverifikasi pembayaran.

### 2.5 Multi-Wali untuk Santri yang Sama
- **Deskripsi:** Sesuai Bab 2 & 4.2 PRD, keputusan bisnis menetapkan aturan ketat: **Satu akun orang tua/wali hanya terhubung dengan satu santri** (relasi 1:1). Ayah dan Ibu dari santri yang sama berbagi satu akun login wali santri.
- **Mitigasi:** Jika di masa depan pesantren memutuskan mengizinkan akun terpisah untuk Ayah dan Ibu pada santri yang sama, diperlukan migrasi skema tabel `wali_santri` dari relasi `UNIQUE (santri_id)` menjadi relasi many-to-one dengan santri.

---

## 3. Rencana Pengembangan Selanjutnya (Post-Launch Roadmap)
1. Integrasi gateway notifikasi WhatsApp otomatis (misal: Fonnte / Twilio) saat pengajuan pembayaran atau top-up uang saku disetujui oleh Bendahara.
2. Integrasi Payment Gateway (misal: Midtrans / Xendit / BCA Virtual Account) sebagai opsi alternatif selain transfer manual ke rekening pesantren.
3. Ekspor laporan keuangan dan perkembangan santri dalam format PDF siap cetak dengan kop resmi Pondok Pesantren Modern Abu Manshur.

