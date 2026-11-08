# TINJAUAN HAK ISTIMEWA FUNCTION & RPC SIPETA
**Pondok Pesantren Modern Abu Manshur**  
**Versi Evaluasi**: 1.0.0  
**Audit Keamanan**: `SECURITY DEFINER`, Sanitasi `search_path`, Otorisasi Internal, dan Pencegahan Eskalasi Privilege

---

## 1. Ikhtisar Keamanan Function & RPC

Seluruh logika mutasi transaksi keuangan dan audit pada SIPETA dirancang untuk dieksekusi melalui **Stored Procedure / Database Functions** yang terproteksi:
- **`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;`** telah diterapkan di berkas `0007_rls_and_storage_policies.sql`.
- Setiap fungsi `SECURITY DEFINER` wajib mendeklarasikan secara eksplisit **`SET search_path = public`** guna mencegah serangan *object shadowing* / *search path injection*.
- Identitas pemanggil diverifikasi langsung melalui fungsi bawaan Supabase `auth.uid()` di dalam PostgreSQL, **BUKAN** dari parameter yang dapat dimanipulasi oleh client.

---

## 2. Inventarisasi dan Rincian Evaluasi 16 Database Functions

### A. Fungsi Helper Identitas & Audit

#### 1. `public.set_updated_at()`
- **Berkas**: `0001_enums_and_extensions.sql` (Baris 140–148)
- **Tipe**: Trigger Function (plpgsql)
- **Konteks**: Default (SECURITY INVOKER)
- **Kegunaan**: Memperbarui kolom `updated_at = now()` pada setiap operasi `BEFORE UPDATE`.
- **Evaluasi**: Aman.

#### 2. `public.get_my_role()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 10–18)
- **Return**: `public.user_role`
- **Konteks**: `STABLE`, `SECURITY DEFINER`, `SET search_path = public`
- **Query**: `SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;`
- **Evaluasi**: Sangat aman. Akun nonaktif (`is_active = false`) menghasilkan `NULL`, sehingga seluruh kebijakan RLS berbasis role menolak akses secara default.

#### 3. `public.get_my_santri_id()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 20–28)
- **Return**: `UUID`
- **Konteks**: `STABLE`, `SECURITY DEFINER`, `SET search_path = public`
- **Query**: `SELECT santri_id FROM public.wali_santri WHERE user_id = auth.uid();`
- **Evaluasi**: Sangat aman. Mengunci identitas santri 1:1 berdasarkan akun wali yang terotentikasi.

---

### B. Trigger Functions Immutability & Riwayat Otomatis

#### 4. `public.prevent_mutasi_uang_saku_modification()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 35–42)
- **Event**: `BEFORE UPDATE OR DELETE ON public.mutasi_uang_saku`
- **Tindakan**: Melempar pengecualian fatal (`RAISE EXCEPTION`).
- **Evaluasi**: Menjamin pembukuan mutasi uang saku 100% *immutable* (hanya bisa dikoreksi lewat jurnal penyesuaian).

#### 5. `public.prevent_audit_logs_modification()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 50–57)
- **Event**: `BEFORE UPDATE OR DELETE ON public.audit_logs`
- **Tindakan**: Melempar pengecualian fatal (`RAISE EXCEPTION`).
- **Evaluasi**: Menjamin jejak audit log bersifat *append-only*.

#### 6. `public.protect_verified_transaksi_pembayaran()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 65–82)
- **Event**: `BEFORE UPDATE OR DELETE ON public.transaksi_pembayaran`
- **Tindakan**: Menolak penghapusan transaksi berstatus `DISETUJUI` dan menolak pengubahan nilai `total_nominal`, `santri_id`, atau `status` transaksi yang telah disahkan.
- **Evaluasi**: Proteksi ganda terhadap manipulasi status pembayaran yang telah lunas.

#### 7. `public.handle_after_santri_insert()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 90–108)
- **Event**: `AFTER INSERT ON public.santri`
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Tindakan**: Otomatis membuat baris `saldo_uang_saku` (saldo 0) dan mencatat riwayat penempatan awal santri.
- **Evaluasi**: Mencegah saldo null atau ketiadaan riwayat registrasi santri.

