# DOKUMEN REKONSILIASI TRIGGER CLOUD — SIPETA
**Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur**  
**Target:** Supabase Cloud vs Migrasi Lokal `0001`–`0008`  
**Tanggal Evaluasi:** 8 November 2026  
**Status:** RECONCILED & VERIFIED (100% MATCH)

---

## 1. Ringkasan Eksekutif & Resolusi Selisih Jumlah Trigger

Pada audit sebelumnya, terdapat catatan lokal yang menyebutkan angka "17 trigger", sementara pembacaan katalog Supabase Cloud menunjukkan tepat **14 trigger non-internal** pada skema `public`.

### Analisis Akar Masalah:
- **Penyebab Selisih:** Pada PostgreSQL, kueri ke katalog sistem `pg_trigger` tanpa menyaring kolom `tgisinternal = false` akan mengembalikan trigger internal yang dibuat otomatis oleh mesin PostgreSQL untuk menegakkan constraint Foreign Key (bernama seperti `RI_ConstraintTrigger_c_...`).
- **Kenyataan Kode Migrasi:** Di seluruh berkas migrasi `0001` sampai `0008`, hanya terdapat tepat **14 perintah `CREATE TRIGGER`** yang didefinisikan oleh pengembang.
- **Kesimpulan:** Seluruh 14 trigger non-internal yang terdeteksi di Supabase Cloud **100% identik dan sesuai** dengan 14 trigger yang didefinisikan dalam kode sumber migrasi SIPETA. Nol trigger tertinggal atau hilang.

---

## 2. Matriks Rinci 14 Trigger Non-Internal pada Skema Public

Berikut adalah rekonsiliasi lengkap 14 trigger yang aktif di Supabase Cloud:

| No | Nama Trigger | Tabel Sasaran | Event & Timing | Fungsi Eksekusi (Procedure) | Klasifikasi & Fungsi Bisnis |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `trg_profiles_updated_at` | `public.profiles` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 2 | `trg_rekening_pesantren_updated_at` | `public.rekening_pesantren` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 3 | `trg_santri_updated_at` | `public.santri` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 4 | `trg_wali_santri_updated_at` | `public.wali_santri` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 5 | `trg_jenis_pembayaran_updated_at` | `public.jenis_pembayaran` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 6 | `trg_tagihan_updated_at` | `public.tagihan` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 7 | `trg_transaksi_pembayaran_updated_at` | `public.transaksi_pembayaran` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 8 | `trg_pengajuan_uang_saku_updated_at` | `public.pengajuan_uang_saku` | `BEFORE UPDATE` | `public.set_updated_at()` | **Audit Timestamp**: Otomatis memperbarui kolom `updated_at`. |
| 9 | `trg_immutable_mutasi_uang_saku` | `public.mutasi_uang_saku` | `BEFORE UPDATE OR DELETE` | `public.prevent_mutasi_uang_saku_modification()` | **Integritas Finansial**: Mencegah manipulasi/penghapusan baris mutasi ledger saku (*immutable append-only*). |
| 10 | `trg_immutable_audit_logs` | `public.audit_logs` | `BEFORE UPDATE OR DELETE` | `public.prevent_audit_logs_modification()` | **Integritas Audit Trail**: Menjamin catatan log audit sistem tidak dapat diubah atau dihapus oleh siapapun. |
| 11 | `trg_protect_verified_transaksi` | `public.transaksi_pembayaran` | `BEFORE UPDATE OR DELETE` | `public.protect_verified_transaksi_pembayaran()` | **Proteksi Transaksi**: Mengunci transaksi berstatus `BERHASIL` agar tidak dapat diubah atau dihapus pasca-approval. |
| 12 | `trg_after_santri_insert` | `public.santri` | `AFTER INSERT` | `public.handle_after_santri_insert()` | **Siklus Hidup Santri**: Otomatis membuat baris `saldo_uang_saku` awal (0) dan mencatat penempatan awal di `riwayat_penempatan_santri`. |
| 13 | `trg_after_santri_placement_update` | `public.santri` | `AFTER UPDATE` | `public.handle_after_santri_placement_update()` | **Audit Akademik**: Mencatat jejak perpindahan kelas/kamar santri ke `riwayat_penempatan_santri` bila ada perubahan. |
| 14 | `trg_before_kedisiplinan_update` | `public.catatan_kedisiplinan` | `BEFORE UPDATE` | `public.handle_before_kedisiplinan_update()` | **Privasi & Audit Pembinaan**: Otomatis mengarsipkan riwayat perubahan tindak lanjut/pembinaan ke `riwayat_perubahan_kedisiplinan`. |

---

## 3. Evaluasi Kepatuhan Aturan Bisnis Pesantren (Business Rules)

1. **Perlindungan Ledger Uang Saku (Triggers #9 & #12):**  
   Setiap santri baru otomatis memiliki dompet saku dengan saldo Rp 0. Tidak ada pengguna yang dapat melakukan `UPDATE` atau `DELETE` pada mutasi kas keluar-masuk. Koreksi ledger wajib melalui jurnal koreksi terpisah (`rpc_koreksi_ledger_uang_saku`).
2. **Kekebalan Audit Trail (Triggers #10 & #11):**  
   Superadmin sekalipun tidak dapat menghapus jejak audit atau membatalkan transaksi yang sudah disahkan oleh Bendahara.
3. **Immutability Riwayat Disiplin (Trigger #14):**  
   Setiap pembaruan catatan pelanggaran santri otomatis menduplikasi versi lama ke tabel riwayat pembinaan sebelum data baru disimpan.

**Kesimpulan:** Seluruh 14 trigger non-internal yang aktif di Cloud sudah tepat, aman, dan mencakup 100% persyaratan arsitektur database SIPETA.

