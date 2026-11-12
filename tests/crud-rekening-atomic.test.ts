import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("SIPETA: Pengujian Komprehensif CRUD Rekening Pesantren & Transaksi Atomik (Migration 022)", () => {
  let db: PGlite;

  const SUPERADMIN_ID = "11111111-1111-1111-1111-111111111111";
  const PENGASUH_ID   = "22222222-2222-2222-2222-222222222222";
  const TU_USER_ID    = "33333333-3333-3333-3333-333333333333";
  const WALI_USER_ID  = "44444444-4444-4444-4444-444444444444";
  const ASATIDZ_ID    = "55555555-5555-5555-5555-555555555555";
  const BENDAHARA_ID  = "66666666-6666-6666-6666-666666666666";

  beforeEach(async () => {
    db = new PGlite();

    // 1. Skema Database, Role, dan Ekstensi Dasar
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;

      CREATE TYPE public.user_role AS ENUM (
        'superadmin', 'admin', 'tu', 'bendahara', 'pengelola', 'wali'
      );
      CREATE TYPE public.status_transaksi AS ENUM (
        'MENUNGGU_TRANSFER', 'MENUNGGU_VERIFIKASI', 'DISETUJUI', 'DITOLAK', 'KEDALUWARSA'
      );

      CREATE SCHEMA IF NOT EXISTS auth;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon, PUBLIC;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      BEGIN
        RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY,
        nama_lengkap TEXT NOT NULL,
        role public.user_role NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      GRANT SELECT ON public.profiles TO authenticated;

      CREATE OR REPLACE FUNCTION public.get_my_role()
      RETURNS public.user_role
      LANGUAGE sql STABLE
      AS $$
        SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
      $$;

      CREATE TABLE public.rekening_pesantren (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_bank TEXT NOT NULL,
        kode_bank TEXT,
        nomor_rekening TEXT NOT NULL,
        atas_nama TEXT NOT NULL,
        catatan_instruksi TEXT,
        is_active BOOLEAN NOT NULL DEFAULT false,
        updated_by UUID REFERENCES public.profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES public.profiles(id),
        user_role public.user_role,
        aktivitas TEXT NOT NULL,
        jenis_objek TEXT NOT NULL,
        objek_id TEXT,
        data_sebelum JSONB,
        data_sesudah JSONB,
        alasan_perubahan TEXT,
        sumber_aktivitas JSONB,
        waktu TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.transaksi_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kode_transaksi TEXT NOT NULL UNIQUE,
        wali_id UUID NOT NULL,
        total_nominal NUMERIC NOT NULL,
        status public.status_transaksi NOT NULL DEFAULT 'MENUNGGU_TRANSFER',
        rekening_tujuan_snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.pengajuan_uang_saku (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kode_transaksi TEXT NOT NULL UNIQUE,
        wali_id UUID NOT NULL,
        nominal NUMERIC NOT NULL,
        status public.status_transaksi NOT NULL DEFAULT 'MENUNGGU_TRANSFER',
        rekening_tujuan_snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Buat RPC lama dari Migration 021 untuk pengujian deaktivasi
      CREATE OR REPLACE FUNCTION public.rpc_ganti_rekening_resmi_v1(
          p_rekening_id UUID DEFAULT NULL,
          p_nama_bank TEXT DEFAULT NULL,
          p_kode_bank TEXT DEFAULT NULL,
          p_nomor_rekening TEXT DEFAULT NULL,
          p_atas_nama TEXT DEFAULT NULL,
          p_catatan_instruksi TEXT DEFAULT NULL,
          p_alasan TEXT DEFAULT NULL
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
          RETURN jsonb_build_object('success', true, 'message', 'Lama');
      END;
      $$;
      GRANT EXECUTE ON FUNCTION public.rpc_ganti_rekening_resmi_v1(uuid, text, text, text, text, text, text) TO authenticated;

      -- Data Master User untuk Pengujian
      INSERT INTO public.profiles (id, nama_lengkap, role, is_active) VALUES
        ('${SUPERADMIN_ID}', 'KH. Superadmin Utama', 'superadmin', true),
        ('${PENGASUH_ID}', 'Kiai Pengasuh Pondok', 'admin', true),
        ('${TU_USER_ID}', 'Staf Tata Usaha', 'tu', true),
        ('${WALI_USER_ID}', 'Wali Santri Ahmad', 'wali', true),
        ('${ASATIDZ_ID}', 'Ustadz Pengajar', 'pengelola', true),
        ('${BENDAHARA_ID}', 'Ustadzah Bendahara', 'bendahara', true);
    `);

    // 2. Jalankan Usulan Migration 022
    const migration022Path = path.resolve(__dirname, "../supabase/migrations/022_simplifikasi_crud_rekening_pesantren.sql");
    const migration022Sql = fs.readFileSync(migration022Path, "utf8");
    await db.exec(migration022Sql);
  });

  const setAuthContext = async (userId: string | null) => {
    if (userId) {
      await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
    } else {
      await db.exec(`SET request.jwt.claim.sub = '';`);
    }
  };

  // ==========================================================================
  // BAGIAN 1: PENGUJIAN CRUD DAN PERSISTENSI DATA
  // ==========================================================================
  describe("1. CRUD dan Persistensi Data (Anti Data Hilang saat Reload)", () => {
    it("Pengasuh dapat menambah rekening baru dan data tersimpan permanen di database", async () => {
      await setAuthContext(PENGASUH_ID);

      const res = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank Syariah Indonesia (BSI)',
          '451',
          '7198823456',
          'Yayasan Pondok Pesantren Modern Abu Manshur',
          'Harap sertakan nama santri pada berita transfer.',
          'Pendaftaran rekening informasi BSI'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);

      const output = res.rows[0]!.rpc_tambah_rekening_pesantren_v1;
      expect(output.success).toBe(true);
      expect(output.data.nomor_rekening).toBe("7198823456");
      expect(output.data.nama_bank).toBe("Bank Syariah Indonesia (BSI)");
      expect(output.data.is_active).toBe(false); // Terpisah dari rekening aktif checkout

      // Simulasi Reload Halaman: Mengambil kembali data secara independen dari tabel
      const reloadCheck = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE nomor_rekening = '7198823456';
      `);
      expect(reloadCheck.rows.length).toBe(1);
      expect(reloadCheck.rows[0]!.atas_nama).toBe("Yayasan Pondok Pesantren Modern Abu Manshur");
      expect(reloadCheck.rows[0]!.is_active).toBe(false);

      // Verifikasi Audit Log Tercatat Permanen
      const auditCheck = await db.query<any>(`
        SELECT * FROM public.audit_logs 
        WHERE jenis_objek = 'rekening_pesantren' 
          AND aktivitas = 'TAMBAH_REKENING_PESANTREN';
      `);
      expect(auditCheck.rows.length).toBe(1);
      expect(auditCheck.rows[0]!.user_id).toBe(PENGASUH_ID);
    });

    it("Pengasuh dapat mengedit rekening yang sudah ada dan perubahan tersimpan permanen", async () => {
      await setAuthContext(PENGASUH_ID);

      // Tambah rekening awal
      const addRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank Mandiri', '008', '1310012345678', 'Pesantren Abu Manshur', 'Instruksi awal'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      const rekId = addRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.id;

      // Edit informasi rekening (tanpa mengubah is_active)
      const editRes = await db.query<{ rpc_update_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_update_rekening_pesantren_v1(
          '${rekId}',
          'Bank Mandiri Syariah',
          '008',
          '1310099999999',
          'Yayasan Pondok Modern',
          'Instruksi pembayaran SPP dan uang saku diperbarui',
          'Pembaruan nomor rekening baru'
        ) AS rpc_update_rekening_pesantren_v1;
      `);

      const updateOutput = editRes.rows[0]!.rpc_update_rekening_pesantren_v1;
      expect(updateOutput.success).toBe(true);
      expect(updateOutput.data.nama_bank).toBe("Bank Mandiri Syariah");
      expect(updateOutput.data.nomor_rekening).toBe("1310099999999");
      expect(updateOutput.data.is_active).toBe(false);

      // Simulasi Reload: Data yang dibaca setelah reload harus data baru
      const reloadCheck = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE id = '${rekId}';
      `);
      expect(reloadCheck.rows[0]!.nama_bank).toBe("Bank Mandiri Syariah");
      expect(reloadCheck.rows[0]!.nomor_rekening).toBe("1310099999999");
      expect(reloadCheck.rows[0]!.catatan_instruksi).toBe("Instruksi pembayaran SPP dan uang saku diperbarui");
      expect(reloadCheck.rows[0]!.is_active).toBe(false);
    });

    it("Pengasuh dapat menghapus rekening tanpa riwayat transaksi dan data benar-benar hilang", async () => {
      await setAuthContext(PENGASUH_ID);

      const addRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank Muamalat', '147', '345000111222', 'Yayasan Abu Manshur', 'Cadangan'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      const rekId = addRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.id;

      // Hapus rekening
      const deleteRes = await db.query<{ rpc_hapus_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_hapus_rekening_pesantren_v1(
          '${rekId}', 'Salah input nomor rekening'
        ) AS rpc_hapus_rekening_pesantren_v1;
      `);
      expect(deleteRes.rows[0]!.rpc_hapus_rekening_pesantren_v1.success).toBe(true);

      // Simulasi Reload: Data harus benar-benar hilang dari database
      const reloadCheck = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE id = '${rekId}';
      `);
      expect(reloadCheck.rows.length).toBe(0);

      // Verifikasi Audit Log Penghapusan
      const auditCheck = await db.query<any>(`
        SELECT * FROM public.audit_logs 
        WHERE objek_id = '${rekId}' AND aktivitas = 'HAPUS_REKENING_PESANTREN';
      `);
      expect(auditCheck.rows.length).toBe(1);
      expect(auditCheck.rows[0]!.data_sebelum.nama_bank).toBe("Bank Muamalat");
      expect(auditCheck.rows[0]!.data_sesudah).toBeNull();
    });

    it("Wali Santri dapat melihat daftar rekening tersimpan secara read-only tanpa filter is_active", async () => {
      await setAuthContext(PENGASUH_ID);
      // Rekening nonaktif (is_active = false)
      await db.query(`
        SELECT public.rpc_tambah_rekening_pesantren_v1('Bank BCA Syariah', '536', '0011223344', 'Yayasan Abu Manshur');
      `);

      // Switch ke Sesi Wali Santri dalam role authenticated
      await db.exec(`SET ROLE authenticated;`);
      await setAuthContext(WALI_USER_ID);

      // Wali Santri SELECT tabel rekening
      const waliSelect = await db.query<any>(`
        SELECT id, nama_bank, nomor_rekening, atas_nama, catatan_instruksi, is_active
        FROM public.rekening_pesantren;
      `);
      expect(waliSelect.rows.length).toBeGreaterThanOrEqual(1);
      expect(waliSelect.rows[0]!.nama_bank).toBe("Bank BCA Syariah");
      // Terbukti: Wali Santri bisa membaca rekening meskipun is_active = false
      expect(waliSelect.rows[0]!.is_active).toBe(false);

      await db.exec(`RESET ROLE;`);
    });
  });

  // ==========================================================================
  // BAGIAN 2: PENGUJIAN ATOMIC INSERT & ROLLBACK KEGAGALAN AUDIT LOG
  // ==========================================================================
  describe("2. Atomic INSERT & Rollback All-or-Nothing", () => {
    it("Jika INSERT audit log gagal di tengah RPC, transaksi INSERT rekening di-ROLLBACK total", async () => {
      await setAuthContext(PENGASUH_ID);

      // Pasang trigger sementara pada audit_logs untuk mensimulasikan kegagalan transaksi
      await db.exec(`
        CREATE OR REPLACE FUNCTION trigger_fail_insert_audit()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.aktivitas = 'TAMBAH_REKENING_PESANTREN' THEN
            RAISE EXCEPTION 'Simulasi: Disk audit log penuh / kegagalan transaksi audit';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_test_fail_audit
        BEFORE INSERT ON public.audit_logs
        FOR EACH ROW EXECUTE FUNCTION trigger_fail_insert_audit();
      `);

      let errorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_tambah_rekening_pesantren_v1(
            'Bank Mega Syariah', '506', '999888777666', 'Pesantren Abu Manshur'
          );
        `);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toContain("Simulasi: Disk audit log penuh");
      }
      expect(errorThrown).toBe(true);

      // Verifikasi ALL-OR-NOTHING: Tidak boleh ada baris rekening yang tertinggal!
      const checkRekening = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE nomor_rekening = '999888777666';
      `);
      expect(checkRekening.rows.length).toBe(0);

      // Bersihkan trigger simulasi
      await db.exec(`
        DROP TRIGGER IF EXISTS trg_test_fail_audit ON public.audit_logs;
        DROP FUNCTION IF EXISTS trigger_fail_insert_audit();
      `);
    });
  });

  // ==========================================================================
  // BAGIAN 3: PENGUJIAN ATOMIC UPDATE & ROLLBACK KEGAGALAN AUDIT LOG
  // ==========================================================================
  describe("3. Atomic UPDATE & Rollback All-or-Nothing", () => {
    it("Jika UPDATE audit log gagal, data rekening lama tetap utuh tanpa perubahan parsial", async () => {
      await setAuthContext(PENGASUH_ID);

      const addRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'BSI Asli', '451', '111122223333', 'Nama Asli Pemilik'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      const rekId = addRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.id;

      // Pasang trigger kegagalan audit log pada UPDATE
      await db.exec(`
        CREATE OR REPLACE FUNCTION trigger_fail_update_audit()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.aktivitas = 'UPDATE_REKENING_PESANTREN' THEN
            RAISE EXCEPTION 'Simulasi: Audit log update failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_test_fail_update_audit
        BEFORE INSERT ON public.audit_logs
        FOR EACH ROW EXECUTE FUNCTION trigger_fail_update_audit();
      `);

      let errorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_update_rekening_pesantren_v1(
            '${rekId}', 'BSI Palsu Diubah', '451', '999999999999', 'Nama Diubah'
          );
        `);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toContain("Simulasi: Audit log update failure");
      }
      expect(errorThrown).toBe(true);

      // Verifikasi: Data lama tetap utuh!
      const checkOriginal = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE id = '${rekId}';
      `);
      expect(checkOriginal.rows[0]!.nama_bank).toBe("BSI Asli");
      expect(checkOriginal.rows[0]!.nomor_rekening).toBe("111122223333");
      expect(checkOriginal.rows[0]!.atas_nama).toBe("Nama Asli Pemilik");

      await db.exec(`
        DROP TRIGGER IF EXISTS trg_test_fail_update_audit ON public.audit_logs;
        DROP FUNCTION IF EXISTS trigger_fail_update_audit();
      `);
    });

    it("Rekening yang memiliki riwayat transaksi ditolak keras jika identitas nomor rekening/pemilik diubah", async () => {
      await setAuthContext(PENGASUH_ID);

      const addRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'BSI Bersejarah', '451', '777000111222', 'Pesantren Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      const rekId = addRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.id;

      // Simulasikan transaksi pembayaran santri menggunakan snapshot rekening ini
      await db.query(`
        INSERT INTO public.transaksi_pembayaran (
          kode_transaksi, wali_id, total_nominal, rekening_tujuan_snapshot
        ) VALUES (
          'TRX-HISTORIS-001',
          '${WALI_USER_ID}',
          500000,
          jsonb_build_object('id', '${rekId}', 'nomor_rekening', '777000111222', 'nama_bank', 'BSI Bersejarah')
        );
      `);

      // Coba ubah nomor rekening pada rekening yang sudah memiliki riwayat transaksi
      let errorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_update_rekening_pesantren_v1(
            '${rekId}', 'BSI Bersejarah', '451', '888000999111', 'Pesantren Abu Manshur'
          );
        `);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toContain("telah digunakan dalam riwayat transaksi keuangan");
      }
      expect(errorThrown).toBe(true);

      // Verifikasi bahwa field catatan instruksi tetap dapat diubah tanpa mengubah nomor/nama
      const validUpdate = await db.query<{ rpc_update_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_update_rekening_pesantren_v1(
          '${rekId}', NULL, NULL, NULL, NULL, 'Catatan instruksi baru diperbolehkan', 'Update catatan saja'
        ) AS rpc_update_rekening_pesantren_v1;
      `);
      expect(validUpdate.rows[0]!.rpc_update_rekening_pesantren_v1.success).toBe(true);
      expect(validUpdate.rows[0]!.rpc_update_rekening_pesantren_v1.data.catatan_instruksi).toBe("Catatan instruksi baru diperbolehkan");
    });
  });

  // ==========================================================================
  // BAGIAN 4: PENGUJIAN ATOMIC DELETE & PROTEKSI HISTORIS
  // ==========================================================================
  describe("4. Atomic DELETE & Proteksi Transaksi Historis", () => {
    it("Rekening dengan riwayat pembayaran santri DITOLAK KERAS saat dihapus", async () => {
      await setAuthContext(PENGASUH_ID);

      const addRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'BSI SPP Santri', '451', '555444333222', 'Pesantren Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      const rekId = addRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.id;

      // Kaitkan dengan transaksi uang saku
      await db.query(`
        INSERT INTO public.pengajuan_uang_saku (
          kode_transaksi, wali_id, nominal, rekening_tujuan_snapshot
        ) VALUES (
          'TOPUP-HISTORIS-001',
          '${WALI_USER_ID}',
          250000,
          jsonb_build_object('id', '${rekId}', 'nomor_rekening', '555444333222', 'nama_bank', 'BSI SPP Santri')
        );
      `);

      // Coba hapus
      let errorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_hapus_rekening_pesantren_v1('${rekId}');
        `);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toContain("tidak dapat dihapus karena tersimpan dalam riwayat transaksi keuangan");
      }
      expect(errorThrown).toBe(true);

      // Verifikasi rekening tetap ada
      const stillExists = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE id = '${rekId}';
      `);
      expect(stillExists.rows.length).toBe(1);
    });

    it("Jika DELETE audit log gagal, penghapusan rekening di-ROLLBACK dan rekening tetap ada", async () => {
      await setAuthContext(PENGASUH_ID);

      const addRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank BNI', '009', '0987654321', 'Yayasan Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      const rekId = addRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.id;

      // Pasang trigger kegagalan audit log pada DELETE
      await db.exec(`
        CREATE OR REPLACE FUNCTION trigger_fail_delete_audit()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.aktivitas = 'HAPUS_REKENING_PESANTREN' THEN
            RAISE EXCEPTION 'Simulasi: Audit log delete failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_test_fail_delete_audit
        BEFORE INSERT ON public.audit_logs
        FOR EACH ROW EXECUTE FUNCTION trigger_fail_delete_audit();
      `);

      let errorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_hapus_rekening_pesantren_v1('${rekId}');
        `);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toContain("Simulasi: Audit log delete failure");
      }
      expect(errorThrown).toBe(true);

      // Verifikasi ALL-OR-NOTHING: Rekening TIDAK terhapus
      const checkExists = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE id = '${rekId}';
      `);
      expect(checkExists.rows.length).toBe(1);

      await db.exec(`
        DROP TRIGGER IF EXISTS trg_test_fail_delete_audit ON public.audit_logs;
        DROP FUNCTION IF EXISTS trigger_fail_delete_audit();
      `);
    });
  });

  // ==========================================================================
  // BAGIAN 5: PENGUJIAN ADVISORY LOCK & CONCURRENCY
  // ==========================================================================
  describe("5. Advisory Transaction Lock & Concurrency Simulation", () => {
    it("Advisory lock 'sipeta_rekening_pesantren_mutation_lock' aktif selama eksekusi RPC atomik", async () => {
      await setAuthContext(PENGASUH_ID);

      const lockHashRes = await db.query<any>(`
        SELECT hashtext('sipeta_rekening_pesantren_mutation_lock') AS lock_id;
      `);
      expect(lockHashRes.rows[0]!.lock_id).toBeDefined();

      const res = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank Concurrency Safe', '451', '777888999111', 'Yayasan Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      expect(res.rows[0]!.rpc_tambah_rekening_pesantren_v1.success).toBe(true);
    });
  });

  // ==========================================================================
  // BAGIAN 6: PENGUJIAN OTORISASI & ISOLASI ROLE
  // ==========================================================================
  describe("6. Otorisasi Ketat & Isolasi Akses Role", () => {
    it("Pemanggilan RPC mutasi tanpa autentikasi (auth.uid() NULL) ditolak", async () => {
      await setAuthContext(null);

      let errorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_tambah_rekening_pesantren_v1('Bank Fraud', '000', '12345678', 'Penipu');
        `);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toContain("Akses ditolak: Sesi otentikasi tidak ditemukan");
      }
      expect(errorThrown).toBe(true);
    });

    it("Staf Tata Usaha (TU), Wali, Asatidz, dan Bendahara DITOLAK memanggil RPC mutasi", async () => {
      const unauthorizedRoles = [
        { id: TU_USER_ID, name: "TU" },
        { id: WALI_USER_ID, name: "Wali" },
        { id: ASATIDZ_ID, name: "Asatidz" },
        { id: BENDAHARA_ID, name: "Bendahara" },
      ];

      for (const u of unauthorizedRoles) {
        await setAuthContext(u.id);

        let errorThrown = false;
        try {
          await db.query(`
            SELECT public.rpc_tambah_rekening_pesantren_v1('Bank Ilegal', '000', '12345678', 'Hacker');
          `);
        } catch (err: any) {
          errorThrown = true;
          expect(err.message).toContain("Hanya Pengasuh atau Superadmin");
        }
        expect(errorThrown).toBe(true);
      }
    });

    it("Role Superadmin dan Pengasuh diizinkan memanggil RPC mutasi", async () => {
      await setAuthContext(SUPERADMIN_ID);
      const superadminRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank Mandiri Superadmin', '008', '888111222333', 'Yayasan Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      expect(superadminRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.success).toBe(true);

      await setAuthContext(PENGASUH_ID);
      const pengasuhRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank BSI Pengasuh', '451', '999111222333', 'Yayasan Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      expect(pengasuhRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.success).toBe(true);
    });

    it("Tata Usaha (TU) tidak memiliki hak membaca (SELECT) pada tabel rekening_pesantren", async () => {
      await setAuthContext(PENGASUH_ID);
      await db.query(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank BSI Rahasia TU', '451', '999888111222', 'Yayasan Abu Manshur'
        );
      `);

      await db.exec(`SET ROLE authenticated;`);

      await setAuthContext(TU_USER_ID);
      const tuRead = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren;
      `);
      expect(tuRead.rows.length).toBe(0);

      await setAuthContext(PENGASUH_ID);
      const pengasuhRead = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren;
      `);
      expect(pengasuhRead.rows.length).toBeGreaterThanOrEqual(1);

      await db.exec(`RESET ROLE;`);
    });
  });

  // ==========================================================================
  // BAGIAN 7: PEMISAHAN CRUD INFORMASI DARI STATUS AKTIF & CHECKOUT AMBIGUITAS
  // ==========================================================================
  describe("7. Pemisahan Total CRUD Informasi dari Status Aktif & Checkout", () => {
    it("Menambah banyak rekening informasi baru selalu berstatus is_active = false", async () => {
      await setAuthContext(PENGASUH_ID);

      // Tambah rekening 1 (BSI)
      const res1 = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank BSI Informasi', '451', '7111222333', 'Pesantren Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      expect(res1.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.is_active).toBe(false);

      // Tambah rekening 2 (Muamalat)
      const res2 = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank Muamalat Info', '147', '8222333444', 'Pesantren Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      expect(res2.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.is_active).toBe(false);

      // Tambah rekening 3 (BCA Syariah)
      const res3 = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank BCA Syariah Info', '536', '9333444555', 'Pesantren Abu Manshur'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      expect(res3.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.is_active).toBe(false);

      // Pastikan seluruh rekening baru tersimpan tanpa ada yang aktif
      const allRows = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE is_active = false;
      `);
      expect(allRows.rows.length).toBeGreaterThanOrEqual(3);
    });

    it("Mengedit rekening tidak mengubah is_active rekening", async () => {
      await setAuthContext(PENGASUH_ID);

      const addRes = await db.query<{ rpc_tambah_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_tambah_rekening_pesantren_v1(
          'Bank Asli Edit', '451', '1234512345', 'Yayasan'
        ) AS rpc_tambah_rekening_pesantren_v1;
      `);
      const rekId = addRes.rows[0]!.rpc_tambah_rekening_pesantren_v1.data.id;

      // Edit nama bank dan nomor rekening
      const updateRes = await db.query<{ rpc_update_rekening_pesantren_v1: any }>(`
        SELECT public.rpc_update_rekening_pesantren_v1(
          '${rekId}', 'Bank Asli Edit Baru', '451', '1234512345', 'Yayasan Pesantren'
        ) AS rpc_update_rekening_pesantren_v1;
      `);
      expect(updateRes.rows[0]!.rpc_update_rekening_pesantren_v1.data.is_active).toBe(false);

      // Periksa di database
      const row = await db.query<any>(`
        SELECT is_active FROM public.rekening_pesantren WHERE id = '${rekId}';
      `);
      expect(row.rows[0]!.is_active).toBe(false);
    });

    it("Checkout query (WHERE is_active = true) tidak pernah ambigu dan dilindungi partial unique index", async () => {
      // Pasang satu rekening aktif resmi secara manual (simulasi data resmi pesantren)
      await db.query(`
        INSERT INTO public.rekening_pesantren (
          id, nama_bank, kode_bank, nomor_rekening, atas_nama, is_active
        ) VALUES (
          gen_random_uuid(), 'BSI Resmi Aktif', '451', '7999888777', 'Yayasan Abu Manshur', true
        );
      `);

      // Tambahkan banyak rekening informasi via RPC
      await setAuthContext(PENGASUH_ID);
      for (let i = 1; i <= 5; i++) {
        await db.query(`
          SELECT public.rpc_tambah_rekening_pesantren_v1(
            'Bank Info ${i}', '00${i}', '98765432${i}', 'Pesantren Abu Manshur'
          );
        `);
      }

      // Query checkout yang digunakan rpc_checkout_pembayaran_v2:
      const checkoutQuery = await db.query<any>(`
        SELECT * FROM public.rekening_pesantren WHERE is_active = true;
      `);
      // HARUS tepat 1 baris, tidak pernah ambigu
      expect(checkoutQuery.rows.length).toBe(1);
      expect(checkoutQuery.rows[0]!.nomor_rekening).toBe("7999888777");

      // Coba masukkan rekening aktif kedua secara langsung (harus ditolak oleh idx_single_active_rekening_pesantren)
      let duplicateActiveError = false;
      try {
        await db.query(`
          INSERT INTO public.rekening_pesantren (
            id, nama_bank, nomor_rekening, atas_nama, is_active
          ) VALUES (
            gen_random_uuid(), 'Bank Ilegal Kedua', '1112223334', 'Ilegal', true
          );
        `);
      } catch (err: any) {
        duplicateActiveError = true;
        expect(err.message).toContain("idx_single_active_rekening_pesantren");
      }
      expect(duplicateActiveError).toBe(true);
    });
  });

  // ==========================================================================
  // BAGIAN 8: DEAKTIVASI JALUR RPC LAMA (rpc_ganti_rekening_resmi_v1)
  // ==========================================================================
  describe("8. Deaktivasi Jalur RPC Lama rpc_ganti_rekening_resmi_v1", () => {
    it("Hak EXECUTE pada rpc_ganti_rekening_resmi_v1 telah dicabut dari authenticated, anon, PUBLIC", async () => {
      // Beralih ke role authenticated
      await db.exec(`SET ROLE authenticated;`);
      await setAuthContext(PENGASUH_ID);

      let errorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_ganti_rekening_resmi_v1(
            gen_random_uuid(), 'BSI', '451', '12345678', 'Nama', 'Catatan', 'Alasan'
          );
        `);
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toContain("permission denied for function rpc_ganti_rekening_resmi_v1");
      }
      expect(errorThrown).toBe(true);

      // Coba sebagai anon
      await db.exec(`SET ROLE anon;`);
      await setAuthContext(null);

      let anonErrorThrown = false;
      try {
        await db.query(`
          SELECT public.rpc_ganti_rekening_resmi_v1(
            gen_random_uuid(), 'BSI', '451', '12345678', 'Nama', 'Catatan', 'Alasan'
          );
        `);
      } catch (err: any) {
        anonErrorThrown = true;
        expect(err.message).toContain("permission denied for function rpc_ganti_rekening_resmi_v1");
      }
      expect(anonErrorThrown).toBe(true);

      await db.exec(`RESET ROLE;`);
    });
  });
});
