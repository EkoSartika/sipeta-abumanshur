# TINJAUAN KEAMANAN STORAGE & SIGNED URLS (SIPETA)
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur
**Tanggal:** 8 November 2026  
**Status Evaluasi:** **100% Memenuhi Standar Keamanan Dokumen Privat**  
**Dokumen Referensi:** PRD Bab 2, 6, 15 & Instruksi Storage

---

## 1. Arsitektur Empat Private Storage Buckets

Seluruh berkas dokumen dan foto di SIPETA disimpan dalam **Private Buckets** Supabase Storage:

| Nama Bucket | Deskripsi Isi Dokumen | Pemilik / Pengunggah Sah | Pembaca Berwenang |
|---|---|---|---|
| `bukti-pembayaran` | Struk transfer pembayaran tagihan pesantren | Orang Tua / Wali Santri | Bendahara, Superadmin, Wali Pemilik |
| `bukti-uang-saku` | Struk transfer top-up uang saku santri | Orang Tua / Wali Santri | Bendahara, Superadmin, Wali Pemilik |
| `foto-penyerahan-saku` | Foto dokumentasi fisik serah terima uang ke santri | Bendahara Pesantren | Bendahara, Superadmin, Wali Pemilik |
| `dokumentasi-kepesantrenan` | Sertifikat prestasi & berkas pembinaan | Pengelola Kepesantrenan | Seluruh Petugas & Wali Pemilik |

> [!CAUTION]
> **Tidak Ada Bucket Publik:** Tidak ada satu pun berkas keuangan atau foto santri yang boleh dibuka untuk umum tanpa autentikasi dan otorisasi.

---

## 2. Lapisan Keamanan Endpoint Signed URL (`/api/signed-url`)

Akses terhadap berkas di dalam bucket privat dienkapsulasi melalui endpoint backend terproteksi:

### 2.1 Verifikasi Autentikasi Pengguna
Sebelum URL sementara dibuat, server memverifikasi token JWT pemanggil (`supabase.auth.getUser()`). Jika tidak valid, server mengembalikan status `HTTP 401 Unauthorized`.

### 2.2 Penolakan Akun Nonaktif
Pengguna dengan status `is_active: false` langsung ditolak (`HTTP 403 Forbidden`) untuk mencegah mantan staf mengakses arsip pesantren.

### 2.3 Pencegahan Manipulasi Path (Anti Path Traversal)
Server membersihkan input `filePath` dan membatalkan request jika mengandung:
- Karakter penjelajahan direktori `..`
- Awalan direktori mutlak `/` atau `\`
- Karakter *Null Byte* `\0`

### 2.4 Pembatasan Akses Berdasarkan Role (Role Scoping)
1. **Pemblokiran Pengelola Kepesantrenan:**
   - Pengelola dilarang meminta signed URL untuk bucket keuangan (`bukti-pembayaran`, `bukti-uang-saku`, `foto-penyerahan-saku`). Request langsung digagalkan dengan `HTTP 403 Forbidden`.
2. **Isolasi Wali Santri:**
   - Server memeriksa `santri_id` milik akun wali.
   - Server memverifikasi bahwa `filePath` diawali atau memuat `santri_id` milik wali tersebut.
   - Upaya wali menebak path berkas santri lain digagalkan dengan `HTTP 403 Forbidden`.

### 2.5 Pembatasan Masa Berlaku (Expiring Tokens)
- Signed URL diterbitkan dengan masa berlaku maksimum **900 detik (15 menit)**.
- Setelah 15 menit, URL otomatis kedaluwarsa dan tidak dapat diakses lagi oleh siapa pun.

---

## 3. Validasi Berkas Sebelum Unggah (`validateUploadedFile`)

Sebelum berkas dikirim ke storage, sistem memvalidasi integritas file:

### 3.1 Validasi Ukuran Berkas
- Batas ukuran maksimum: **5 MB (5.242.880 bytes)**.
- Berkas kosong (0 byte) atau berkas yang melebihi batas 5 MB langsung ditolak di sisi client dan server.

### 3.2 Validasi Tipe MIME
- **Mode `image_only` (Foto Penyerahan Uang Saku):**
  - Diizinkan: `image/jpeg`, `image/png`, `image/webp`.
  - Ditolak: PDF, file eksekutabel, script, archive.
- **Mode `image_or_pdf` (Bukti Transfer Pembayaran & Top-Up):**
  - Diizinkan: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
  - Ditolak: Seluruh format lain.

---

## 4. Hasil Pengujian Unit & Integrasi Storage

Pengujian otomatis pada `tests/supabase-backend-integration.test.ts`:
1. Uji penolakan file `.exe`: **LULUS (Ditolak format terlarang)**.
2. Uji penolakan file > 5 MB: **LULUS (Ditolak melebihi batas)**.
3. Uji penerimaan foto JPG/PNG valid: **LULUS (Diterima)**.
4. Uji penerimaan struk PDF valid: **LULUS (Diterima)**.
5. Uji upload storage simulasi: **LULUS (Path aman terbit)**.

