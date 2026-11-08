# MATRIKS INTEGRASI FITUR SIPETA (FEATURE INTEGRATION MATRIX)
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur
**Tanggal:** 8 November 2026  
**Status Evaluasi:** **Audit Telusur Komponen UI -> Service Layer -> Database**

---

## 1. Matriks Fitur Ruang Kerja Orang Tua / Wali Santri

| Fitur | Komponen UI | Handler Context | Backend Service / API | Tabel DB / Stored Procedure | Status Integrasi | Validasi Server |
|---|---|---|---|---|---|---|
| **Katalog Tagihan Santri** | `wali-portal.tsx` | `tagihanList` | `keuanganService.getTagihanBySantri` | `public.tagihan` | Siap (Dual-Mode) | Filter RLS `get_my_santri_id()` |
| **Keranjang Cicilan Multi-Tagihan** | `wali-portal.tsx` | `addOrUpdateKeranjang` | `keuanganService.tambahKeKeranjang` | `public.keranjang_pembayaran` | Siap (Dual-Mode) | Zod `validateNominalCicilan` & RLS |
| **Checkout Pembayaran Tagihan** | `wali-portal.tsx` | `submitCheckoutPembayaran` | `keuanganService.checkoutPembayaran` | `public.rpc_checkout_pembayaran` | Siap (Dual-Mode) | Stored Procedure & Row Locking |
| **Upload Bukti Susulan** | `wali-portal.tsx` | `uploadBuktiTransferPembayaran`| `keuanganService.unggahBuktiTransferSusulan`| `public.rpc_unggah_bukti_transfer_pembayaran`| Siap (Dual-Mode) | Validasi Status Transaksi di RPC |
| **Pengajuan Top-Up Uang Saku** | `wali-portal.tsx` | `submitTopupUangSaku` | `keuanganService.submitTopupUangSaku` | `public.pengajuan_uang_saku` | Siap (Dual-Mode) | Zod `pengajuanTopupSakuSchema` & RLS |
| **Pemantauan Saldo & Mutasi Saku** | `wali-portal.tsx` | `getSaldoSantri`, `mutasiUangSakuList` | `keuanganService.getMutasiUangSaku` | `public.saldo_uang_saku`, `public.mutasi_uang_saku` | Siap (Dual-Mode) | RLS `get_my_santri_id()` |
| **Monitoring Mengaji & Tahfidz** | `wali-portal.tsx` | `mengajiList`, `tahfidzList` | `kepesantrenanService.getPerkembanganMengaji` | `public.perkembangan_mengaji`, `public.setoran_tahfidz` | Siap (Dual-Mode) | Filter RLS Wali Santri |
| **Monitoring Prestasi & Disiplin** | `wali-portal.tsx` | `prestasiList`, `kedisiplinanList` | `kepesantrenanService.getCatatanKedisiplinan` | `public.prestasi_santri`, `public.catatan_kedisiplinan` | Siap (Dual-Mode) | RLS `is_published_to_wali = true` |
| **Notifikasi Internal** | `wali-portal.tsx` | `markNotifikasiRead` | `notifikasiService.markAsRead` | `public.notifikasi` | Siap (Dual-Mode) | RLS `user_id = auth.uid()` |

---

## 2. Matriks Fitur Ruang Kerja Bendahara Pesantren

| Fitur | Komponen UI | Handler Context | Backend Service / API | Tabel DB / Stored Procedure | Status Integrasi | Validasi Server |
|---|---|---|---|---|---|---|
| **Verifikasi Transaksi Pembayaran** | `bendahara-portal.tsx` | `verifyTransaksiPembayaran` | `keuanganService.verifikasiPembayaran` | `public.rpc_verifikasi_pembayaran` | Siap (Dual-Mode) | Eksklusif Role Bendahara & Row Lock `FOR UPDATE` |
| **Verifikasi Top-Up Uang Saku** | `bendahara-portal.tsx` | `verifyTopupUangSaku` | `keuanganService.verifikasiTopupUangSaku` | `public.rpc_verifikasi_topup_uang_saku` | Siap (Dual-Mode) | Eksklusif Role Bendahara & Mutasi Kredit Otomatis |
| **Penyerahan Uang Saku Fisik** | `bendahara-portal.tsx` | `recordPenyerahanUangSaku` | `keuanganService.catatPenyerahanUangSaku` | `public.rpc_catat_penyerahan_uang_saku` | Siap (Dual-Mode) | **Foto Wajib**, Validasi Saldo Cukup (Anti Minus) |
| **Jurnal Koreksi Ledger Saku** | `bendahara-portal.tsx` | `recordKoreksiLedgerSaku` | `keuanganService.koreksiLedgerUangSaku` | `public.rpc_koreksi_ledger_uang_saku` | Siap (Dual-Mode) | Trigger Immutability & Audit Trail Permanen |
| **Arsip Ledger & Audit Keuangan** | `bendahara-portal.tsx` | `transaksiPembayaranList` | `keuanganService.getRiwayatTransaksi` | `public.transaksi_pembayaran`, `public.mutasi_uang_saku` | Siap (Dual-Mode) | RLS Bendahara & Proteksi Perubahan Data |

---

## 3. Matriks Fitur Ruang Kerja Administrator

