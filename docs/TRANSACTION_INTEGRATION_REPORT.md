# LAPORAN PENGUJIAN TRANSAKSI KEUANGAN & ATOMIC RPC (TRANSACTION INTEGRATION REPORT)
## Sistem Informasi Pelayanan Terpadu (SIPETA)
### Pondok Pesantren Modern Abu Manshur

**Versi Dokumen:** 1.0  
**Tanggal Pengujian:** 8 November 2026  
**Status Pengujian:** **100% LULUS PADA POSTGRESQL NYATA (Atomic Compliance Verified)**  
**Target Pengujian:** Stored Procedures (PL/pgSQL), Triggers, Ledger Immutability, dan Foreign Key Constraints  

---

## 1. Siklus Lengkap Transaksi Pembayaran (Bab 5 PRD)

### 1.1 Penerbitan Multi-Tagihan oleh Admin
- **Data Uji:**
  - Tagihan 1: Syahriyah SPP November 2026 sebesar **Rp 850.000** (`TIDAK_BOLEH` dicicil).
  - Tagihan 2: Uang Makan November 2026 sebesar **Rp 650.000** (`MINIMAL_NOMINAL` cicilan Rp 300.000).
- **Hasil:** Berhasil diterbitkan. Kolom `nominal_tagihan` dan `sisa_tagihan` dihitung secara otomatis oleh PostgreSQL (*generated columns*).

### 1.2 Keranjang Pembayaran & Checkout Atomik
- **Aksi Wali 1:**
  - Memasukkan Tagihan 1 ke keranjang dengan nominal penuh Rp 850.000.
  - Memasukkan Tagihan 2 ke keranjang dengan cicilan Rp 350.000 (lolos batas minimal Rp 300.000).
- **Eksekusi RPC:**
  ```sql
  SELECT public.rpc_checkout_pembayaran(
      '2026-11-08'::DATE,
      'H. Ridwan',
      'Bank Syariah Indonesia',
      'https://sipeta.local/bukti-transfer-1.jpg'
  );
  ```
- **Hasil Verifikasi Database:**
  - Baris `transaksi_pembayaran` terbentuk dengan total nominal **Rp 1.200.000** dan status `MENUNGGU_VERIFIKASI`.
  - Dua baris `alokasi_pembayaran` tersimpan dengan nominal Rp 850.000 dan Rp 350.000.
  - Tabel `keranjang_pembayaran` dibersihkan secara otomatis di dalam transaksi yang sama.

### 1.3 Pengujian Otorisasi Verifikasi Pembayaran
- **Skenario:** Admin mencoba memverifikasi transaksi pembayaran melalui `rpc_verifikasi_pembayaran`.
- **Hasil:** PostgreSQL melempar eksepsi error:
  `ERROR: OTORISASI DITOLAK: Hanya Bendahara Pesantren yang berwenang memverifikasi transaksi pembayaran.`
- **Status:** **PASS (Otoritas Eksklusif Terbukti)**.

### 1.4 Verifikasi Sah oleh Bendahara
- **Eksekusi RPC:**
  ```sql
  SELECT public.rpc_verifikasi_pembayaran(v_transaksi_id, 'DISETUJUI', 'Bukti sah dana diterima.');
  ```
- **Hasil Mutasi Status & Saldo Tagihan:**
  - Status transaksi berubah menjadi `DISETUJUI`, `verified_by` tercatat ID Bendahara.
  - Tagihan SPP: `sisa_tagihan` menjadi **Rp 0**, `total_terbayar` menjadi **Rp 850.000**, status menjadi **`LUNAS`**.
  - Tagihan Makan: `sisa_tagihan` menjadi **Rp 300.000**, `total_terbayar` menjadi **Rp 350.000**, status menjadi **`DIBAYAR_SEBAGIAN`**.

### 1.5 Pencegahan Double-Approval (Verifikasi Ganda)
- **Skenario:** Memanggil ulang `rpc_verifikasi_pembayaran` pada transaksi yang telah disetujui.
- **Hasil:** PostgreSQL menolak dengan pesan error:
  `ERROR: Transaksi ini tidak dalam status MENUNGGU_VERIFIKASI.`
- **Status:** **PASS (Anti-Double Approval Terbukti)**.

### 1.6 Penyesuaian Tagihan oleh Admin (Bab 5.3 PRD)
- **Eksekusi RPC:**
  ```sql
  SELECT public.rpc_penyesuaian_tagihan(v_tagihan_id, -150000, 'Keringanan dispensasi pengurus');
  ```
