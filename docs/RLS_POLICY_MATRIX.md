# MATRIKS KEBIJAKAN ROW LEVEL SECURITY (RLS) SIPETA
**Pondok Pesantren Modern Abu Manshur**  
**Versi Evaluasi**: 2.0.0 (Pasca Remediasi Migration 008)  
**Cakupan**: 27 Tabel Skema `public` + 4 Bucket Penyimpanan `storage.objects`

---

## 1. Ikhtisar Otorisasi 5 Role SIPETA

| Role | Identitas | Wewenang Utama | Pembatasan Khusus |
| :--- | :--- | :--- | :--- |
| **`superadmin`** | Pimpinan Pesantren / IT Yayasan | Akses penuh sistem, manajemen akun, rekening resmi, audit log | Terikat trigger immutability keuangan |
| **`admin`** | Sekretariat & Tata Usaha | Master data santri, wali, kelas, kamar, penempatan, jenis pembayaran, tagihan, pengumuman | **TIDAK BISA** verifikasi pembayaran/uang saku |
| **`bendahara`** | Keuangan Pesantren | Akses data pembayaran, verifikasi transaksi pembayaran, verifikasi top-up uang saku, pencatatan penyerahan uang saku, koreksi ledger | **TIDAK BISA** ubah struktur master kelas/santri |
| **`pengelola`** | Pengasuhan & Asatidz | Pencatatan mengaji, setoran tahfidz, target tahfidz, kategori pelanggaran, prestasi, catatan kedisiplinan & pembinaan | **TIDAK MEMILIKI AKSES** ke data keuangan & uang saku |
| **`wali`** | Orang Tua / Wali Santri | Dashboard santri, keranjang cicilan, riwayat pembayaran, pengajuan top-up uang saku, catatan akademik santri miliknya | **HANYA BISA** mengakses data santri yang terhubung 1:1 |

---

## 2. Matriks 27 Tabel Operasional SIPETA (Hardened di Migration 008)

