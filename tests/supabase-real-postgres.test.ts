// ============================================================================
// SIPETA - Real PostgreSQL & Supabase Integration Test Suite
// Menjalankan migrasi 0001 - 0007, seed data, RLS, RPCs, Triggers,
// dan Transaksi Keuangan Nyata pada engine PostgreSQL 16
// ============================================================================

import { describe, expect, it, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

describe("SIPETA Real PostgreSQL / Supabase Integration Test Suite", () => {
  let db: PGlite;

  // UUID Identitas 5 Role SIPETA & 2 Wali Berbeda
  const SUPERADMIN_ID = "00000000-0000-0000-0000-000000000001";
  const ADMIN_ID = "00000000-0000-0000-0000-000000000002";
  const BENDAHARA_ID = "00000000-0000-0000-0000-000000000003";
  const PENGELOLA_ID = "00000000-0000-0000-0000-000000000004";
  const WALI_1_ID = "00000000-0000-0000-0000-000000000005";
  const WALI_2_ID = "00000000-0000-0000-0000-000000000006";
  const INACTIVE_USER_ID = "00000000-0000-0000-0000-000000000099";

  const SANTRI_1_ID = "11111111-1111-1111-1111-111111111111";
  const SANTRI_2_ID = "22222222-2222-2222-2222-222222222222";

  const KELAS_7A_ID = "30000000-0000-0000-0000-000000000001";
  const KAMAR_AB_ID = "40000000-0000-0000-0000-000000000001";
  const TAHUN_AJARAN_ID = "20000000-0000-0000-0000-000000000001";

  // Helper untuk beralih sesi identitas auth.uid() dan peran 'authenticated' pada level transaksi PostgreSQL
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

  // Helper untuk beralih sesi sebagai pengguna anonim (publik / unauthenticated)
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

    // 1. Inisialisasi Environment Emulasi Supabase Auth & Storage Core
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE,
          raw_user_meta_data JSONB,
          created_at TIMESTAMPTZ DEFAULT now()
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

    // 2. Eksekusi Seluruh Migrasi 0001 s.d. 008 secara Berurutan pada PostgreSQL
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

    // 3. Eksekusi Seed Data Master
    const seedPath = path.resolve(__dirname, `../supabase/seed.sql`);
    const seedSql = fs.readFileSync(seedPath, "utf-8");
    await db.exec(seedSql);

    // 4. Injeksi Pengguna & Santri Uji Coba (5 Role + 2 Wali Berbeda)
    await db.exec(`
      -- Akun auth.users
      INSERT INTO auth.users (id, email) VALUES
          ('${SUPERADMIN_ID}', 'superadmin@sipeta.ac.id'),
          ('${ADMIN_ID}', 'admin@sipeta.ac.id'),
          ('${BENDAHARA_ID}', 'bendahara@sipeta.ac.id'),
          ('${PENGELOLA_ID}', 'pengelola@sipeta.ac.id'),
          ('${WALI_1_ID}', 'wali1@gmail.com'),
          ('${WALI_2_ID}', 'wali2@gmail.com'),
          ('${INACTIVE_USER_ID}', 'nonaktif@sipeta.ac.id');

      -- Profil Pengguna
      INSERT INTO public.profiles (id, nama_lengkap, email, no_telepon, role, is_active) VALUES
          ('${SUPERADMIN_ID}', 'H. Kyai Ahmad Manshur', 'superadmin@sipeta.ac.id', '081234567890', 'superadmin', true),
          ('${ADMIN_ID}', 'Ustadz Farid Admin', 'admin@sipeta.ac.id', '081234567891', 'admin', true),
          ('${BENDAHARA_ID}', 'Ustadz H. Irfan Bendahara', 'bendahara@sipeta.ac.id', '081234567892', 'bendahara', true),
          ('${PENGELOLA_ID}', 'Ustadz M. Asyhar Pengelola', 'pengelola@sipeta.ac.id', '081234567893', 'pengelola', true),
          ('${WALI_1_ID}', 'Bapak H. Ridwan (Wali Santri 1)', 'wali1@gmail.com', '081234567894', 'wali', true),
          ('${WALI_2_ID}', 'Ibu Hj. Aminah (Wali Santri 2)', 'wali2@gmail.com', '081234567895', 'wali', true),
          ('${INACTIVE_USER_ID}', 'Pengguna Nonaktif', 'nonaktif@sipeta.ac.id', '081234567899', 'wali', false);

      -- Data Santri 1 & Santri 2
      INSERT INTO public.santri (
          id, nis, nama_lengkap, tempat_lahir, tanggal_lahir, jenis_kelamin,
          alamat, tahun_masuk, tahun_ajaran_id, kelas_id, kamar_id, status
      ) VALUES
          ('${SANTRI_1_ID}', '202607001', 'Muhammad Ilham Pratama', 'Cirebon', '2013-05-10', 'L', 'Jl. Sunan Gunung Jati', 2026, '${TAHUN_AJARAN_ID}', '${KELAS_7A_ID}', '${KAMAR_AB_ID}', 'AKTIF'),
          ('${SANTRI_2_ID}', '202607002', 'Aisyah Azzahra', 'Kuningan', '2013-08-20', 'P', 'Jl. Siliwangi', 2026, '${TAHUN_AJARAN_ID}', '${KELAS_7A_ID}', '${KAMAR_AB_ID}', 'AKTIF');

      -- Hubungkan Akun Wali dengan Santri (Relasi 1:1)
      INSERT INTO public.wali_santri (id, user_id, santri_id, nama_lengkap, hubungan, no_telepon, email, alamat) VALUES
          ('70000000-0000-0000-0000-000000000001', '${WALI_1_ID}', '${SANTRI_1_ID}', 'Bapak H. Ridwan', 'Ayah', '081234567894', 'wali1@gmail.com', 'Cirebon'),
          ('70000000-0000-0000-0000-000000000002', '${WALI_2_ID}', '${SANTRI_2_ID}', 'Ibu Hj. Aminah', 'Ibu', '081234567895', 'wali2@gmail.com', 'Kuningan');

      -- Berikan Hak Akses Standar kepada Role 'authenticated' di PostgreSQL
      GRANT USAGE ON SCHEMA public, storage TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public, storage TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
    `);
  });

  // ==========================================================================
  // PENGUJIAN 1: MIGRASI, STRUKTUR TABEL, & SEED DATA
  // ==========================================================================
  describe("1. Validasi Struktur Database & Seed Data pada PostgreSQL", () => {
    it("memastikan tabel master dan data seed berhasil diisi (C-01: rekening seed kosong sampai disahkan)", async () => {
      // C-01: seed.sql tidak memasukkan rekening placeholder
      const resRekAwal = await db.query("SELECT * FROM public.rekening_pesantren;");
      expect(resRekAwal.rows.length).toBe(0);

      // Superadmin mengonfigurasi rekening resmi tunggal setelah verifikasi
      await asUser(SUPERADMIN_ID, async () => {
        await db.query(`
          INSERT INTO public.rekening_pesantren (
              id, nama_bank, kode_bank, nomor_rekening, atas_nama, catatan_instruksi, is_active, updated_by
          ) VALUES (
              '10000000-0000-0000-0000-000000000001',
              'Bank Syariah Indonesia (BSI)',
              '451',
              '7198823456',
              'Yayasan Pondok Pesantren Modern Abu Manshur',
              'Mohon cantumkan NIS dan Nama Santri pada berita transfer resmi.',
              true,
              '${SUPERADMIN_ID}'
          );
        `);
      });

      const resRek = await db.query("SELECT * FROM public.rekening_pesantren;");
      expect(resRek.rows.length).toBe(1);

      const resJp = await db.query("SELECT * FROM public.jenis_pembayaran;");
      expect(resJp.rows.length).toBe(4);

      const resSantri = await db.query("SELECT * FROM public.santri;");
      expect(resSantri.rows.length).toBe(2);

      const resSaldo = await db.query("SELECT * FROM public.saldo_uang_saku;");
      // Trigger otomatis menginisialisasi saldo_uang_saku untuk setiap santri baru
      expect(resSaldo.rows.length).toBe(2);
      expect(Number((resSaldo.rows[0] as any)?.saldo_saat_ini)).toBe(0);
    });

    it("memastikan 4 private bucket storage terkonfigurasi di PostgreSQL", async () => {
      const res = await db.query("SELECT id, public FROM storage.buckets;");
      const ids = res.rows.map((r: any) => r.id);
      expect(ids).toContain("bukti-pembayaran");
      expect(ids).toContain("bukti-uang-saku");
      expect(ids).toContain("foto-penyerahan-saku");
      expect(ids).toContain("dokumentasi-kepesantrenan");
      // Seluruh bucket diset private (public = false)
      for (const row of res.rows as any[]) {
        expect(row.public).toBe(false);
      }
    });
  });

  // ==========================================================================
  // PENGUJIAN 2: ROW LEVEL SECURITY (RLS) & ISOLASI LINTAS SANTRI (1:1)
  // ==========================================================================
  describe("2. Uji Nyata Row Level Security (RLS) dengan Identitas Role Berbeda", () => {
    it("RLS Santri: Wali 1 HANYA dapat membaca data Santri 1 dan diblokir dari Santri 2", async () => {
      await asUser(WALI_1_ID, async () => {
        const query1 = await db.query(`SELECT id, nama_lengkap FROM public.santri WHERE id = '${SANTRI_1_ID}';`);
        expect(query1.rows.length).toBe(1);
        expect((query1.rows[0] as any).nama_lengkap).toBe("Muhammad Ilham Pratama");

        // Mencoba mengakses Santri 2
        const query2 = await db.query(`SELECT id, nama_lengkap FROM public.santri WHERE id = '${SANTRI_2_ID}';`);
        expect(query2.rows.length).toBe(0); // DIBLOKIR RLS
      });
    });

    it("RLS Santri: Wali 2 HANYA dapat membaca data Santri 2 dan diblokir dari Santri 1", async () => {
      await asUser(WALI_2_ID, async () => {
        const query2 = await db.query(`SELECT id, nama_lengkap FROM public.santri WHERE id = '${SANTRI_2_ID}';`);
        expect(query2.rows.length).toBe(1);
        expect((query2.rows[0] as any).nama_lengkap).toBe("Aisyah Azzahra");

        const query1 = await db.query(`SELECT id, nama_lengkap FROM public.santri WHERE id = '${SANTRI_1_ID}';`);
        expect(query1.rows.length).toBe(0); // DIBLOKIR RLS
      });
    });

    it("RLS Finansial: Pengelola Kepesantrenan DIBLOKIR TOTAL dari membaca transaksi dan saldo uang saku", async () => {
      await asUser(PENGELOLA_ID, async () => {
        const resSaldo = await db.query("SELECT * FROM public.saldo_uang_saku;");
        expect(resSaldo.rows.length).toBe(0); // RLS memblokir Pengelola

        const resTrx = await db.query("SELECT * FROM public.transaksi_pembayaran;");
        expect(resTrx.rows.length).toBe(0); // RLS memblokir Pengelola
      });
    });

    it("RLS Audit Log: HANYA Superadmin yang dapat melihat isi audit log", async () => {
      // Injeksi satu audit log
      await db.exec(`
        INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id)
        VALUES ('${SUPERADMIN_ID}', 'superadmin', 'TEST_LOG', 'sistem', 'sys-01');
      `);

      await asUser(SUPERADMIN_ID, async () => {
        const res = await db.query("SELECT * FROM public.audit_logs;");
        expect(res.rows.length).toBeGreaterThanOrEqual(1);
      });

      await asUser(ADMIN_ID, async () => {
        const res = await db.query("SELECT * FROM public.audit_logs;");
        expect(res.rows.length).toBe(0); // Admin diblokir RLS
      });

      await asUser(WALI_1_ID, async () => {
        const res = await db.query("SELECT * FROM public.audit_logs;");
        expect(res.rows.length).toBe(0); // Wali diblokir RLS
      });
    });
  });

  // ==========================================================================
  // PENGUJIAN 3: ATOMIC RPC PEMBAYARAN, CICILAN, & KONTROL OTORITAS
  // ==========================================================================
  describe("3. Uji Nyata Atomic RPC Transaksi Pembayaran & Cicilan", () => {
    let tagihanSppId: string;
    let tagihanMakanId: string;

    it("Admin menerbitkan tagihan untuk Santri 1", async () => {
      await asUser(ADMIN_ID, async () => {
        const res1 = await db.query(`
          INSERT INTO public.tagihan (
              santri_id, jenis_pembayaran_id, nomor_tagihan, judul_tagihan,
              periode_label, nominal_awal, nominal_penyesuaian,
              kebijakan_cicilan_snapshot, minimal_cicilan_snapshot,
              tanggal_mulai, tanggal_jatuh_tempo, status
          ) VALUES (
              '${SANTRI_1_ID}', '60000000-0000-0000-0000-000000000001', 'INV-SPP-001', 'Syahriyah November 2026',
              'November 2026', 850000, 0,
              'TIDAK_BOLEH', NULL,
              '2026-11-01', '2026-11-15', 'BELUM_BAYAR'
          ) RETURNING id;
        `);
        tagihanSppId = (res1.rows[0] as any).id;

        const res2 = await db.query(`
          INSERT INTO public.tagihan (
              santri_id, jenis_pembayaran_id, nomor_tagihan, judul_tagihan,
              periode_label, nominal_awal, nominal_penyesuaian,
              kebijakan_cicilan_snapshot, minimal_cicilan_snapshot,
              tanggal_mulai, tanggal_jatuh_tempo, status
          ) VALUES (
              '${SANTRI_1_ID}', '60000000-0000-0000-0000-000000000002', 'INV-MKN-001', 'Uang Makan November 2026',
              'November 2026', 650000, 0,
              'MINIMAL_NOMINAL', 300000,
              '2026-11-01', '2026-11-15', 'BELUM_BAYAR'
          ) RETURNING id;
        `);
        tagihanMakanId = (res2.rows[0] as any).id;
      });

      expect(tagihanSppId).toBeDefined();
      expect(tagihanMakanId).toBeDefined();
    });

    it("Wali 1 memasukkan multi-tagihan ke keranjang pembayaran", async () => {
      await asUser(WALI_1_ID, async () => {
        // Tagihan SPP: bayar penuh 850.000 (TIDAK_BOLEH dicicil)
        await db.exec(`
          INSERT INTO public.keranjang_pembayaran (wali_user_id, santri_id, tagihan_id, nominal_bayar)
          VALUES ('${WALI_1_ID}', '${SANTRI_1_ID}', '${tagihanSppId}', 850000);
        `);

        // Tagihan Makan: cicilan sebesar 350.000 (MINIMAL_NOMINAL 300.000)
        await db.exec(`
          INSERT INTO public.keranjang_pembayaran (wali_user_id, santri_id, tagihan_id, nominal_bayar)
          VALUES ('${WALI_1_ID}', '${SANTRI_1_ID}', '${tagihanMakanId}', 350000);
        `);
      });

      const resKeranjang = await db.query(`SELECT * FROM public.keranjang_pembayaran WHERE wali_user_id = '${WALI_1_ID}';`);
      expect(resKeranjang.rows.length).toBe(2);
    });

    let transaksiPembayaranId: string;

    it("Wali 1 mengeksekusi RPC checkout multi-tagihan secara atomik", async () => {
      await asUser(WALI_1_ID, async () => {
        const res = await db.query(`
          SELECT public.rpc_checkout_pembayaran(
              '2026-11-08'::DATE,
              'H. Ridwan',
              'Bank Syariah Indonesia',
              'https://sipeta.local/bukti-transfer-1.jpg'
          ) AS transaksi_id;
        `);
        transaksiPembayaranId = (res.rows[0] as any).transaksi_id;
      });

      expect(transaksiPembayaranId).toBeDefined();

      // Memastikan keranjang otomatis bersih setelah checkout
      const resKeranjang = await db.query(`SELECT * FROM public.keranjang_pembayaran WHERE wali_user_id = '${WALI_1_ID}';`);
      expect(resKeranjang.rows.length).toBe(0);

      // Memastikan alokasi pembayaran multi-tagihan tersimpan benar
      const resTrx = await db.query(`SELECT * FROM public.transaksi_pembayaran WHERE id = '${transaksiPembayaranId}';`);
      expect(Number((resTrx.rows[0] as any).total_nominal)).toBe(1200000); // 850k + 350k
      expect((resTrx.rows[0] as any).status).toBe("MENUNGGU_VERIFIKASI");

      const resAlokasi = await db.query(`SELECT * FROM public.alokasi_pembayaran WHERE transaksi_id = '${transaksiPembayaranId}';`);
      expect(resAlokasi.rows.length).toBe(2);
    });

    it("Otorisasi Finansial: Admin DITOLAK saat mencoba memverifikasi pembayaran", async () => {
      await asUser(ADMIN_ID, async () => {
        await expect(
          db.query(`SELECT public.rpc_verifikasi_pembayaran('${transaksiPembayaranId}', 'DISETUJUI', 'Verifikasi Admin');`)
        ).rejects.toThrow(/OTORISASI DITOLAK/);
      });
    });

    it("Bendahara MENYETUJUI transaksi pembayaran secara atomik", async () => {
      await asUser(BENDAHARA_ID, async () => {
        await db.query(`SELECT public.rpc_verifikasi_pembayaran('${transaksiPembayaranId}', 'DISETUJUI', 'Bukti sah dana diterima.');`);
      });

      // 1. Status transaksi berubah menjadi DISETUJUI
      const resTrx = await db.query(`SELECT status, verified_by FROM public.transaksi_pembayaran WHERE id = '${transaksiPembayaranId}';`);
      expect((resTrx.rows[0] as any).status).toBe("DISETUJUI");
      expect((resTrx.rows[0] as any).verified_by).toBe(BENDAHARA_ID);

      // 2. Tagihan SPP (850k) lunas penuh
      const resSpp = await db.query(`SELECT sisa_tagihan, total_terbayar, status FROM public.tagihan WHERE id = '${tagihanSppId}';`);
      expect(Number((resSpp.rows[0] as any).sisa_tagihan)).toBe(0);
      expect(Number((resSpp.rows[0] as any).total_terbayar)).toBe(850000);
      expect((resSpp.rows[0] as any).status).toBe("LUNAS");

      // 3. Tagihan Makan (650k - 350k) berstatus DIBAYAR_SEBAGIAN dengan sisa 300.000
      const resMkn = await db.query(`SELECT sisa_tagihan, total_terbayar, status FROM public.tagihan WHERE id = '${tagihanMakanId}';`);
      expect(Number((resMkn.rows[0] as any).sisa_tagihan)).toBe(300000);
      expect(Number((resMkn.rows[0] as any).total_terbayar)).toBe(350000);
      expect((resMkn.rows[0] as any).status).toBe("DIBAYAR_SEBAGIAN");
    });

    it("Pencegahan Verifikasi Ganda: Verifikasi ulang transaksi yang sudah disetujui DITOLAK", async () => {
      await asUser(BENDAHARA_ID, async () => {
        await expect(
          db.query(`SELECT public.rpc_verifikasi_pembayaran('${transaksiPembayaranId}', 'DISETUJUI', 'Approval kedua');`)
        ).rejects.toThrow(/tidak dalam status MENUNGGU_VERIFIKASI/);
      });
    });

    it("Penyesuaian Tagihan (Bab 5.3 PRD): Admin menyesuaikan sisa tagihan makan santri", async () => {
      await asUser(ADMIN_ID, async () => {
        // Tagihan makan awal 650k, sudah dibayar 350k. Nominal penyesuaian: -150.000 (keringanan)
        await db.query(`
          SELECT public.rpc_penyesuaian_tagihan(
              '${tagihanMakanId}',
              -150000,
              'Keringanan dispensasi pengurus'
          );
        `);
      });

      const resMkn = await db.query(`SELECT nominal_tagihan, sisa_tagihan, nominal_penyesuaian FROM public.tagihan WHERE id = '${tagihanMakanId}';`);
      expect(Number((resMkn.rows[0] as any).nominal_tagihan)).toBe(500000); // 650k - 150k
      expect(Number((resMkn.rows[0] as any).sisa_tagihan)).toBe(150000); // 500k - 350k

      const resRiwayat = await db.query(`SELECT * FROM public.riwayat_penyesuaian_tagihan WHERE tagihan_id = '${tagihanMakanId}';`);
      expect(resRiwayat.rows.length).toBe(1);
      expect((resRiwayat.rows[0] as any).alasan_penyesuaian).toBe("Keringanan dispensasi pengurus");
    });
  });

  // ==========================================================================
  // PENGUJIAN 4: ATOMIC RPC UANG SAKU, LEDGER IMMUTABILITY, & WAJIB FOTO
  // ==========================================================================
  describe("4. Uji Nyata Atomic RPC Uang Saku, Ledger Immutable, & Wajib Foto", () => {
    let pengajuanSakuId: string;

    it("Wali 1 mengajukan top-up uang saku santri", async () => {
      await asUser(WALI_1_ID, async () => {
        const res = await db.query(`
          INSERT INTO public.pengajuan_uang_saku (
              nomor_pengajuan, santri_id, wali_user_id, nominal,
              rekening_tujuan_snapshot, tanggal_transfer, nama_pengirim,
              bank_pengirim, bukti_transfer_path, keterangan
          ) VALUES (
              'TOPUP-202611-001', '${SANTRI_1_ID}', '${WALI_1_ID}', 500000,
              '{"nama_bank": "BSI", "nomor_rekening": "7198823456", "atas_nama": "Yayasan Abu Manshur"}'::jsonb,
              '2026-11-08', 'H. Ridwan', 'BSI Mobile',
              'https://sipeta.local/bukti-saku-500k.jpg', 'Uang saku bulanan santri'
          ) RETURNING id;
        `);
        pengajuanSakuId = (res.rows[0] as any).id;
      });

      expect(pengajuanSakuId).toBeDefined();

      const resPengajuan = await db.query(`SELECT * FROM public.pengajuan_uang_saku WHERE id = '${pengajuanSakuId}';`);
      expect(Number((resPengajuan.rows[0] as any).nominal)).toBe(500000);
      expect((resPengajuan.rows[0] as any).status).toBe("MENUNGGU_VERIFIKASI");
    });

    it("Bendahara menyetujui top-up: saldo bertambah & mutasi MASUK terbentuk", async () => {
      await asUser(BENDAHARA_ID, async () => {
        await db.query(`SELECT public.rpc_verifikasi_topup_uang_saku('${pengajuanSakuId}', 'DISETUJUI', 'Dana saku masuk');`);
      });

      const resSaldo = await db.query(`SELECT * FROM public.saldo_uang_saku WHERE santri_id = '${SANTRI_1_ID}';`);
      expect(Number((resSaldo.rows[0] as any).saldo_saat_ini)).toBe(500000);
      expect(Number((resSaldo.rows[0] as any).total_masuk)).toBe(500000);
      expect(Number((resSaldo.rows[0] as any).total_keluar)).toBe(0);

      const resMutasi = await db.query(`SELECT * FROM public.mutasi_uang_saku WHERE santri_id = '${SANTRI_1_ID}';`);
      expect(resMutasi.rows.length).toBe(1);
      expect((resMutasi.rows[0] as any).jenis_mutasi).toBe("MASUK");
    });

    it("Penyerahan Uang Saku Tunai DITOLAK jika tanpa foto penyerahan fisik", async () => {
      await asUser(BENDAHARA_ID, async () => {
        await expect(
          db.query(`SELECT public.rpc_catat_penyerahan_uang_saku('${SANTRI_1_ID}', 100000, 'Uang jajan pekanan', '');`)
        ).rejects.toThrow(/Foto bukti penyerahan uang saku WAJIB/);
      });
    });

    it("Penyerahan Uang Saku Tunai DITOLAK jika saldo santri tidak mencukupi", async () => {
      await asUser(BENDAHARA_ID, async () => {
        // Saldo saat ini 500k, minta 600k
        await expect(
          db.query(`SELECT public.rpc_catat_penyerahan_uang_saku('${SANTRI_1_ID}', 600000, 'Tarik lebih', 'https://sipeta.local/foto.jpg');`)
        ).rejects.toThrow(/Saldo uang saku santri tidak mencukupi/);
      });
    });

    it("Penyerahan Uang Saku Tunai LULUS dengan foto sah dan mengurangi saldo", async () => {
      await asUser(BENDAHARA_ID, async () => {
        await db.query(`
          SELECT public.rpc_catat_penyerahan_uang_saku(
              '${SANTRI_1_ID}',
              150000,
              'Penyerahan uang saku pekan ke-2',
              'https://sipeta.local/storage/foto-penyerahan-150k.jpg'
          );
        `);
      });

      const resSaldo = await db.query(`SELECT * FROM public.saldo_uang_saku WHERE santri_id = '${SANTRI_1_ID}';`);
      expect(Number((resSaldo.rows[0] as any).saldo_saat_ini)).toBe(350000); // 500k - 150k
      expect(Number((resSaldo.rows[0] as any).total_keluar)).toBe(150000);
    });

    it("Immutability Ledger: Percobaan UPDATE atau DELETE pada mutasi_uang_saku DITOLAK oleh Trigger", async () => {
      const resMutasi = await db.query(`SELECT id FROM public.mutasi_uang_saku LIMIT 1;`);
      const mutasiId = (resMutasi.rows[0] as any).id;

      await expect(
        db.query(`UPDATE public.mutasi_uang_saku SET nominal = 999999 WHERE id = '${mutasiId}';`)
      ).rejects.toThrow(/PELANGGARAN INTEGRITAS KEUANGAN/);

      await expect(
        db.query(`DELETE FROM public.mutasi_uang_saku WHERE id = '${mutasiId}';`)
      ).rejects.toThrow(/PELANGGARAN INTEGRITAS KEUANGAN/);
    });

    it("Jurnal Koreksi Ledger (Penyesuaian Kurang) dengan referensi transaksi audit", async () => {
      const resMutasi = await db.query(`SELECT id FROM public.mutasi_uang_saku WHERE jenis_mutasi = 'KELUAR' LIMIT 1;`);
      const mutasiKeluarId = (resMutasi.rows[0] as any).id;

      await asUser(BENDAHARA_ID, async () => {
        await db.query(`
          SELECT public.rpc_koreksi_ledger_uang_saku(
              '${mutasiKeluarId}',
              'PENYESUAIAN_KURANG'::public.jenis_mutasi_saku,
              20000,
              'Koreksi selisih pembukuan kas kecil'
          );
        `);
      });

      const resSaldo = await db.query(`SELECT * FROM public.saldo_uang_saku WHERE santri_id = '${SANTRI_1_ID}';`);
      expect(Number((resSaldo.rows[0] as any).saldo_saat_ini)).toBe(330000); // 350k - 20k
      expect(Number((resSaldo.rows[0] as any).total_penyesuaian)).toBe(-20000);
    });
  });

  // ==========================================================================
  // PENGUJIAN 5: MODUL KEPESANTRENAN & AUDIT TRAIL PERUBAHAN
  // ==========================================================================
  describe("5. Uji Nyata Modul Kepesantrenan & Riwayat Pembinaan Kedisiplinan", () => {
    let catatanKedisiplinanId: string;

    it("Pengelola mencatat pelanggaran kedisiplinan santri", async () => {
      await asUser(PENGELOLA_ID, async () => {
        const res = await db.query(`
          INSERT INTO public.catatan_kedisiplinan (
              santri_id, tanggal_kejadian, waktu_kejadian, kategori_id,
              deskripsi, tindak_lanjut, catatan_pembinaan, status_tindak_lanjut, petugas_id
          ) VALUES (
              '${SANTRI_1_ID}', '2026-11-08', '05:30:00', '50000000-0000-0000-0000-000000000001',
              'Terlambat shalat Shubuh di masjid utama', 'Nasihat lisan dan membaca 1 juz Al-Quran',
              'Santri berjanji bangun tepat waktu', 'DALAM_PEMBINAAN', '${PENGELOLA_ID}'
          ) RETURNING id;
        `);
        catatanKedisiplinanId = (res.rows[0] as any).id;
      });

      expect(catatanKedisiplinanId).toBeDefined();
    });

    it("Trigger Immutability Riwayat: Pembaruan tindak lanjut otomatis mencatat versi sebelumnya", async () => {
      await asUser(PENGELOLA_ID, async () => {
        await db.query(`
          UPDATE public.catatan_kedisiplinan
          SET status_tindak_lanjut = 'SELESAI',
              catatan_pembinaan = 'Telah menyelesaikan tugas baca 1 juz bersama Musyrif',
              updated_by = '${PENGELOLA_ID}'
          WHERE id = '${catatanKedisiplinanId}';
        `);
      });

      const resRiwayat = await db.query(`
        SELECT * FROM public.riwayat_perubahan_kedisiplinan
        WHERE catatan_kedisiplinan_id = '${catatanKedisiplinanId}';
      `);

      expect(resRiwayat.rows.length).toBe(1);
      expect((resRiwayat.rows[0] as any).status_sebelum).toBe("DALAM_PEMBINAAN");
      expect((resRiwayat.rows[0] as any).status_sesudah).toBe("SELESAI");
      expect((resRiwayat.rows[0] as any).catatan_pembinaan_sebelum).toBe("Santri berjanji bangun tepat waktu");
    });
  });

  // ==========================================================================
  // PENGUJIAN 6: PENGUJIAN NEGATIF & REMEDIASI KEAMANAN (C-01, H-01, M-01, L-01)
  // ==========================================================================
  describe("6. Pengujian Negatif Remediasi Audit (C-01, H-01, M-01, L-01)", () => {
    // Remediasi M-01: Pengguna anon tidak dapat membaca rekening_pesantren
    it("M-01: Pengguna anonim DIBLOKIR TOTAL dari membaca tabel rekening_pesantren", async () => {
      await asAnon(async () => {
        try {
          const res = await db.query("SELECT * FROM public.rekening_pesantren;");
          expect(res.rows.length).toBe(0);
        } catch {
          // Exception permission denied juga merupakan bukti penolakan valid
          expect(true).toBe(true);
        }
      });
    });

    // Remediasi L-01: Akun nonaktif tidak dapat membaca master data yang dibatasi
    it("L-01: Akun nonaktif DIBLOKIR dari membaca master data kelas, kamar, dan tahun ajaran", async () => {
      await asUser(INACTIVE_USER_ID, async () => {
        const resKelas = await db.query("SELECT * FROM public.kelas;");
        expect(resKelas.rows.length).toBe(0); // Ditolak karena get_my_role() = NULL untuk nonaktif

        const resKamar = await db.query("SELECT * FROM public.kamar;");
        expect(resKamar.rows.length).toBe(0);

        const resTahun = await db.query("SELECT * FROM public.tahun_ajaran;");
        expect(resTahun.rows.length).toBe(0);

        const resRekening = await db.query("SELECT * FROM public.rekening_pesantren;");
        expect(resRekening.rows.length).toBe(0);
      });
    });

    it("L-01: Akun aktif tetap dapat membaca master data sesuai otorisasi", async () => {
      await asUser(WALI_1_ID, async () => {
        const resKelas = await db.query("SELECT * FROM public.kelas;");
        expect(resKelas.rows.length).toBe(3);

        const resKamar = await db.query("SELECT * FROM public.kamar;");
        expect(resKamar.rows.length).toBe(3);
      });
    });

    // Remediasi H-01: Isolasi Storage Bukti Pembayaran
    it("H-01: Storage Bukti Pembayaran: Wali A mengunggah ke folder sendiri diizinkan", async () => {
      await asUser(WALI_1_ID, async () => {
        const insertRes = await db.query(`
          INSERT INTO storage.objects (bucket_id, name, owner)
          VALUES ('bukti-pembayaran', '${SANTRI_1_ID}/transfer-1.jpg', '${WALI_1_ID}')
          RETURNING id;
        `);
        expect(insertRes.rows.length).toBe(1);
      });
    });

    it("H-01: Storage Bukti Pembayaran: Wali A mengunggah ke folder Wali B DITOLAK RLS", async () => {
      await asUser(WALI_1_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            INSERT INTO storage.objects (bucket_id, name, owner)
            VALUES ('bukti-pembayaran', '${SANTRI_2_ID}/hack-santri-2.jpg', '${WALI_1_ID}');
          `);
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
      });
    });

    it("H-01: Storage Bukti Pembayaran: Wali A membaca file di folder Wali B DITOLAK (0 baris)", async () => {
      // Injeksi file di folder Santri 2 oleh Superadmin / Wali 2
      await asUser(SUPERADMIN_ID, async () => {
        await db.query(`
          INSERT INTO storage.objects (bucket_id, name, owner)
          VALUES ('bukti-pembayaran', '${SANTRI_2_ID}/transfer-santri-2.jpg', '${WALI_2_ID}');
        `);
      });

      // Wali 1 mencoba membaca file milik Santri 2
      await asUser(WALI_1_ID, async () => {
        const readRes = await db.query(`
          SELECT * FROM storage.objects
          WHERE bucket_id = 'bukti-pembayaran' AND name = '${SANTRI_2_ID}/transfer-santri-2.jpg';
        `);
        expect(readRes.rows.length).toBe(0); // Ditolak / disaring oleh RLS
      });

      // Wali 2 (pemilik sah) membaca file Santri 2
      await asUser(WALI_2_ID, async () => {
        const readRes = await db.query(`
          SELECT * FROM storage.objects
          WHERE bucket_id = 'bukti-pembayaran' AND name = '${SANTRI_2_ID}/transfer-santri-2.jpg';
        `);
        expect(readRes.rows.length).toBe(1); // Diizinkan
      });
    });

    it("H-01: Storage Bukti Pembayaran: Wali A memindahkan file ke folder Wali B DITOLAK RLS", async () => {
      await asUser(WALI_1_ID, async () => {
        let failed = false;
        try {
          await db.query(`
            UPDATE storage.objects
            SET name = '${SANTRI_2_ID}/moved-to-other.jpg'
            WHERE bucket_id = 'bukti-pembayaran' AND name = '${SANTRI_1_ID}/transfer-1.jpg';
          `);
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
      });
    });

    it("H-01: Storage Bukti Pembayaran: Wali A menghapus file bukan miliknya DITOLAK RLS", async () => {
      await asUser(WALI_1_ID, async () => {
        const delRes = await db.query(`
          DELETE FROM storage.objects
          WHERE bucket_id = 'bukti-pembayaran' AND name = '${SANTRI_2_ID}/transfer-santri-2.jpg';
        `);
        expect(delRes.rows.length).toBe(0); // RLS memblokir delete baris di luar folder
      });

      // Pastikan file Santri 2 masih tetap utuh
      await asUser(SUPERADMIN_ID, async () => {
        const verifyRes = await db.query(`
          SELECT * FROM storage.objects
          WHERE bucket_id = 'bukti-pembayaran' AND name = '${SANTRI_2_ID}/transfer-santri-2.jpg';
        `);
        expect(verifyRes.rows.length).toBe(1);
      });
    });

    it("H-01: Storage: Pengelola Kepesantrenan DIBLOKIR TOTAL dari dokumen bukti pembayaran & uang saku", async () => {
      await asUser(PENGELOLA_ID, async () => {
        const resPembayaran = await db.query("SELECT * FROM storage.objects WHERE bucket_id = 'bukti-pembayaran';");
        expect(resPembayaran.rows.length).toBe(0);

        const resSaku = await db.query("SELECT * FROM storage.objects WHERE bucket_id = 'bukti-uang-saku';");
        expect(resSaku.rows.length).toBe(0);

        const resFoto = await db.query("SELECT * FROM storage.objects WHERE bucket_id = 'foto-penyerahan-saku';");
        expect(resFoto.rows.length).toBe(0);
      });
    });

    it("H-01: Storage: Bendahara & Superadmin tetap dapat membaca seluruh dokumen keuangan", async () => {
      await asUser(BENDAHARA_ID, async () => {
        const res = await db.query("SELECT * FROM storage.objects WHERE bucket_id = 'bukti-pembayaran';");
        expect(res.rows.length).toBeGreaterThanOrEqual(2); // Dapat melihat bukti Santri 1 & Santri 2
      });
    });
  });

  // ==========================================================================
  // PENGUJIAN 7: MASTER REMEDIASI 008 (TEMUAN 1 S.D. 5)
  // ==========================================================================
  describe("7. Pengujian Master Remediasi 008 (Temuan 1 s.d. 5)", () => {
    let unpublishedCatatanId: string;

    // Temuan 1: Riwayat Kedisiplinan Wali Privacy
    it("Temuan 1: Wali DIBLOKIR dari membaca riwayat kedisiplinan jika catatan induk is_published_to_wali = false", async () => {
      // 1. Pengelola membuat catatan kedisiplinan santri 1 dengan is_published_to_wali = false
      await asUser(PENGELOLA_ID, async () => {
        const res = await db.query(`
          INSERT INTO public.catatan_kedisiplinan (
              santri_id, tanggal_kejadian, waktu_kejadian, kategori_id,
              deskripsi, tindak_lanjut, catatan_pembinaan, status_tindak_lanjut,
              petugas_id, is_published_to_wali
          ) VALUES (
              '${SANTRI_1_ID}', '2026-11-08', '14:00:00', '50000000-0000-0000-0000-000000000001',
              'Internal evaluasi musyrif - belum siap dipublikasi', 'Pembinaan internal',
              'Evaluasi awal musyrif', 'DALAM_PEMBINAAN', '${PENGELOLA_ID}', false
          ) RETURNING id;
        `);
        unpublishedCatatanId = (res.rows[0] as any).id;

        // Update agar memicu trigger pencatatan riwayat_perubahan_kedisiplinan
        await db.query(`
          UPDATE public.catatan_kedisiplinan
          SET catatan_pembinaan = 'Evaluasi lanjutan musyrif internal',
              updated_by = '${PENGELOLA_ID}'
          WHERE id = '${unpublishedCatatanId}';
        `);
      });

      // 2. Wali 1 (wali Santri 1) mencoba membaca riwayat kedisiplinan yang is_published_to_wali = false
      await asUser(WALI_1_ID, async () => {
        const res = await db.query(`
          SELECT * FROM public.riwayat_perubahan_kedisiplinan
          WHERE catatan_kedisiplinan_id = '${unpublishedCatatanId}';
        `);
        // RLS HARUS memblokir dan mengembalikan 0 baris
        expect(res.rows.length).toBe(0);
      });

      // 3. Pengelola & Admin tetap dapat membaca riwayat internal
      await asUser(PENGELOLA_ID, async () => {
        const res = await db.query(`
          SELECT * FROM public.riwayat_perubahan_kedisiplinan
          WHERE catatan_kedisiplinan_id = '${unpublishedCatatanId}';
        `);
        expect(res.rows.length).toBe(1);
      });
    });

    it("Temuan 1: Wali DAPAT membaca riwayat kedisiplinan setelah catatan induk diubah menjadi is_published_to_wali = true", async () => {
      // Pengelola mengubah status publikasi menjadi true
      await asUser(PENGELOLA_ID, async () => {
        await db.query(`
          UPDATE public.catatan_kedisiplinan
          SET is_published_to_wali = true,
              updated_by = '${PENGELOLA_ID}'
          WHERE id = '${unpublishedCatatanId}';
        `);
      });

      // Wali 1 kini dapat membaca riwayat perubahan
      await asUser(WALI_1_ID, async () => {
        const res = await db.query(`
          SELECT * FROM public.riwayat_perubahan_kedisiplinan
          WHERE catatan_kedisiplinan_id = '${unpublishedCatatanId}';
        `);
        expect(res.rows.length).toBeGreaterThanOrEqual(1);
      });

      // Wali 2 (santri lain) tetap DIBLOKIR dari membaca catatan Santri 1
      await asUser(WALI_2_ID, async () => {
        const res = await db.query(`
          SELECT * FROM public.riwayat_perubahan_kedisiplinan
          WHERE catatan_kedisiplinan_id = '${unpublishedCatatanId}';
        `);
        expect(res.rows.length).toBe(0);
      });
    });

    // Temuan 2: Hardening Role Public -> Authenticated & Anon Access
    it("Temuan 2: Pengguna anonim DAPAT membaca pengumuman publik (is_published = true)", async () => {
      // Injeksi pengumuman publik oleh superadmin
      await asUser(SUPERADMIN_ID, async () => {
        await db.query(`
          INSERT INTO public.pengumuman (judul, kategori, isi, is_published, created_by)
          VALUES ('Jadwal Libur Semester', 'Umum', 'Diumumkan libur semester gasal dimulai tanggal 20 Desember.', true, '${SUPERADMIN_ID}');
        `);
      });

      await asAnon(async () => {
        const res = await db.query(`
          SELECT * FROM public.pengumuman WHERE is_published = true;
        `);
        expect(res.rows.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("Temuan 2: Pengguna anonim DIBLOKIR dari membaca pengumuman non-publik (is_published = false)", async () => {
      // Injeksi pengumuman draft oleh superadmin
      await asUser(SUPERADMIN_ID, async () => {
        await db.query(`
          INSERT INTO public.pengumuman (judul, kategori, isi, is_published, created_by)
          VALUES ('Draft Internal Pesantren', 'Umum', 'Rahasia pengurus', false, '${SUPERADMIN_ID}');
        `);
      });

      await asAnon(async () => {
        const res = await db.query(`
          SELECT * FROM public.pengumuman WHERE judul = 'Draft Internal Pesantren';
        `);
        expect(res.rows.length).toBe(0);
      });
    });

    it("Temuan 2: Pengguna anonim DIBLOKIR dari seluruh tabel operasional lainnya (profiles, santri, tagihan, dll)", async () => {
      await asAnon(async () => {
        const checkAnon = async (sql: string) => {
          try {
            const res = await db.query(sql);
            expect(res.rows.length).toBe(0);
          } catch {
            expect(true).toBe(true); // Permission denied diizinkan
          }
        };

        await checkAnon("SELECT * FROM public.profiles;");
        await checkAnon("SELECT * FROM public.santri;");
        await checkAnon("SELECT * FROM public.tagihan;");
        await checkAnon("SELECT * FROM public.saldo_uang_saku;");
        await checkAnon("SELECT * FROM public.catatan_kedisiplinan;");
      });
    });

    // Temuan 3 & 4: Deduplikasi Policy Storage foto-penyerahan-saku
    it("Temuan 3 & 4: Deduplikasi storage policy foto-penyerahan-saku (upload eksklusif bendahara telah dibersihkan)", async () => {
      const resPolicies = await db.query(`
        SELECT policyname FROM pg_policies
        WHERE tablename = 'objects' AND policyname = 'Storage Foto Penyerahan: upload eksklusif bendahara';
      `);
      expect(resPolicies.rows.length).toBe(0);
    });

    it("Temuan 3 & 4: Bendahara tetap memiliki wewenang upload dan kelola foto-penyerahan-saku via policy kelola", async () => {
      await asUser(BENDAHARA_ID, async () => {
        const insertRes = await db.query(`
          INSERT INTO storage.objects (bucket_id, name, owner)
          VALUES ('foto-penyerahan-saku', '${SANTRI_1_ID}/penyerahan-kas.jpg', '${BENDAHARA_ID}')
          RETURNING id;
        `);
        expect(insertRes.rows.length).toBe(1);

        const selectRes = await db.query(`
          SELECT * FROM storage.objects
          WHERE bucket_id = 'foto-penyerahan-saku' AND name = '${SANTRI_1_ID}/penyerahan-kas.jpg';
        `);
        expect(selectRes.rows.length).toBe(1);
      });

      // Wali 1 dapat melihat foto penyerahan saku santrinya
      await asUser(WALI_1_ID, async () => {
        const selectRes = await db.query(`
          SELECT * FROM storage.objects
          WHERE bucket_id = 'foto-penyerahan-saku' AND name = '${SANTRI_1_ID}/penyerahan-kas.jpg';
        `);
        expect(selectRes.rows.length).toBe(1);
      });

      // Wali 2 DIBLOKIR dari melihat foto penyerahan Santri 1
      await asUser(WALI_2_ID, async () => {
        const selectRes = await db.query(`
          SELECT * FROM storage.objects
          WHERE bucket_id = 'foto-penyerahan-saku' AND name = '${SANTRI_1_ID}/penyerahan-kas.jpg';
        `);
        expect(selectRes.rows.length).toBe(0);
      });
    });

    // Temuan 5: Pengelolaan Master Kategori Pelanggaran & Target Tahfidz
    it("Temuan 5: Pengelola dapat mengelola target_tahfidz & master_kategori_pelanggaran", async () => {
      let targetId: string;
      let kategoriId: string;

      await asUser(PENGELOLA_ID, async () => {
        // 1. Target Tahfidz
        const resTarget = await db.query(`
          INSERT INTO public.target_tahfidz (tahun_ajaran_id, kelas_id, target_jumlah_juz, keterangan_target)
          VALUES ('${TAHUN_AJARAN_ID}', '${KELAS_7A_ID}', 2.0, 'Target Tahfidz Semester Gasal Kelas 7A')
          RETURNING id;
        `);
        expect(resTarget.rows.length).toBe(1);
        targetId = (resTarget.rows[0] as any).id;

        // 2. Master Kategori Pelanggaran
        const resKat = await db.query(`
          INSERT INTO public.master_kategori_pelanggaran (kode_kategori, nama_kategori, tingkat_pelanggaran, poin_pembinaan, standar_tindak_lanjut)
          VALUES ('TEST-SEDANG-02', 'Tidak mengikuti muhadharah mingguan', 'SEDANG', 15, 'Pelanggaran kategori kedisiplinan kegiatan')
          RETURNING id;
        `);
        expect(resKat.rows.length).toBe(1);
        kategoriId = (resKat.rows[0] as any).id;
      });

      // Wali DIBLOKIR dari menambah atau mengubah master data
      await asUser(WALI_1_ID, async () => {
        let failedTarget = false;
        try {
          await db.query(`
            INSERT INTO public.target_tahfidz (tahun_ajaran_id, kelas_id, target_jumlah_juz, keterangan_target)
            VALUES ('${TAHUN_AJARAN_ID}', '${KELAS_7A_ID}', 3.0, 'Hack Target Wali');
          `);
        } catch {
          failedTarget = true;
        }
        expect(failedTarget).toBe(true);

        let failedKat = false;
        try {
          await db.query(`
            INSERT INTO public.master_kategori_pelanggaran (kode_kategori, nama_kategori, tingkat_pelanggaran, poin_pembinaan, standar_tindak_lanjut)
            VALUES ('HACK', 'Kategori Ilegal', 'RINGAN', 99, 'Desc');
          `);
        } catch {
          failedKat = true;
        }
        expect(failedKat).toBe(true);
      });

      // Cleanup master data oleh Admin
      await asUser(ADMIN_ID, async () => {
        await db.query(`DELETE FROM public.target_tahfidz WHERE id = '${targetId}';`);
        await db.query(`DELETE FROM public.master_kategori_pelanggaran WHERE id = '${kategoriId}';`);
      });
    });
  });
});