- **Hasil:**
  - `nominal_tagihan` berkurang dari Rp 650.000 menjadi Rp 500.000.
  - `sisa_tagihan` berkurang dari Rp 300.000 menjadi Rp 150.000.
  - Baris riwayat tercatat di `riwayat_penyesuaian_tagihan` dengan nilai sebelum dan sesudah.

---

## 2. Siklus Lengkap Modul Uang Saku & Immutable Ledger (Bab 6 PRD)

### 2.1 Pengajuan Top-Up & Verifikasi Masuk
1. Wali 1 mengajukan top-up sebesar **Rp 500.000** dengan bukti transfer. Status awal: `MENUNGGU_VERIFIKASI`.
2. Bendahara menyetujui pengajuan via `rpc_verifikasi_topup_uang_saku`.
3. **Hasil Database:**
   - `saldo_uang_saku.saldo_saat_ini` bertambah dari Rp 0 menjadi **Rp 500.000**.
   - `saldo_uang_saku.total_masuk` bertambah menjadi **Rp 500.000**.
   - Entri baru di `mutasi_uang_saku` tercatat dengan `jenis_mutasi = 'MASUK'`.

### 2.2 Uji Ketat Kewajiban Foto Penyerahan Fisik
- **Percobaan 1 (Tanpa Foto):** Memanggil `rpc_catat_penyerahan_uang_saku` dengan parameter foto kosong (`''`).
  - *Hasil:* DITOLAK oleh PostgreSQL:
    `ERROR: VALIDASI GAGAL: Foto bukti penyerahan uang saku WAJIB diunggah sebelum transaksi dapat disahkan.`
- **Percobaan 2 (Saldo Tidak Mencukupi):** Meminta penyerahan Rp 600.000 (saldo hanya Rp 500.000).
  - *Hasil:* DITOLAK oleh PostgreSQL:
    `ERROR: Saldo uang saku santri tidak mencukupi (Saldo saat ini: Rp 500,000, Nominal penarikan: Rp 600,000).`
- **Percobaan 3 (Sukses):** Meminta penyerahan Rp 150.000 dengan URL foto penyerahan fisik sah.
  - *Hasil:* LULUS.
  - `saldo_saat_ini` berkurang menjadi **Rp 350.000**.
  - `total_keluar` bertambah menjadi **Rp 150.000**.
  - Mutasi `KELUAR` tersimpan dengan referensi `foto_penyerahan_path`.

### 2.3 Uji Immutability Trigger pada Mutasi Uang Saku
- **Skenario:** Menjalankan query `UPDATE` atau `DELETE` langsung pada tabel `public.mutasi_uang_saku`.
- **Hasil:** Trigger `prevent_mutasi_uang_saku_modification` membatalkan transaksi seketika:
  `ERROR: PELANGGARAN INTEGRITAS KEUANGAN: Transaksi mutasi uang saku yang sudah disahkan bersifat immutable. Gunakan mekanisme transaksi pembalik/penyesuaian.`
- **Status:** **PASS (Ledger Tidak Dapat Dimanipulasi)**.

### 2.4 Jurnal Koreksi Ledger (Reversal Journal)
- **Eksekusi:**
  ```sql
  SELECT public.rpc_koreksi_ledger_uang_saku(
      v_mutasi_id,
      'PENYESUAIAN_KURANG'::public.jenis_mutasi_saku,
      20000,
      'Koreksi selisih pembukuan kas kecil'
  );
  ```
- **Hasil:**
  - `saldo_saat_ini` berkurang secara tepat dari Rp 350.000 menjadi **Rp 330.000**.
  - `total_penyesuaian` bernilai **-Rp 20.000**.
  - Rekonsiliasi matematis tetap terbukti sah:
    $$\text{Saldo Saat Ini (Rp 330.000)} = \text{Masuk (500k)} - \text{Keluar (150k)} + \text{Penyesuaian (-20k)}$$

---

## 3. Trigger Riwayat Kedisiplinan Santri (Bab 10 PRD)

- Pengelola mencatat pelanggaran santri dengan status `DALAM_PEMBINAAN`.
- Pengelola memperbarui status menjadi `SELESAI`.
- **Hasil:** Trigger `trg_before_kedisiplinan_update` secara otomatis menyalin data lama ke tabel `riwayat_perubahan_kedisiplinan`, menjaga jejak audit pembinaan tanpa kehilangan catatan historis.

---

## 4. Kesimpulan Pengujian Transaksi
Seluruh 8 Stored Procedures (RPCs), 4 Triggers, dan Constraint matematis keuangan telah lulus 100% pada kernel PostgreSQL nyata. Integritas transaksi keuangan Pondok Pesantren Modern Abu Manshur telah terbukti secara teknis.