| No | Nama Tabel | Target Role | Operasi | Role yang Berhak | Kondisi Filter (`USING` / `WITH CHECK`) | Status Hardening 008 |
| :---: | :--- | :---: | :---: | :--- | :--- | :--- |
| **1** | `profiles` | `authenticated` | `SELECT`<br/>`ALL` | Mandiri, Internal<br/>Superadmin | `id = auth.uid() OR role IN ('superadmin','admin','bendahara','pengelola')`<br/>`get_my_role() = 'superadmin'` | `TO authenticated` aktif |
| **2** | `rekening_pesantren` | `authenticated` | `SELECT`<br/>`ALL` | Seluruh Akun Aktif<br/>Superadmin | `role IN ('superadmin','admin','bendahara','pengelola','wali') AND is_active = true`<br/>`get_my_role() = 'superadmin'` | `TO authenticated` aktif, anon dicabut total |
| **3** | `tahun_ajaran` | `authenticated` | `SELECT`<br/>`ALL` | Seluruh Akun Aktif<br/>Admin, Superadmin | `role IN ('superadmin','admin','bendahara','pengelola','wali')`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif |
| **4** | `kelas` | `authenticated` | `SELECT`<br/>`ALL` | Seluruh Akun Aktif<br/>Admin, Superadmin | `role IN ('superadmin','admin','bendahara','pengelola','wali')`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif |
| **5** | `kamar` | `authenticated` | `SELECT`<br/>`ALL` | Seluruh Akun Aktif<br/>Admin, Superadmin | `role IN ('superadmin','admin','bendahara','pengelola','wali')`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif |
| **6** | `santri` | `authenticated` | `SELECT`<br/>`ALL` | Petugas, Wali Terhubung<br/>Admin, Superadmin | `role IN (petugas) OR (role = 'wali' AND id = get_my_santri_id())`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif, isolasi lintas santri |
| **7** | `wali_santri` | `authenticated` | `SELECT`<br/>`ALL` | Wali Terkait, Petugas<br/>Admin, Superadmin | `user_id = auth.uid() OR role IN ('superadmin','admin','bendahara')`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif |
| **8** | `riwayat_penempatan_santri`| `authenticated` | `SELECT`<br/>`INSERT` | Petugas, Wali Terhubung<br/>Admin, Superadmin | `role IN (petugas) OR (role = 'wali' AND santri_id = get_my_santri_id())`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif |
| **9** | `jenis_pembayaran` | `authenticated` | `SELECT`<br/>`ALL` | Petugas Keu, Wali<br/>Admin, Superadmin | `role IN ('superadmin', 'admin', 'bendahara', 'wali')`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif, pengelola diblokir |
| **10** | `tagihan` | `authenticated` | `SELECT`<br/>`INSERT`<br/>`UPDATE` | Petugas Keu, Wali<br/>Admin, Superadmin<br/>Admin, Superadmin | `role IN (petugas_keu) OR (role = 'wali' AND santri_id = get_my_santri_id())`<br/>`role IN ('superadmin', 'admin')`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif |
| **11** | `riwayat_penyesuaian_tagihan` | `authenticated` | `SELECT`<br/>`INSERT` | Petugas Keuangan<br/>Admin, Superadmin | `role IN ('superadmin', 'admin', 'bendahara')`<br/>`role IN ('superadmin', 'admin')` | `TO authenticated` aktif |
| **12** | `keranjang_pembayaran`| `authenticated` | `ALL` | Wali Terkait | `wali_user_id = auth.uid() AND santri_id = get_my_santri_id()` | `TO authenticated` aktif, isolasi mutlak |
| **13** | `transaksi_pembayaran`| `authenticated` | `SELECT` | Petugas Keuangan, Wali | `role IN (petugas_keu) OR (role = 'wali' AND santri_id = get_my_santri_id() AND wali_user_id = auth.uid())` | `TO authenticated` aktif, direct write dilarang |
| **14** | `alokasi_pembayaran` | `authenticated` | `SELECT` | Petugas Keuangan, Wali | `EXISTS(transaksi t WHERE t.id = alokasi.transaksi_id AND (petugas OR wali_terkait))` | `TO authenticated` aktif |
| **15** | `saldo_uang_saku` | `authenticated` | `SELECT` | Bendahara, Superadmin, Wali | `role IN ('superadmin', 'bendahara') OR (role = 'wali' AND santri_id = get_my_santri_id())` | `TO authenticated` aktif, admin & pengelola diblokir |
| **16** | `pengajuan_uang_saku`| `authenticated` | `SELECT`<br/>`INSERT` | Bendahara, Superadmin, Wali<br/>Wali Terkait | `role IN ('superadmin', 'bendahara') OR (role = 'wali' AND santri_id = get_my_santri_id())`<br/>`role = 'wali' AND santri_id = get_my_santri_id() AND wali_user_id = auth.uid()` | `TO authenticated` aktif |
| **17** | `mutasi_uang_saku` | `authenticated` | `SELECT` | Bendahara, Superadmin, Wali | `role IN ('superadmin', 'bendahara') OR (role = 'wali' AND santri_id = get_my_santri_id())` | `TO authenticated` aktif, immutable ledger |
| **18** | `target_tahfidz` | `authenticated` | `SELECT`<br/>`ALL` | Seluruh Akun Aktif<br/>Pengelola, Superadmin, Admin | `role IN ('superadmin','admin','bendahara','pengelola','wali')`<br/>`role IN ('superadmin', 'admin', 'pengelola')` | **Temuan 5**: Diselaraskan ke pengelola & admin |
| **19** | `setoran_tahfidz` | `authenticated` | `SELECT`<br/>`ALL` | Asatidz, Wali Terkait<br/>Pengelola, Superadmin | `role IN (asatidz) OR (role = 'wali' AND santri_id = get_my_santri_id())`<br/>`role IN ('superadmin', 'pengelola')` | `TO authenticated` aktif |
| **20** | `perkembangan_mengaji`| `authenticated` | `SELECT`<br/>`ALL` | Asatidz, Wali Terkait<br/>Pengelola, Superadmin | `role IN (asatidz) OR (role = 'wali' AND santri_id = get_my_santri_id())`<br/>`role IN ('superadmin', 'pengelola')` | `TO authenticated` aktif |
| **21** | `prestasi_santri` | `authenticated` | `SELECT`<br/>`ALL` | Asatidz, Wali Terkait<br/>Pengelola, Superadmin | `role IN (asatidz) OR (role = 'wali' AND santri_id = get_my_santri_id())`<br/>`role IN ('superadmin', 'pengelola')` | `TO authenticated` aktif |
| **22** | `master_kategori_pelanggaran` | `authenticated` | `SELECT`<br/>`ALL` | Seluruh Akun Aktif<br/>Pengelola, Superadmin, Admin | `role IN ('superadmin','admin','bendahara','pengelola','wali')`<br/>`role IN ('superadmin', 'admin', 'pengelola')` | **Temuan 5**: Diselaraskan ke pengelola & admin |
| **23** | `catatan_kedisiplinan`| `authenticated` | `SELECT`<br/>`ALL` | Asatidz, Wali (Published only)<br/>Pengelola, Superadmin | `role IN (asatidz) OR (role = 'wali' AND santri_id = get_my_santri_id() AND is_published_to_wali = true)`<br/>`role IN ('superadmin', 'pengelola')` | `TO authenticated` aktif |
| **24** | `riwayat_perubahan_kedisiplinan` | `authenticated` | `SELECT` | Asatidz, Wali (Published only) | `EXISTS(catatan c WHERE c.id = riwayat.catatan_id AND (asatidz OR (wali_terkait AND c.is_published_to_wali = true)))` | **Temuan 1**: Proteksi privasi wali aktif |
| **25** | `pengumuman` | `authenticated`<br/>`anon` | `SELECT`<br/>`SELECT`<br/>`ALL` | Authenticated<br/>Publik (Anon)<br/>Admin, Superadmin | `is_published = true OR role IN ('superadmin', 'admin')`<br/>`is_published = true`<br/>`role IN ('superadmin', 'admin')` | **Temuan 2**: Dedicated anon policy terisolasi |
| **26** | `notifikasi` | `authenticated` | `SELECT`<br/>`UPDATE` | Pemilik Akun<br/>Pemilik Akun | `user_id = auth.uid()`<br/>`user_id = auth.uid()` | `TO authenticated` aktif |
| **27** | `audit_logs` | `authenticated` | `SELECT` | **HANYA Superadmin** | `get_my_role() = 'superadmin'` | `TO authenticated` aktif |

