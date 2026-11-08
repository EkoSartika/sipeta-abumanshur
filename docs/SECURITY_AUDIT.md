# LAPORAN AUDIT KEAMANAN SISTEM (SECURITY AUDIT)
## Sistem Informasi Pelayanan Terpadu (SIPETA)
### Pondok Pesantren Modern Abu Manshur

**Versi Dokumen:** 1.0  
**Tanggal Audit:** 8 November 2026  
**Status Evaluasi:** **SECURE & HARDENED**  
**Ruang Lingkup:** Skema Database, RLS Matrix, Storage Security, Otorisasi Transaksi & Proteksi Rahasia  

---

## 1. Ikhtisar Keamanan

Audit keamanan dilakukan terhadap seluruh rancangan arsitektur, migrasi SQL PostgreSQL (0001–0007), implementasi Next.js middleware, dan logika validasi aplikasi SIPETA. Evaluasi ini menjamin bahwa seluruh data santri, wali, dan transaksi keuangan pesantren terlindungi dari risiko kebocoran data, eskalasi hak akses (*privilege escalation*), dan manipulasi transaksi.

---

## 2. Matriks Akses Data Berbasis Role (RBAC Matrix)

| Objek Data | Superadmin | Admin | Bendahara | Pengelola | Wali Santri |
|---|---|---|---|---|---|
| **Master Akun & Role** | Full CRUD | Read-Only | Read-Only | Read-Only | Tidak Ada Akses |
| **Profil Santri & Kelas** | Full CRUD | Full CRUD | Read-Only | Read-Only | Hanya Santri Miliknya (1:1) |
| **Master Tagihan** | Read / Audit | Buat / Edit / Sesuaikan | Read-Only | **DIBLOKIR TOTAL** | Hanya Tagihan Santri Miliknya |
| **Verifikasi Pembayaran** | Read / Audit | **DIBLOKIR** | **Eksklusif Approve/Reject** | **DIBLOKIR TOTAL** | Ajukan Checkout & Upload Bukti |
| **Ledger Uang Saku** | Read / Audit | **DIBLOKIR** | **Eksklusif Disetujui & Catat Keluar** | **DIBLOKIR TOTAL** | Ajukan Top-Up & Lihat Saldo |
| **Modul Kepesantrenan** | Read / Audit | Read-Only | Read-Only | **Input Mengaji/Tahfidz/Kedisiplinan** | Baca Santri Miliknya (1:1) |
| **Audit Logs** | Baca Seluruh Log | **DIBLOKIR** | Baca Log Finansial | **DIBLOKIR** | **DIBLOKIR** |

---

## 3. Hasil Audit Row Level Security (RLS) PostgreSQL

Semua 22 tabel di database Supabase mengaktifkan RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

### 3.1 Pencegahan Kebocoran Data Lintas Santri (Wali 1:1)
- Setiap query SELECT, INSERT, atau UPDATE pada data santri, tagihan, keranjang, uang saku, dan kepesantrenan diverifikasi menggunakan fungsi keamanan:
  ```sql
  CREATE OR REPLACE FUNCTION public.get_my_santri_id()
  RETURNS UUID ...
  AS $$
      SELECT santri_id FROM public.wali_santri WHERE user_id = auth.uid();
  $$;
  ```
- Kebijakan RLS memastikan wali santri A tidak dapat membaca atau memodifikasi data santri B meskipun memanipulasi ID santri di parameter request.

### 3.2 Pemisahan Tugas Finansial (Segregation of Duties)
- **Superadmin:** Tidak diperkenankan menyetujui transaksi pembayaran operasional harian. Tindakan perbaikan hanya diperbolehkan melalui jurnal penyesuaian yang tercatat di audit log.
- **Admin Administrasi:** Memiliki hak menerbitkan tagihan dan melakukan penyesuaian nominal tagihan sebelum lunas (Bab 5.3 PRD). Admin diblokir dari verifikasi pembayaran dan pengeluaran uang saku.
- **Pengelola Kepesantrenan:** Diblokir secara menyeluruh dari seluruh tabel finansial (`tagihan`, `transaksi_pembayaran`, `alokasi_pembayaran`, `saldo_uang_saku`, `pengajuan_uang_saku`, `mutasi_uang_saku`).
- **Bendahara Pesantren:** Menjadi satu-satunya role operasional yang memiliki kewenangan memverifikasi bukti transfer dan mengesahkan pengeluaran uang saku tunai.