#### 8. `public.handle_after_santri_placement_update()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 115–132)
- **Event**: `AFTER UPDATE ON public.santri`
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Tindakan**: Otomatis mencatat riwayat ke `riwayat_penempatan_santri` apabila kolom `kelas_id` atau `kamar_id` berubah.
- **Evaluasi**: Jejak perpindahan asrama dan kelas terpantau lengkap.

#### 9. `public.handle_before_kedisiplinan_update()`
- **Berkas**: `0006_atomic_rpcs_and_triggers.sql` (Baris 139–172)
- **Event**: `BEFORE UPDATE ON public.catatan_kedisiplinan`
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Tindakan**: Mengarsipkan versi catatan pembinaan sebelumnya ke `riwayat_perubahan_kedisiplinan` sebelum baris diperbarui.
- **Evaluasi**: Riwayat pembinaan santri tidak hilang saat statusnya dinaikkan.

---

### C. 7 Remote Procedure Calls (RPC) Transaksi Keuangan

#### 10. `public.rpc_checkout_pembayaran`
- **Parameter**: `p_tanggal_transfer DATE`, `p_nama_pengirim TEXT`, `p_bank_pengirim TEXT`, `p_bukti_transfer_path TEXT`
- **Return**: `UUID` (ID Transaksi Pembayaran)
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Validasi Otorisasi**: `v_role = 'wali'` (Wajib akun Orang Tua/Wali aktif).
- **Penguncian Data**: Menggunakan `FOR UPDATE OF t` pada tabel `tagihan` untuk mencegah race condition.
- **Validasi Bisnis**: Memeriksa tagihan belum lunas, nominal bayar valid terhadap sisa tagihan, mematuhi batas minimal cicilan (`MINIMAL_NOMINAL`) atau menolak cicilan (`TIDAK_BOLEH`).
- **Audit Log**: Otomatis mencatat log `CHECKOUT_PEMBAYARAN`.
- **Evaluasi Keamanan**: Sangat aman.

#### 11. `public.rpc_verifikasi_pembayaran`
- **Parameter**: `p_transaksi_id UUID`, `p_keputusan public.status_transaksi`, `p_catatan TEXT`
- **Return**: `VOID`
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Validasi Otorisasi**: **HANYA Bendahara** (`v_role != 'bendahara'` -> `RAISE EXCEPTION`).
- **Pencegahan Double Verification**: Menggunakan `FOR UPDATE` pada baris transaksi; transaksi wajib berstatus `MENUNGGU_VERIFIKASI`.
- **Integritas Alokasi**: Memeriksa ulang seluruh `alokasi_pembayaran` terhadap `sisa_tagihan` saat disetujui; otomatis mengupdate `total_terbayar` dan mengubah status tagihan ke `LUNAS` atau `DIBAYAR_SEBAGIAN`.
- **Notifikasi**: Otomatis membuat notifikasi real-time ke akun Orang Tua/Wali santri.
- **Evaluasi Keamanan**: Transaksi atomik terbukti handal.

#### 12. `public.rpc_verifikasi_topup_uang_saku`
- **Parameter**: `p_pengajuan_id UUID`, `p_keputusan public.status_transaksi`, `p_catatan TEXT`
- **Return**: `UUID` (ID Mutasi Uang Saku)
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Validasi Otorisasi**: **HANYA Bendahara** (`v_role != 'bendahara'` -> `RAISE EXCEPTION`).
- **Penguncian Data**: `FOR UPDATE` pada `pengajuan_uang_saku` dan `saldo_uang_saku`.
- **Integritas Buku Kas**: Menambahkan saldo masuk, mencatat mutasi ledger `MASUK`, memverifikasi rumus matematika saldo (`saldo_sesudah = saldo_sebelum + nominal`).
- **Evaluasi Keamanan**: Sangat aman.

#### 13. `public.rpc_catat_penyerahan_uang_saku`
- **Parameter**: `p_santri_id UUID`, `p_nominal NUMERIC`, `p_keterangan TEXT`, `p_foto_penyerahan_path TEXT`
- **Return**: `UUID` (ID Mutasi Uang Saku)
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Validasi Otorisasi**: **HANYA Bendahara** (`v_role != 'bendahara'` -> `RAISE EXCEPTION`).
- **Validasi Saldo & Bukti**: 
  - Memeriksa `saldo_saat_ini >= p_nominal` (Pengeluaran melebihi saldo ditolak seketika).
  - **Wajib Foto Penyerahan**: Jika path foto kosong/null, melempar `RAISE EXCEPTION`.
