// ============================================================================
// SIPETA - Final Authorization & Role-Based Access Control (RBAC) Test Suite
// Verifikasi 12 Skenario Otorisasi Kritis & Helper Identity Functions
// ============================================================================

import { describe, expect, it, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

describe("SIPETA Final Authorization & RBAC Test Suite (12 Skenario Kritis)", () => {
  let db: PGlite;

  // 1. Identitas Akun Uji Coba
  const SUPERADMIN_ID = "00000000-0000-0000-0000-000000000001";
  const ADMIN_ID = "00000000-0000-0000-0000-000000000002";
  const BENDAHARA_ID = "00000000-0000-0000-0000-000000000003";
  const PENGELOLA_ID = "00000000-0000-0000-0000-000000000004";
  const WALI_A_ID = "00000000-0000-0000-0000-000000000005";
  const WALI_B_ID = "00000000-0000-0000-0000-000000000006";
  const INACTIVE_USER_ID = "00000000-0000-0000-0000-000000000099";
  const UNREGISTERED_AUTH_ID = "00000000-0000-0000-0000-000000000088";

  // Identitas Santri
  const SANTRI_A_ID = "11111111-1111-1111-1111-111111111111";
  const SANTRI_B_ID = "22222222-2222-2222-2222-222222222222";

  // Identitas Master
  const TAHUN_AJARAN_ID = "20000000-0000-0000-0000-000000000001";
  const KELAS_7A_ID = "30000000-0000-0000-0000-000000000001";
  const KAMAR_AB_ID = "40000000-0000-0000-0000-000000000001";

  // Helper untuk beralih sesi identitas auth.uid() sebagai 'authenticated'
  async function asUser<T>(userId: string | null, callback: () => Promise<T>): Promise<T> {
    const val = userId ? `'${userId}'` : "NULL";
    await db.exec(`
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', ${val}, false);
    `);
    try {
      return await callback();
    } finally {
      await db.exec(`
        RESET ROLE;
        SELECT set_config('request.jwt.claim.sub', NULL, false);
      `);
    }
  }

  // Helper untuk beralih sesi sebagai 'anon'
  async function asAnon<T>(callback: () => Promise<T>): Promise<T> {
    await db.exec(`
      SET ROLE anon;
      SELECT set_config('request.jwt.claim.sub', NULL, false);
    `);
    try {
      return await callback();
    } finally {
      await db.exec(`
        RESET ROLE;
        SELECT set_config('request.jwt.claim.sub', NULL, false);
      `);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Mock Auth & Storage Core
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE
      );

      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.buckets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          public BOOLEAN DEFAULT false,
          file_size_limit BIGINT,
          allowed_mime_types TEXT[],
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          bucket_id TEXT REFERENCES storage.buckets(id),
          name TEXT,
          owner UUID,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      BEGIN
          RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      EXCEPTION WHEN OTHERS THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    // 2. Eksekusi Migrasi 0001 s.d. 008 secara Berurutan
    const migrations = [
      "0001_enums_and_extensions.sql",
      "0002_core_admin_tables.sql",
      "0003_payment_and_billing_tables.sql",
      "0004_pocket_money_ledger_tables.sql",
      "0005_kepesantrenan_and_audit_tables.sql",
      "0006_atomic_rpcs_and_triggers.sql",
      "0007_rls_and_storage_policies.sql",
      "008_security_remediation.sql",
    ];

    for (const mig of migrations) {
      const migPath = path.resolve(__dirname, `../supabase/migrations/${mig}`);
      const sql = fs.readFileSync(migPath, "utf-8");
      await db.exec(sql);
    }

    // 3. Eksekusi Seed Data
    const seedPath = path.resolve(__dirname, `../supabase/seed.sql`);
    await db.exec(fs.readFileSync(seedPath, "utf-8"));

    // 4. Injeksi Pengguna Uji Coba Lengkap (5 Role + 2 Wali + Akun Nonaktif + Akun Terdaftar Tanpa Profil)
    await db.exec(`
      -- Akun auth.users
      INSERT INTO auth.users (id, email) VALUES
          ('${SUPERADMIN_ID}', 'superadmin@sipeta.ac.id'),
          ('${ADMIN_ID}', 'admin@sipeta.ac.id'),
          ('${BENDAHARA_ID}', 'bendahara@sipeta.ac.id'),
          ('${PENGELOLA_ID}', 'pengelola@sipeta.ac.id'),
          ('${WALI_A_ID}', 'wali_a@gmail.com'),
          ('${WALI_B_ID}', 'wali_b@gmail.com'),
          ('${INACTIVE_USER_ID}', 'nonaktif@sipeta.ac.id'),
          ('${UNREGISTERED_AUTH_ID}', 'tanpaprofil@sipeta.ac.id');

      -- Profil Pengguna
      INSERT INTO public.profiles (id, nama_lengkap, email, no_telepon, role, is_active) VALUES
          ('${SUPERADMIN_ID}', 'H. Kyai Ahmad Manshur', 'superadmin@sipeta.ac.id', '081234567890', 'superadmin', true),
          ('${ADMIN_ID}', 'Ustadz Farid Admin', 'admin@sipeta.ac.id', '081234567891', 'admin', true),
          ('${BENDAHARA_ID}', 'Ustadz H. Irfan Bendahara', 'bendahara@sipeta.ac.id', '081234567892', 'bendahara', true),
          ('${PENGELOLA_ID}', 'Ustadz M. Asyhar Pengelola', 'pengelola@sipeta.ac.id', '081234567893', 'pengelola', true),
          ('${WALI_A_ID}', 'Bapak H. Ridwan (Wali Santri A)', 'wali_a@gmail.com', '081234567894', 'wali', true),
          ('${WALI_B_ID}', 'Ibu Hj. Aminah (Wali Santri B)', 'wali_b@gmail.com', '081234567895', 'wali', true),
          ('${INACTIVE_USER_ID}', 'Akun Dinonaktifkan', 'nonaktif@sipeta.ac.id', '081234567899', 'wali', false);
      -- Catatan: UNREGISTERED_AUTH_ID sengaja TIDAK dimasukkan ke public.profiles

      -- Santri A & Santri B
      INSERT INTO public.santri (
          id, nis, nama_lengkap, tempat_lahir, tanggal_lahir, jenis_kelamin,
          alamat, tahun_masuk, tahun_ajaran_id, kelas_id, kamar_id, status
      ) VALUES
          ('${SANTRI_A_ID}', '202607001', 'Muhammad Ilham Pratama', 'Cirebon', '2013-05-10', 'L', 'Jl. Sunan Gunung Jati', 2026, '${TAHUN_AJARAN_ID}', '${KELAS_7A_ID}', '${KAMAR_AB_ID}', 'AKTIF'),
          ('${SANTRI_B_ID}', '202607002', 'Aisyah Azzahra', 'Kuningan', '2013-08-20', 'P', 'Jl. Siliwangi', 2026, '${TAHUN_AJARAN_ID}', '${KELAS_7A_ID}', '${KAMAR_AB_ID}', 'AKTIF');

      -- Hubungkan Akun Wali dengan Santri (Relasi 1:1)
      INSERT INTO public.wali_santri (user_id, santri_id, nama_lengkap, hubungan, no_telepon, email, alamat) VALUES
          ('${WALI_A_ID}', '${SANTRI_A_ID}', 'Bapak H. Ridwan', 'Ayah', '081234567894', 'wali_a@gmail.com', 'Jl. Sunan Gunung Jati No. 12'),
          ('${WALI_B_ID}', '${SANTRI_B_ID}', 'Ibu Hj. Aminah', 'Ibu', '081234567895', 'wali_b@gmail.com', 'Jl. Siliwangi No. 45');

      -- Saldo Awal Uang Saku Santri A & B (update saldo yang dibuat otomatis oleh trigger santri insert)
      UPDATE public.saldo_uang_saku 
      SET saldo_saat_ini = 200000, total_masuk = 200000 
      WHERE santri_id = '${SANTRI_A_ID}';

      UPDATE public.saldo_uang_saku 
      SET saldo_saat_ini = 300000, total_masuk = 300000 
      WHERE santri_id = '${SANTRI_B_ID}';
    `);
  });

  // ==========================================================================
  // BAGIAN 0: VERIFIKASI FUNGSI IDENTITAS HELPER PADA SETIAP ROLE
  // ==========================================================================
  describe("0. Verifikasi Fungsi Helper Identitas get_my_role() & get_my_santri_id()", () => {
    it("Superadmin: role = 'superadmin', santri_id = NULL", async () => {
      await asUser(SUPERADMIN_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBe("superadmin");
        expect((resSantri.rows[0] as any).santri_id).toBeNull();
      });
    });

    it("Admin: role = 'admin', santri_id = NULL", async () => {
      await asUser(ADMIN_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBe("admin");
        expect((resSantri.rows[0] as any).santri_id).toBeNull();
      });
    });

    it("Bendahara: role = 'bendahara', santri_id = NULL", async () => {
      await asUser(BENDAHARA_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBe("bendahara");
        expect((resSantri.rows[0] as any).santri_id).toBeNull();
      });
    });

    it("Pengelola: role = 'pengelola', santri_id = NULL", async () => {
      await asUser(PENGELOLA_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBe("pengelola");
        expect((resSantri.rows[0] as any).santri_id).toBeNull();
      });
    });

    it("Wali A: role = 'wali', santri_id = SANTRI_A_ID", async () => {
      await asUser(WALI_A_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBe("wali");
        expect((resSantri.rows[0] as any).santri_id).toBe(SANTRI_A_ID);
      });
    });

    it("Wali B: role = 'wali', santri_id = SANTRI_B_ID", async () => {
      await asUser(WALI_B_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBe("wali");
        expect((resSantri.rows[0] as any).santri_id).toBe(SANTRI_B_ID);
      });
    });

    it("Akun Nonaktif: get_my_role() mengembalikan NULL (ditolak dari seluruh otorisasi role)", async () => {
      await asUser(INACTIVE_USER_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBeNull();
        expect((resSantri.rows[0] as any).santri_id).toBeNull();
      });
    });

    it("Akun Terdaftar Tanpa Profil: get_my_role() mengembalikan NULL", async () => {
      await asUser(UNREGISTERED_AUTH_ID, async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBeNull();
        expect((resSantri.rows[0] as any).santri_id).toBeNull();
      });
    });

    it("Anonim (Unauthenticated): get_my_role() dan get_my_santri_id() mengembalikan NULL", async () => {
      await asAnon(async () => {
        const resRole = await db.query("SELECT public.get_my_role() AS role;");
        const resSantri = await db.query("SELECT public.get_my_santri_id() AS santri_id;");
        expect((resRole.rows[0] as any).role).toBeNull();
        expect((resSantri.rows[0] as any).santri_id).toBeNull();
      });
    });
  });

  // ==========================================================================
  // SKENARIO 1 & 2: ISOLASI DATA SANTRI & WALI (LINTAS AKUN)
  // ==========================================================================
  describe("Skenario 1 & 2: Isolasi Data Santri dan Wali Lintas Akun", () => {
    it("Skenario 1: Wali A HANYA dapat membaca data santri miliknya (Santri A) dan DIBLOKIR dari Santri B", async () => {
      await asUser(WALI_A_ID, async () => {
        const res = await db.query("SELECT id, nama_lengkap FROM public.santri;");
        expect(res.rows.length).toBe(1);
        expect((res.rows[0] as any).id).toBe(SANTRI_A_ID);
        expect((res.rows[0] as any).nama_lengkap).toBe("Muhammad Ilham Pratama");

        // Query eksplisit Santri B menghasilkan 0 baris
        const resB = await db.query(`SELECT * FROM public.santri WHERE id = '${SANTRI_B_ID}';`);
        expect(resB.rows.length).toBe(0);
      });
    });

    it("Skenario 2: Wali A TIDAK DAPAT membaca profil atau data Wali B", async () => {
      await asUser(WALI_A_ID, async () => {
        const res = await db.query("SELECT user_id, santri_id, hubungan FROM public.wali_santri;");
        expect(res.rows.length).toBe(1);
        expect((res.rows[0] as any).user_id).toBe(WALI_A_ID);

        // Query eksplisit data Wali B menghasilkan 0 baris
        const resB = await db.query(`SELECT * FROM public.wali_santri WHERE user_id = '${WALI_B_ID}';`);
        expect(resB.rows.length).toBe(0);
      });
    });
  });

  // ==========================================================================
  // SKENARIO 3 & 4: KEDISIPLINAN PUBLIK VS NON-PUBLIK & AUDIT TRAIL
  // ==========================================================================
  describe("Skenario 3 & 4: Privasi Catatan & Riwayat Kedisiplinan Wali", () => {
    let unpubCatatanId: string;
    let pubCatatanId: string;

    it("Pengelola membuat 1 catatan kedisiplinan draft (is_published_to_wali = false) dan 1 catatan terbit", async () => {
      await asUser(PENGELOLA_ID, async () => {
        // Catatan 1: DRAFT (non-publik)
        const res1 = await db.query(`
          INSERT INTO public.catatan_kedisiplinan (
              santri_id, tanggal_kejadian, waktu_kejadian, kategori_id,
              deskripsi, tindak_lanjut, catatan_pembinaan, status_tindak_lanjut,
              petugas_id, is_published_to_wali
          ) VALUES (
              '${SANTRI_A_ID}', '2026-11-08', '08:00:00', '50000000-0000-0000-0000-000000000001',
              'Evaluasi internal musyrif', 'Nasihat pembimbing asrama',
              'Tahap konseling awal', 'DALAM_PEMBINAAN', '${PENGELOLA_ID}', false
          ) RETURNING id;
        `);
        unpubCatatanId = (res1.rows[0] as any).id;

        // Picu trigger mutasi riwayat untuk catatan 1
        await db.query(`
          UPDATE public.catatan_kedisiplinan
          SET catatan_pembinaan = 'Konseling lanjutan internal musyrif',
              updated_by = '${PENGELOLA_ID}'
          WHERE id = '${unpubCatatanId}';
        `);

        // Catatan 2: TERBIT (is_published_to_wali = true)
        const res2 = await db.query(`
          INSERT INTO public.catatan_kedisiplinan (
              santri_id, tanggal_kejadian, waktu_kejadian, kategori_id,
              deskripsi, tindak_lanjut, catatan_pembinaan, status_tindak_lanjut,
              petugas_id, is_published_to_wali
          ) VALUES (
              '${SANTRI_A_ID}', '2026-11-08', '10:00:00', '50000000-0000-0000-0000-000000000001',
              'Keterlambatan masuk kelas pagi', 'Tugas membaca Al-Quran',
              'Telah diselesaikan dengan baik', 'SELESAI', '${PENGELOLA_ID}', true
          ) RETURNING id;
        `);
        pubCatatanId = (res2.rows[0] as any).id;

        // Picu trigger mutasi riwayat untuk catatan 2
        await db.query(`
          UPDATE public.catatan_kedisiplinan
          SET catatan_pembinaan = 'Pembinaan tuntas bersama musyrif kelas',
              updated_by = '${PENGELOLA_ID}'
          WHERE id = '${pubCatatanId}';
        `);
      });

      expect(unpubCatatanId).toBeDefined();
      expect(pubCatatanId).toBeDefined();
    });

    it("Skenario 3: Wali TIDAK DAPAT membaca catatan atau riwayat kedisiplinan yang belum dipublikasikan", async () => {
      await asUser(WALI_A_ID, async () => {
        // Catatan induk non-publik
        const resCatatan = await db.query(`
          SELECT * FROM public.catatan_kedisiplinan WHERE id = '${unpubCatatanId}';
        `);
        expect(resCatatan.rows.length).toBe(0); // Ditolak oleh RLS

        // Riwayat perubahan catatan non-publik
        const resRiwayat = await db.query(`
          SELECT * FROM public.riwayat_perubahan_kedisiplinan WHERE catatan_kedisiplinan_id = '${unpubCatatanId}';
        `);
        expect(resRiwayat.rows.length).toBe(0); // Ditolak oleh RLS Migration 008
      });
    });

    it("Skenario 4: Wali DAPAT membaca catatan kedisiplinan yang sudah dipublikasikan untuk santrinya", async () => {
      await asUser(WALI_A_ID, async () => {
        // Catatan induk terpublikasi
        const resCatatan = await db.query(`
          SELECT * FROM public.catatan_kedisiplinan WHERE id = '${pubCatatanId}';
        `);
        expect(resCatatan.rows.length).toBe(1);

        // Riwayat perubahan catatan terpublikasi
        const resRiwayat = await db.query(`
          SELECT * FROM public.riwayat_perubahan_kedisiplinan WHERE catatan_kedisiplinan_id = '${pubCatatanId}';
        `);
        expect(resRiwayat.rows.length).toBe(1);
      });

      // Wali B tetap diblokir dari catatan Santri A
      await asUser(WALI_B_ID, async () => {
        const resCatatan = await db.query(`
          SELECT * FROM public.catatan_kedisiplinan WHERE id = '${pubCatatanId}';
        `);
        expect(resCatatan.rows.length).toBe(0);
      });
    });
  });

  // ==========================================================================
  // SKENARIO 5: AKSES ANONIM (PUBLIK VS DRAFT)
  // ==========================================================================
  describe("Skenario 5: Akses Pengguna Anonim pada Pengumuman", () => {
    it("Superadmin membuat 1 pengumuman terbit dan 1 pengumuman draf", async () => {
      await asUser(SUPERADMIN_ID, async () => {
        await db.query(`
          INSERT INTO public.pengumuman (judul, kategori, isi, is_published, created_by) VALUES
              ('Libur Ramadhan 1448 H', 'Umum', 'Pengumuman resmi libur Ramadhan santri', true, '${SUPERADMIN_ID}'),
              ('Draft Anggaran Rapat Pengurus', 'Keuangan', 'Rahasia internal yayasan', false, '${SUPERADMIN_ID}');
        `);
      });
    });

    it("Skenario 5: Anon HANYA dapat membaca pengumuman terbit dan DIBLOKIR dari membaca draf", async () => {
      await asAnon(async () => {
        // Pengumuman terbit
        const resPub = await db.query("SELECT * FROM public.pengumuman WHERE judul = 'Libur Ramadhan 1448 H';");
        expect(resPub.rows.length).toBe(1);

        // Pengumuman draft internal
        const resDraft = await db.query("SELECT * FROM public.pengumuman WHERE judul = 'Draft Anggaran Rapat Pengurus';");
        expect(resDraft.rows.length).toBe(0); // Ditolak oleh RLS anon
      });
    });
  });

  // ==========================================================================
  // SKENARIO 6 & 7: PEMISAHAN PERAN FINANSIAL (BENDAHARA VS PENGELOLA)
  // ==========================================================================
  describe("Skenario 6 & 7: Wewenang Finansial Bendahara vs Pemblokiran Pengelola", () => {
    let transaksiTopupId: string;

    it("Wali A mengajukan top-up uang saku santri sebesar Rp 50.000", async () => {
      await asUser(WALI_A_ID, async () => {
        const res = await db.query(`
          INSERT INTO public.pengajuan_uang_saku (
              nomor_pengajuan, santri_id, wali_user_id, nominal, rekening_tujuan_snapshot,
              nama_pengirim, bank_pengirim, bukti_transfer_path, status
          ) VALUES (
              'SAKU-2026-0001', '${SANTRI_A_ID}', '${WALI_A_ID}', 50000, '{"bank": "BSI", "nomor": "123456"}'::jsonb,
              'H. Ridwan', 'BSI', '${SANTRI_A_ID}/bukti-topup.jpg', 'MENUNGGU_VERIFIKASI'
          ) RETURNING id;
        `);
        transaksiTopupId = (res.rows[0] as any).id;
      });
      expect(transaksiTopupId).toBeDefined();
    });

    it("Skenario 6: Bendahara DAPAT mengakses fungsi keuangan dan memverifikasi top-up uang saku", async () => {
      await asUser(BENDAHARA_ID, async () => {
        // Membaca antrean pengajuan
        const resRead = await db.query(`SELECT * FROM public.pengajuan_uang_saku WHERE id = '${transaksiTopupId}';`);
        expect(resRead.rows.length).toBe(1);

        // Menyetujui pengajuan secara atomik melalui RPC
        await db.query(`
          SELECT public.rpc_verifikasi_topup_uang_saku(
              '${transaksiTopupId}',
              'DISETUJUI'::public.status_transaksi,
              'Top-up valid via BSI'
          );
        `);
      });

      // Saldo santri A bertambah dari 200k menjadi 250k
      const resSaldo = await db.query(`SELECT saldo_saat_ini FROM public.saldo_uang_saku WHERE santri_id = '${SANTRI_A_ID}';`);
      expect(Number((resSaldo.rows[0] as any).saldo_saat_ini)).toBe(250000);
    });

    it("Skenario 7: Pengelola DIBLOKIR TOTAL dari membaca atau mengubah transaksi keuangan", async () => {
      await asUser(PENGELOLA_ID, async () => {
        // 1. Membaca pengajuan uang saku -> Ditolak RLS (0 baris)
        const resPengajuan = await db.query("SELECT * FROM public.pengajuan_uang_saku;");
        expect(resPengajuan.rows.length).toBe(0);

        // 2. Membaca saldo uang saku -> Ditolak RLS (0 baris)
        const resSaldo = await db.query("SELECT * FROM public.saldo_uang_saku;");
        expect(resSaldo.rows.length).toBe(0);

        // 3. Membaca mutasi uang saku -> Ditolak RLS (0 baris)
        const resMutasi = await db.query("SELECT * FROM public.mutasi_uang_saku;");
        expect(resMutasi.rows.length).toBe(0);

        // 4. Membaca transaksi tagihan pembayaran -> Ditolak RLS (0 baris)
        const resTransaksi = await db.query("SELECT * FROM public.transaksi_pembayaran;");
        expect(resTransaksi.rows.length).toBe(0);

        // 5. Mencoba mengubah status pengajuan secara direct -> Ditolak RLS (0 row updated)
        const resUpdate = await db.query(`
          UPDATE public.pengajuan_uang_saku SET status = 'DITOLAK' WHERE id = '${transaksiTopupId}';
        `);
        expect(resUpdate.rowCount).toBe(0);
      });
    });
  });

  // ==========================================================================
  // SKENARIO 8: WALI TIDAK DAPAT UBAH SALDO ATAU MUTASI SECARA LANGSUNG
  // ==========================================================================
  describe("Skenario 8: Perlindungan Immutability Saldo & Ledger dari Akses Langsung Wali", () => {
    it("Skenario 8: Percobaan UPDATE saldo_uang_saku secara direct oleh Wali DITOLAK RLS", async () => {
      await asUser(WALI_A_ID, async () => {
        const updateRes = await db.query(`
          UPDATE public.saldo_uang_saku
          SET saldo_saat_ini = 9999999
          WHERE santri_id = '${SANTRI_A_ID}';
        `);
        // RLS pada saldo_uang_saku hanya SELECT, tidak ada policy UPDATE untuk wali
        expect(updateRes.rowCount).toBe(0);
      });

      // Verifikasi saldo asli tetap aman
      const resCheck = await db.query(`SELECT saldo_saat_ini FROM public.saldo_uang_saku WHERE santri_id = '${SANTRI_A_ID}';`);
      expect(Number((resCheck.rows[0] as any).saldo_saat_ini)).toBe(250000);
    });

    it("Skenario 8: Percobaan INSERT direct ke mutasi_uang_saku oleh Wali DITOLAK RLS / Trigger", async () => {
      await asUser(WALI_A_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            INSERT INTO public.mutasi_uang_saku (
                santri_id, jenis_mutasi, nominal, saldo_sebelum, saldo_setelah, deskripsi
            ) VALUES (
                '${SANTRI_A_ID}', 'MASUK', 500000, 250000, 750000, 'Ilegal inject saldo'
            );
          `);
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
      });
    });
  });

  // ==========================================================================
  // SKENARIO 9 & 10: PENYERAHAN UANG SAKU & WAJIB BUKTI FOTO
  // ==========================================================================
  describe("Skenario 9 & 10: Penyerahan Uang Saku Tunai & Wajib Foto Fisik", () => {
    it("Skenario 10: Penyerahan uang saku tunai DITOLAK jika tanpa foto bukti fisik", async () => {
      await asUser(BENDAHARA_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            SELECT public.rpc_catat_penyerahan_uang_saku(
                '${SANTRI_A_ID}',
                20000,
                'Uang saku pekanan',
                '' -- Foto kosong
            );
          `);
        } catch (err: any) {
          failed = true;
          expect(err.message).toContain("WAJIB diunggah");
        }
        expect(failed).toBe(true);
      });
    });

    it("Skenario 9: Hanya Bendahara/Superadmin yang dapat mencatat penyerahan uang saku sah", async () => {
      // 1. Wali mencoba mengeksekusi penyerahan uang saku -> DITOLAK
      await asUser(WALI_A_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            SELECT public.rpc_catat_penyerahan_uang_saku(
                '${SANTRI_A_ID}',
                20000,
                'Wali coba cairkan sendiri',
                'storage/foto.jpg'
            );
          `);
        } catch (err: any) {
          failed = true;
          expect(err.message).toContain("Hanya Bendahara Pesantren yang berwenang mengesahkan pengeluaran uang saku");
        }
        expect(failed).toBe(true);
      });

      // 2. Admin mencoba mengeksekusi penyerahan uang saku -> DITOLAK
      await asUser(ADMIN_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            SELECT public.rpc_catat_penyerahan_uang_saku(
                '${SANTRI_A_ID}',
                20000,
                'Admin coba cairkan',
                'storage/foto.jpg'
            );
          `);
        } catch (err: any) {
          failed = true;
          expect(err.message).toContain("Hanya Bendahara Pesantren yang berwenang mengesahkan pengeluaran uang saku");
        }
        expect(failed).toBe(true);
      });

      // 3. Bendahara mengeksekusi dengan foto yang sah -> BERHASIL
      await asUser(BENDAHARA_ID, async () => {
        await db.query(`
          SELECT public.rpc_catat_penyerahan_uang_saku(
              '${SANTRI_A_ID}',
              20000,
              'Penyerahan uang saku tunai ke santri',
              '${SANTRI_A_ID}/bukti-penyerahan-1.jpg'
          );
        `);
      });

      // Saldo santri A berkurang dari 250k menjadi 230k
      const resSaldo = await db.query(`SELECT saldo_saat_ini, total_keluar FROM public.saldo_uang_saku WHERE santri_id = '${SANTRI_A_ID}';`);
      expect(Number((resSaldo.rows[0] as any).saldo_saat_ini)).toBe(230000);
      expect(Number((resSaldo.rows[0] as any).total_keluar)).toBe(20000);
    });
  });

  // ==========================================================================
  // SKENARIO 11: AKUN TANPA ROLE AKTIF DITOLAK MENGAKSES DATA INTERNAL
  // ==========================================================================
  describe("Skenario 11: Penolakan Akses Akun Nonaktif & Tanpa Profil", () => {
    it("Akun nonaktif (is_active = false) DITOLAK dari membaca santri, tagihan, dan master data", async () => {
      await asUser(INACTIVE_USER_ID, async () => {
        const resSantri = await db.query("SELECT * FROM public.santri;");
        expect(resSantri.rows.length).toBe(0);

        const resTagihan = await db.query("SELECT * FROM public.tagihan;");
        expect(resTagihan.rows.length).toBe(0);

        const resKelas = await db.query("SELECT * FROM public.kelas;");
        expect(resKelas.rows.length).toBe(0);

        const resRekening = await db.query("SELECT * FROM public.rekening_pesantren;");
        expect(resRekening.rows.length).toBe(0);
      });
    });

    it("Akun terdaftar di auth tapi tanpa profil di public.profiles DITOLAK dari seluruh data operasional", async () => {
      await asUser(UNREGISTERED_AUTH_ID, async () => {
        const resSantri = await db.query("SELECT * FROM public.santri;");
        expect(resSantri.rows.length).toBe(0);

        const resSaku = await db.query("SELECT * FROM public.saldo_uang_saku;");
        expect(resSaku.rows.length).toBe(0);

        const resKegiatan = await db.query("SELECT * FROM public.setoran_tahfidz;");
        expect(resKegiatan.rows.length).toBe(0);
      });
    });
  });

  // ==========================================================================
  // SKENARIO 12: RPC SECURITY DEFINER TIDAK DAPAT DIGUNAKAN UNTUK MEMBOBOL AKSES
  // ==========================================================================
  describe("Skenario 12: Integritas Otorisasi Internal RPC SECURITY DEFINER", () => {
    it("Wali mencoba memanggil rpc_verifikasi_topup_uang_saku DITOLAK EXCEPTION", async () => {
      await asUser(WALI_A_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            SELECT public.rpc_verifikasi_topup_uang_saku(
                '00000000-0000-0000-0000-000000000001',
                'DISETUJUI'::public.status_transaksi,
                'Bypass Wali'
            );
          `);
        } catch (err: any) {
          failed = true;
          expect(err.message).toContain("Hanya Bendahara Pesantren yang berwenang memverifikasi uang saku");
        }
        expect(failed).toBe(true);
      });
    });

    it("Admin mencoba memanggil rpc_verifikasi_pembayaran DITOLAK EXCEPTION", async () => {
      await asUser(ADMIN_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            SELECT public.rpc_verifikasi_pembayaran(
                '00000000-0000-0000-0000-000000000001',
                'DISETUJUI'::public.status_transaksi,
                'Bypass Admin'
            );
          `);
        } catch (err: any) {
          failed = true;
          expect(err.message).toContain("Hanya Bendahara Pesantren yang berwenang memverifikasi transaksi pembayaran");
        }
        expect(failed).toBe(true);
      });
    });

    it("Pengelola mencoba memanggil rpc_penyesuaian_tagihan DITOLAK EXCEPTION", async () => {
      await asUser(PENGELOLA_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            SELECT public.rpc_penyesuaian_tagihan(
                '00000000-0000-0000-0000-000000000001',
                50000,
                'Diskon Pengelola',
                false
            );
          `);
        } catch (err: any) {
          failed = true;
          expect(err.message).toContain("Hanya Admin atau Superadmin");
        }
        expect(failed).toBe(true);
      });
    });
  });
});