---

## 3. Matriks Kebijakan Storage Private Buckets (`storage.objects`)

| No | Bucket ID | Sifat | Target Role | Kebijakan Aktif | Aturan Akses (`USING` / `WITH CHECK`) | Status Remediasi 008 |
| :---: | :--- | :---: | :---: | :--- | :--- | :--- |
| **1** | `bukti-pembayaran` | **Private** | `authenticated` | Upload, Baca, Update, Delete (4) | Petugas Keuangan ATAU (`wali` AND folder santri sendiri: `split_part(name, '/', 1) = santri_id`) | Isolasi folder santri aktif |
| **2** | `bukti-uang-saku` | **Private** | `authenticated` | Upload, Baca, Update, Delete (4) | Bendahara, Superadmin ATAU (`wali` AND folder santri sendiri: `split_part(name, '/', 1) = santri_id`) | Pengelola diblokir total |
| **3** | `foto-penyerahan-saku`| **Private** | `authenticated` | Baca, Kelola (2) | **Baca**: Superadmin, Bendahara, ATAU Wali folder santri sendiri.<br/>**Kelola**: ALL (`bendahara`, `superadmin`). | **Temuan 3 & 4**: Policy redundan dihapus |
| **4** | `dokumentasi-kepesantrenan`| **Private** | `authenticated` | Upload & Kelola, Baca (2) | **Kelola**: ALL (`pengelola`, `superadmin`, `admin`).<br/>**Baca**: Seluruh akun aktif internal. | Akun aktif terautentikasi |

*Total Storage Policies*: **12 Kebijakan** (bersih, deduplikasi terverifikasi).