| Fitur | Komponen UI | Handler Context | Backend Service / API | Tabel DB / Stored Procedure | Status Integrasi | Validasi Server |
|---|---|---|---|---|---|---|
| **Pendaftaran Santri & Akun Wali**| `admin-portal.tsx` | `createSantriWithWali` | `administrasiService.createSantriWithWali` | `public.santri`, `public.wali_santri`, `public.profiles` | Siap (Dual-Mode) | Constraint `UNIQUE(nis)` & `UNIQUE(santri_id)` |
| **Pemindahan Kelas & Kamar** | `admin-portal.tsx` | `moveSantriPlacement` | `administrasiService.moveSantriPlacement` | `public.riwayat_penempatan_santri` | Siap (Dual-Mode) | Database Trigger & Log Riwayat |
| **Pembaruan Status Santri** | `admin-portal.tsx` | `updateStatusSantri` | `administrasiService.updateStatusSantri` | `public.santri(status)` | Siap (Dual-Mode) | Enum `status_santri` Check |
| **Pembuatan Master Kelas & Kamar** | `admin-portal.tsx` | `createKelas`, `createKamar` | `administrasiService.createKelas` | `public.kelas`, `public.kamar` | Siap (Dual-Mode) | Unik Kode & Batas Kapasitas |
| **Generator Tagihan Massal** | `admin-portal.tsx` | `generateTagihan` | `administrasiService.generateTagihan` | `public.tagihan` | Siap (Dual-Mode) | Constraint Unik `(santri_id, jenis_id, periode)` |
| **Penyesuaian / Diskon Tagihan** | `admin-portal.tsx` | `adjustTagihan` | `keuanganService.penyesuaianTagihan` | `public.rpc_penyesuaian_tagihan` | Siap (Dual-Mode) | Stored Procedure & Alasan Administratif Wajib |
| **Publikasi Pengumuman** | `admin-portal.tsx` | `createPengumuman` | `administrasiService.createPengumuman` | `public.pengumuman` | Siap (Dual-Mode) | RLS Admin/Superadmin Insert |

---

## 4. Matriks Fitur Ruang Kerja Pengelola Kepesantrenan

| Fitur | Komponen UI | Handler Context | Backend Service / API | Tabel DB / Stored Procedure | Status Integrasi | Validasi Server |
|---|---|---|---|---|---|---|
| **Pencatatan Perkembangan Mengaji**| `pengelola-portal.tsx` | `recordPerkembanganMengaji` | `kepesantrenanService.catatPerkembanganMengaji`| `public.perkembangan_mengaji` | Siap (Dual-Mode) | RLS Pengelola & Pengujian Tajwid/Makhraj |
| **Setoran Tahfidz & Target** | `pengelola-portal.tsx` | `recordSetoranTahfidz` | `kepesantrenanService.catatSetoranTahfidz` | `public.setoran_tahfidz`, `public.target_tahfidz` | Siap (Dual-Mode) | Generated Column `jumlah_ayat` & Juz (1-30) |
| **Dokumentasi Prestasi Santri** | `pengelola-portal.tsx` | `recordPrestasiSantri` | `kepesantrenanService.catatPrestasiSantri` | `public.prestasi_santri` | Siap (Dual-Mode) | Enum Tingkat Prestasi & RLS Pengelola |
| **Pencatatan Pelanggaran Disiplin** | `pengelola-portal.tsx` | `recordCatatanKedisiplinan` | `kepesantrenanService.catatKedisiplinan` | `public.catatan_kedisiplinan` | Siap (Dual-Mode) | Poin Pembinaan Master Pelanggaran |
| **Pembaruan Tindak Lanjut Disiplin**| `pengelola-portal.tsx` | `updateTindakLanjutKedisiplinan`| `kepesantrenanService.updateTindakLanjutKedisiplinan`| `public.riwayat_perubahan_kedisiplinan` | Siap (Dual-Mode) | Database Trigger Auto-Archive Riwayat Lama |
| **Akses Data Keuangan** | N/A (Ditiadakan) | Dibatasi UI | Dibatasi Service Layer | `public.transaksi_pembayaran` dll. | **TERBLOKIR TOTAL** | RLS Menolak Seluruh Operasi Finansial (0 baris) |

---

## 5. Matriks Fitur Ruang Kerja Superadmin

| Fitur | Komponen UI | Handler Context | Backend Service / API | Tabel DB / Stored Procedure | Status Integrasi | Validasi Server |
|---|---|---|---|---|---|---|
| **Provisioning Akun Pengguna Baru** | `superadmin-portal.tsx`| `createUserAccount` | `authService.createUserAccount` -> `/api/admin-users` | `auth.users`, `public.profiles` | Siap (Dual-Mode) | Server Endpoint, Verifikasi Superadmin, Service Role Key |
| **Aktivasi & Blokir Akun** | `superadmin-portal.tsx`| `toggleUserActive` | `authService` | `public.profiles(is_active)` | Siap (Dual-Mode) | Auto SignOut & Penolakan Akses RLS |
| **Konfigurasi Rekening Resmi BSI** | `superadmin-portal.tsx`| `updateRekeningResmi` | `administrasiService.updateRekeningResmi`| `public.rekening_pesantren` | Siap (Dual-Mode) | RLS Superadmin Exclusive Update |
| **Pemantauan Audit Log Sistem** | `superadmin-portal.tsx`| `auditLogs` | Direct Query | `public.audit_logs` | Siap (Dual-Mode) | Trigger Immutability (Append-Only) |