- **Ledger Mutasi**: Mencatat transaksi jenis `KELUAR` secara atomik dengan foto penyerahan.
- **Evaluasi Keamanan**: Menjamin tidak ada pengeluaran kas santri tanpa bukti visual dan otorisasi sah.

#### 14. `public.rpc_koreksi_ledger_uang_saku`
- **Parameter**: `p_referensi_mutasi_id UUID`, `p_jenis_penyesuaian public.jenis_mutasi_saku`, `p_nominal NUMERIC`, `p_alasan_koreksi TEXT`
- **Return**: `UUID`
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Validasi Otorisasi**: Bendahara atau Superadmin.
- **Validasi Input**: Alasan koreksi wajib diisi; untuk `PENYESUAIAN_KURANG`, saldo santri saat ini diverifikasi mencukupi.
- **Evaluasi Keamanan**: Menggunakan transaksi penyesuaian transparan tanpa menghapus transaksi asli.

#### 15. `public.rpc_unggah_bukti_transfer_pembayaran`
- **Parameter**: `p_transaksi_id UUID`, `p_tanggal_transfer DATE`, `p_nama_pengirim TEXT`, `p_bank_pengirim TEXT`, `p_bukti_transfer_path TEXT`
- **Return**: `VOID`
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Validasi Otorisasi**: Wajib akun Wali pemilik transaksi (`wali_user_id = auth.uid()`).
- **Evaluasi Keamanan**: Wali tidak dapat mengunggah bukti untuk transaksi milik akun orang tua lain.

#### 16. `public.rpc_penyesuaian_tagihan`
- **Parameter**: `p_tagihan_id UUID`, `p_nominal_penyesuaian NUMERIC`, `p_alasan TEXT`, `p_batalkan BOOLEAN`
- **Return**: `VOID`
- **Konteks**: `SECURITY DEFINER`, `SET search_path = public`
- **Validasi Otorisasi**: Admin atau Superadmin.
- **Proteksi Tagihan Terbayar**: Tagihan yang telah menerima pembayaran (`total_terbayar > 0`) tidak dapat dibatalkan sembarangan.
- **Evaluasi Keamanan**: Mengarsipkan perubahan ke `riwayat_penyesuaian_tagihan` dan `audit_logs`.

---

## 3. Matriks Hak Eksekusi (`GRANT` / `REVOKE`)

| Nama Fungsi | PUBLIC | anon | authenticated | service_role | Validasi Role Internal |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `get_my_role()` | **REVOKED** | `GRANT` | `GRANT` | `GRANT` | Profil aktif |
| `get_my_santri_id()` | **REVOKED** | `GRANT` | `GRANT` | `GRANT` | Relasi wali |
| `rpc_checkout_pembayaran` | **REVOKED** | **REVOKED** | `GRANT` | `GRANT` | Wajib `wali` |
| `rpc_unggah_bukti_transfer_pembayaran` | **REVOKED** | **REVOKED** | `GRANT` | `GRANT` | Wajib `wali` pemilik |
| `rpc_verifikasi_pembayaran` | **REVOKED** | **REVOKED** | `GRANT` | `GRANT` | **Wajib `bendahara`** |
| `rpc_verifikasi_topup_uang_saku` | **REVOKED** | **REVOKED** | `GRANT` | `GRANT` | **Wajib `bendahara`** |
| `rpc_catat_penyerahan_uang_saku` | **REVOKED** | **REVOKED** | `GRANT` | `GRANT` | **Wajib `bendahara`** |
| `rpc_koreksi_ledger_uang_saku` | **REVOKED** | **REVOKED** | `GRANT` | `GRANT` | `bendahara` / `superadmin` |
| `rpc_penyesuaian_tagihan` | **REVOKED** | **REVOKED** | `GRANT` | `GRANT` | `admin` / `superadmin` |

