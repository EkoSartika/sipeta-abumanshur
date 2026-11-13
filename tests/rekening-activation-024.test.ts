import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { AdministrasiService } from "@/lib/services/administrasi.service";

describe("SIPETA: Pengujian Aktivasi & Pergantian Rekening Utama Atomik (Migration 024)", () => {
  let db: PGlite;

  const SUPERADMIN_ID = "11111111-1111-1111-1111-111111111111";
  const PENGASUH_ID   = "22222222-2222-2222-2222-222222222222";
  const TU_USER_ID    = "33333333-3333-3333-3333-333333333333";
  const WALI_USER_ID  = "44444444-4444-4444-4444-444444444444";
  const BENDAHARA_ID  = "55555555-5555-5555-5555-555555555555";
  const ASATIDZ_ID    = "66666666-6666-6666-6666-666666666666";

  beforeEach(async () => {
    db = new PGlite();

    // 1. Skema Database & Role Dasar
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Data Pengguna Uji
      INSERT INTO public.profiles (id, nama_lengkap, role, is_active) VALUES
        ('${SUPERADMIN_ID}', 'KH. Superadmin Utama', 'superadmin', true),
        ('${PENGASUH_ID}', 'Dr. Pengasuh Pesantren', 'admin', true),
        ('${TU_USER_ID}', 'Staf TU Administrasi', 'tu', true),
        ('${WALI_USER_ID}', 'Ahmad Wali Santri', 'wali', true),
        ('${BENDAHARA_ID}', 'Ust. Bendahara Pesantren', 'bendahara', true),
        ('${ASATIDZ_ID}', 'Ust. Asatidz Pengelola', 'pengelola', true);
    `);

    // 2. Eksekusi Skrip Migration 024
    const migrationPath = path.resolve(__dirname, "../supabase/migrations/024_rekening_pesantren_activation.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    await db.exec(migrationSql);
  });

  const setAuthUser = async (userId: string | null) => {
    if (userId) {
      await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
    } else {
      await db.exec(`SET request.jwt.claim.sub = '';`);
    }
  };

  it("1. Aktivasi Rekening Pertama: Mengubah is_active menjadi true dan mencatat audit log atomik", async () => {
    // Sisipkan 2 rekening nonaktif
    const resInsert = await db.query<{ id: string }>(`
      INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama, is_active)
      VALUES
        ('Bank Syariah Indonesia (BSI)', '451', '7112233445', 'Yayasan Abu Manshur BSI', false),
        ('Bank Muamalat', '147', '1010202030', 'Yayasan Abu Manshur Muamalat', false)
      RETURNING id;
    `);
    const idRek1 = resInsert.rows[0]!.id;
    const idRek2 = resInsert.rows[1]!.id;

    // Login sebagai Pengasuh (admin)
    await setAuthUser(PENGASUH_ID);

    // Panggil RPC aktivasi untuk rekening 1
    const res = await db.query<{ rpc_aktifkan_rekening_pesantren_v1: any }>(`
      SELECT public.rpc_aktifkan_rekening_pesantren_v1(
        '${idRek1}',
        'Aktivasi rekening BSI sebagai rekening utama operasional'
      ) AS rpc_aktifkan_rekening_pesantren_v1;
    `);

    const result = res.rows[0]!.rpc_aktifkan_rekening_pesantren_v1;
    expect(result.success).toBe(true);
    expect(result.data.is_active).toBe(true);
    expect(result.data.id).toBe(idRek1);

    // Verifikasi di database: rek1 aktif, rek2 tetap nonaktif
    const checkDb = await db.query<{ id: string; is_active: boolean }>(`
      SELECT id, is_active FROM public.rekening_pesantren;
    `);
    const rek1Db = checkDb.rows.find((r) => r.id === idRek1);
    const rek2Db = checkDb.rows.find((r) => r.id === idRek2);
    expect(rek1Db?.is_active).toBe(true);
    expect(rek2Db?.is_active).toBe(false);

    // Verifikasi audit log tercatat secara detail dan terstruktur
    const auditRes = await db.query<{
      aktivitas: string;
      jenis_objek: string;
      objek_id: string;
      data_sebelum: any;
      data_sesudah: any;
    }>(`
      SELECT aktivitas, jenis_objek, objek_id, data_sebelum, data_sesudah FROM public.audit_logs
      WHERE objek_id = '${idRek1}';
    `);
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0]!.aktivitas).toBe("AKTIFKAN_REKENING_PESANTREN");
    expect(auditRes.rows[0]!.data_sebelum.tipe_aksi).toBe("AKTIVASI_REKENING_PERDANA");
    expect(auditRes.rows[0]!.data_sebelum.rekening_lama).toBeNull();
    expect(auditRes.rows[0]!.data_sebelum.rekening_baru.is_active).toBe(false);
    expect(auditRes.rows[0]!.data_sesudah.rekening_baru.is_active).toBe(true);
  });

  it("2. Pergantian Rekening Utama: Atomik menonaktifkan rekening lama saat mengaktifkan rekening baru", async () => {
    // Sisipkan rekening 1 (aktif) dan rekening 2 (nonaktif)
    const resInsert = await db.query<{ id: string }>(`
      INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama, is_active)
      VALUES
        ('Bank Syariah Indonesia (BSI)', '451', '7112233445', 'Yayasan Abu Manshur BSI', true),
        ('Bank Muamalat', '147', '1010202030', 'Yayasan Abu Manshur Muamalat', false)
      RETURNING id;
    `);
    const idBsi = resInsert.rows[0]!.id;
    const idMuamalat = resInsert.rows[1]!.id;

    // Login sebagai Superadmin
    await setAuthUser(SUPERADMIN_ID);

    // Panggil RPC aktivasi rekening Muamalat
    const res = await db.query<{ rpc_aktifkan_rekening_pesantren_v1: any }>(`
      SELECT public.rpc_aktifkan_rekening_pesantren_v1(
        '${idMuamalat}',
        'Beralih ke rekening Muamalat'
      ) AS rpc_aktifkan_rekening_pesantren_v1;
    `);

    expect(res.rows[0]!.rpc_aktifkan_rekening_pesantren_v1.success).toBe(true);

    // Verifikasi database: BSI menjadi nonaktif, Muamalat menjadi aktif
    const checkDb = await db.query<{ id: string; nama_bank: string; is_active: boolean }>(`
      SELECT id, nama_bank, is_active FROM public.rekening_pesantren ORDER BY created_at ASC;
    `);

    const rekBsi = checkDb.rows.find((r) => r.id === idBsi);
    const rekMuamalat = checkDb.rows.find((r) => r.id === idMuamalat);

    expect(rekBsi?.is_active).toBe(false);
    expect(rekMuamalat?.is_active).toBe(true);

    // Verifikasi persis ada 1 rekening aktif
    const activeCount = checkDb.rows.filter((r) => r.is_active).length;
    expect(activeCount).toBe(1);

    // Verifikasi audit log pergantian merekam rekening lama dan rekening baru secara jelas
    const auditRes = await db.query<{
      aktivitas: string;
      jenis_objek: string;
      objek_id: string;
      data_sebelum: any;
      data_sesudah: any;
      sumber_aktivitas: any;
    }>(`
      SELECT aktivitas, jenis_objek, objek_id, data_sebelum, data_sesudah, sumber_aktivitas FROM public.audit_logs
      WHERE objek_id = '${idMuamalat}';
    `);
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0]!.aktivitas).toBe("GANTI_REKENING_UTAMA");
    expect(auditRes.rows[0]!.data_sebelum.tipe_aksi).toBe("PERGANTIAN_REKENING_UTAMA");
    expect(auditRes.rows[0]!.data_sebelum.rekening_lama.id).toBe(idBsi);
    expect(auditRes.rows[0]!.data_sebelum.rekening_lama.is_active).toBe(true);
    expect(auditRes.rows[0]!.data_sebelum.rekening_baru.id).toBe(idMuamalat);
    expect(auditRes.rows[0]!.data_sebelum.rekening_baru.is_active).toBe(false);

    expect(auditRes.rows[0]!.data_sesudah.rekening_lama.id).toBe(idBsi);
    expect(auditRes.rows[0]!.data_sesudah.rekening_lama.is_active).toBe(false);
    expect(auditRes.rows[0]!.data_sesudah.rekening_baru.id).toBe(idMuamalat);
    expect(auditRes.rows[0]!.data_sesudah.rekening_baru.is_active).toBe(true);

    expect(auditRes.rows[0]!.sumber_aktivitas.tipe_perubahan).toBe("PERGANTIAN");
    expect(auditRes.rows[0]!.sumber_aktivitas.rekening_lama_id).toBe(idBsi);
    expect(auditRes.rows[0]!.sumber_aktivitas.rekening_baru_id).toBe(idMuamalat);
  });

  it("3. Integritas Indeks Unik: Database secara fisik menolak keberadaan dua rekening aktif", async () => {
    await db.query(`
      INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama, is_active)
      VALUES ('Bank A', '001', '1111111111', 'Yayasan 1', true);
    `);

    // Mencoba INSERT rekening aktif kedua secara langsung harus gagal oleh idx_single_active_rekening_pesantren
    await expect(
      db.query(`
        INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama, is_active)
        VALUES ('Bank B', '002', '2222222222', 'Yayasan 2', true);
      `)
    ).rejects.toThrow("idx_single_active_rekening_pesantren");
  });

  it("4. Penonaktifan Rekening Utama: Pengasuh/Superadmin dapat menonaktifkan rekening tanpa menghapusnya", async () => {
    const resInsert = await db.query<{ id: string }>(`
      INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama, is_active)
      VALUES ('Bank Syariah Indonesia (BSI)', '451', '7112233445', 'Yayasan Abu Manshur BSI', true)
      RETURNING id;
    `);
    const idRek = resInsert.rows[0]!.id;

    await setAuthUser(PENGASUH_ID);

    const res = await db.query<{ rpc_nonaktifkan_rekening_pesantren_v1: any }>(`
      SELECT public.rpc_nonaktifkan_rekening_pesantren_v1(
        '${idRek}',
        'Penonaktifan sementara untuk audit rekening'
      ) AS rpc_nonaktifkan_rekening_pesantren_v1;
    `);

    expect(res.rows[0]!.rpc_nonaktifkan_rekening_pesantren_v1.success).toBe(true);
    expect(res.rows[0]!.rpc_nonaktifkan_rekening_pesantren_v1.data.is_active).toBe(false);

    // Database memastikan 0 rekening aktif
    const checkDb = await db.query<{ is_active: boolean }>(`
      SELECT is_active FROM public.rekening_pesantren WHERE is_active = true;
    `);
    expect(checkDb.rows.length).toBe(0);

    // Audit log penonaktifan tercatat secara terstruktur
    const auditRes = await db.query<{ aktivitas: string; data_sebelum: any; data_sesudah: any }>(`
      SELECT aktivitas, data_sebelum, data_sesudah FROM public.audit_logs WHERE aktivitas = 'NONAKTIFKAN_REKENING_PESANTREN';
    `);
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0]!.data_sebelum.tipe_aksi).toBe("NONAKTIFKAN_REKENING_UTAMA");
    expect(auditRes.rows[0]!.data_sebelum.rekening.is_active).toBe(true);
    expect(auditRes.rows[0]!.data_sesudah.tipe_aksi).toBe("NONAKTIFKAN_REKENING_UTAMA");
    expect(auditRes.rows[0]!.data_sesudah.rekening.is_active).toBe(false);
  });

  it("5. Otorisasi Ketat: Role tidak berhak (TU, Wali, Bendahara, Asatidz) DITOLAK saat aktivasi/penonaktifan", async () => {
    const resInsert = await db.query<{ id: string }>(`
      INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama, is_active)
      VALUES ('Bank Syariah Indonesia (BSI)', '451', '7112233445', 'Yayasan Abu Manshur BSI', false)
      RETURNING id;
    `);
    const idRek = resInsert.rows[0]!.id;

    const unauthorizedRoles = [
      { id: TU_USER_ID, name: "TU" },
      { id: WALI_USER_ID, name: "Wali" },
      { id: BENDAHARA_ID, name: "Bendahara" },
      { id: ASATIDZ_ID, name: "Asatidz" },
    ];

    for (const user of unauthorizedRoles) {
      await setAuthUser(user.id);

      await expect(
        db.query(`
          SELECT public.rpc_aktifkan_rekening_pesantren_v1('${idRek}')
        `)
      ).rejects.toThrow("Akses ditolak");
    }

    // Tanpa login (auth.uid() NULL) juga harus ditolak
    await setAuthUser(null);
    await expect(
      db.query(`
        SELECT public.rpc_aktifkan_rekening_pesantren_v1('${idRek}')
      `)
    ).rejects.toThrow("Akses ditolak");
  });

  it("6. Perlindungan Snapshot Historis: Transaksi yang menggunakan rekening tetap utuh", async () => {
    const resInsert = await db.query<{ id: string }>(`
      INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama, is_active)
      VALUES ('Bank Syariah Indonesia (BSI)', '451', '7112233445', 'Yayasan Abu Manshur BSI', true)
      RETURNING id;
    `);
    const idRek = resInsert.rows[0]!.id;

    // Catat transaksi menggunakan snapshot rekening ini
    await db.query(`
      INSERT INTO public.transaksi_pembayaran (
        kode_transaksi, wali_id, total_nominal, status, rekening_tujuan_snapshot
      ) VALUES (
        'TRX-HIST-001',
        '${WALI_USER_ID}',
        1500000,
        'DISETUJUI',
        jsonb_build_object(
          'id', '${idRek}',
          'nama_bank', 'Bank Syariah Indonesia (BSI)',
          'nomor_rekening', '7112233445',
          'atas_nama', 'Yayasan Abu Manshur BSI'
        )
      );
    `);

    // Nonaktifkan rekening
    await setAuthUser(SUPERADMIN_ID);
    await db.query(`SELECT public.rpc_nonaktifkan_rekening_pesantren_v1('${idRek}');`);

    // Transaksi historis tetap utuh dengan snapshot nomor rekening awal
    const tx = await db.query<{ rekening_tujuan_snapshot: any }>(`
      SELECT rekening_tujuan_snapshot FROM public.transaksi_pembayaran WHERE kode_transaksi = 'TRX-HIST-001';
    `);
    expect(tx.rows[0]!.rekening_tujuan_snapshot.nomor_rekening).toBe("7112233445");
    expect(tx.rows[0]!.rekening_tujuan_snapshot.nama_bank).toBe("Bank Syariah Indonesia (BSI)");
  });

  it("7. SWR In-Memory Caching AdministrasiService: Mengembalikan data seketika tanpa network overhead", async () => {
    const service = new AdministrasiService();

    // Cache clearing
    AdministrasiService.clearRekeningCache();

    // Dalam mode demo / test environment
    const list1 = await service.getRekeningList();
    expect(Array.isArray(list1)).toBe(true);

    const start = performance.now();
    const list2 = await service.getRekeningList();
    const duration = performance.now() - start;

    // Subsequent retrieval dari memory cache harus seketika (<10ms)
    expect(duration).toBeLessThan(20);
    expect(list2).toEqual(list1);
  });
});