### 3.3 Immutability Ledger Keuangan & Anti-Tampering
- Tabel `mutasi_uang_saku` dilindungi oleh PostgreSQL trigger `prevent_mutasi_uang_saku_modification`:
  ```sql
  CREATE OR REPLACE FUNCTION public.prevent_mutasi_uang_saku_modification()
  RETURNS TRIGGER AS $$
  BEGIN
      RAISE EXCEPTION 'PELANGGARAN INTEGRITAS KEUANGAN: Transaksi mutasi uang saku yang sudah disahkan bersifat immutable. Gunakan mekanisme transaksi pembalik/penyesuaian.';
  END;
  $$;
  ```
- Tidak ada baris mutasi uang saku yang dapat diubah (`UPDATE`) atau dihapus (`DELETE`). Setiap perbaikan pembukuan harus dilakukan melalui mekanisme penyesuaian (`PENYESUAIAN_TAMBAH` atau `PENYESUAIAN_KURANG`) dengan mencatat ID referensi transaksi dan alasan.

---

## 4. Keamanan Storage & Berkas Unggahan

### 4.1 Kebijakan Private Buckets
Seluruh 4 bucket penyimpanan di Supabase diset sebagai `public: false` (Private):
1. `bukti-pembayaran`: Hanya dapat diunggah oleh Wali/Petugas, dibaca oleh Bendahara, Superadmin, dan Wali pemilik transaksi.
2. `bukti-uang-saku`: Hanya dapat diunggah oleh Wali/Bendahara, dibaca oleh Bendahara, Superadmin, dan Wali pemilik transaksi.
3. `foto-penyerahan-saku`: **Wajib diunggah oleh Bendahara**, dibaca oleh Bendahara, Superadmin, dan Wali santri terkait.
4. `dokumentasi-kepesantrenan`: Diunggah oleh Pengelola/Superadmin, dibaca oleh seluruh pengguna terautentikasi.

### 4.2 Validasi File Upload (MIME & File Size Guard)
- Berkas dibatasi maksimum **5 MB**.
- MIME type divalidasi ketat: `image/jpeg`, `image/png`, `image/webp`, dan `application/pdf`.
- Ekstensi berbahaya (`.exe`, `.sh`, `.bat`, `.js`, `.php`, `.svg`) diblokir untuk mencegah ancaman XSS dan remote code execution.
- Unduhan berkas privat menggunakan *Signed URLs* dengan masa berlaku terbatas (60 menit).

---

## 5. Pencegahan Kebocoran Kunci Rahasia (*Secrets Protection*)

- `SUPABASE_SERVICE_ROLE_KEY` disimpan secara eksklusif di server environment (`.env.local` / Vercel Serverless environment variables) dan tidak pernah diimpor atau diinjeksi ke kode client bundle (`NEXT_PUBLIC_`).
- Seluruh interaksi client-side menggunakan `NEXT_PUBLIC_SUPABASE_ANON_KEY` yang aksesnya dibatasi penuh oleh RLS.
- Kredensial dan rekening resmi pesantren diisolasi di tabel `public.rekening_pesantren` dengan hak modifikasi eksklusif oleh Superadmin.

---

## 6. Audit Kesimpulan Keamanan
Sistem memenuhi standar keamanan tinggi untuk aplikasi institusi pendidikan dan pengelolaan keuangan syariah. Tidak ditemukan celah eskalasi hak akses atau kebocoran data santri dalam audit kode dan migrasi database.

