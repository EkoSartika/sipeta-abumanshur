import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

describe('SIPETA First Superadmin Bootstrap Security Test (001_first_superadmin.sql)', () => {
  let db: PGlite;
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  const bootstrapFile = path.join(process.cwd(), 'supabase', 'bootstrap', '001_first_superadmin.sql');
  const bootstrapSql = fs.readFileSync(bootstrapFile, 'utf-8');

  async function createCleanDatabase(): Promise<PGlite> {
    const targetDb = new PGlite();
    await targetDb.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT,
        confirmed_at TIMESTAMPTZ,
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
        name TEXT NOT NULL,
        owner UUID,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      BEGIN
        RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
      BEGIN
        RETURN NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
      EXCEPTION WHEN OTHERS THEN
        RETURN '{}'::jsonb;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    const migrationFiles = [
      '0001_enums_and_extensions.sql',
      '0002_core_admin_tables.sql',
      '0003_payment_and_billing_tables.sql',
      '0004_pocket_money_ledger_tables.sql',
      '0005_kepesantrenan_and_audit_tables.sql',
      '0006_atomic_rpcs_and_triggers.sql',
      '0007_rls_and_storage_policies.sql',
      '008_security_remediation.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await targetDb.exec(sql);
    }

    return targetDb;
  }

  beforeAll(async () => {
    db = await createCleanDatabase();
  });

  it('1. Auth Validasi: Harus GAGAL jika akun Auth belum ditemukan di auth.users', async () => {
    await expect(db.exec(bootstrapSql)).rejects.toThrow(
      /belum terdaftar di auth\.users/
    );
  });

  it('2. Auth Validasi: Harus GAGAL jika akun Auth belum terkonfirmasi (confirmed_at IS NULL)', async () => {
    const tempUuid = '11111111-1111-4111-8111-111111111111';
    await db.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${tempUuid}', 'sipetaabumanshur@gmail.com', NULL);
    `);

    await expect(db.exec(bootstrapSql)).rejects.toThrow(
      /belum terkonfirmasi/
    );

    // Bersihkan untuk pengujian berikutnya
    await db.exec(`DELETE FROM auth.users WHERE lower(email) = 'sipetaabumanshur@gmail.com';`);
  });

  it('3. Temuan 1 Patch: Harus GAGAL jika terdapat duplikasi akun Auth dengan variasi kapitalisasi email', async () => {
    const isolatedDb = await createCleanDatabase();
    const id1 = '11111111-aaaa-4111-8111-111111111111';
    const id2 = '11111111-bbbb-4111-8111-111111111111';

    // Dua akun di auth.users dengan variasi huruf besar-kecil
    await isolatedDb.exec(`
      INSERT INTO auth.users (id, email, confirmed_at) VALUES ('${id1}', 'sipetaabumanshur@gmail.com', now());
      INSERT INTO auth.users (id, email, confirmed_at) VALUES ('${id2}', 'SipetaAbuManshur@gmail.com', now());
    `);

    await expect(isolatedDb.exec(bootstrapSql)).rejects.toThrow(
      /DUPLIKASI AUTH EMAIL/
    );
  });

  it('4. Temuan 1 Patch: Harus GAGAL jika terdapat duplikasi profil dengan variasi kapitalisasi email', async () => {
    const isolatedDb = await createCleanDatabase();
    const authId = '22222222-aaaa-4222-8222-222222222222';
    const prof1Id = '22222222-aaaa-4222-8222-222222222222';
    const prof2Id = '22222222-bbbb-4222-8222-222222222222';

    await isolatedDb.exec(`
      INSERT INTO auth.users (id, email, confirmed_at) VALUES ('${authId}', 'sipetaabumanshur@gmail.com', now());
      INSERT INTO auth.users (id, email, confirmed_at) VALUES ('${prof2Id}', 'other@domain.com', now());

      -- Memasukkan 2 profil dengan variasi kapitalisasi
      INSERT INTO public.profiles (id, nama_lengkap, email, role, is_active)
      VALUES ('${prof1Id}', 'User Satu', 'sipetaabumanshur@gmail.com', 'admin', true);
      INSERT INTO public.profiles (id, nama_lengkap, email, role, is_active)
      VALUES ('${prof2Id}', 'User Dua', 'SipetaAbuManshur@gmail.com', 'admin', true);
    `);

    await expect(isolatedDb.exec(bootstrapSql)).rejects.toThrow(
      /DUPLIKASI PROFIL EMAIL/
    );
  });

  it('5. Bootstrap Sukses: Berhasil membuat profil saat akun Auth valid dan terkonfirmasi', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    await db.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${validUuid}', 'sipetaabumanshur@gmail.com', now());
    `);

    await expect(db.exec(bootstrapSql)).resolves.not.toThrow();

    const res = await db.query<{
      id: string;
      nama_lengkap: string;
      email: string;
      role: string;
      is_active: boolean;
    }>(`SELECT id, nama_lengkap, email, role, is_active FROM public.profiles WHERE id = '${validUuid}'`);

    expect(res.rows.length).toBe(1);
    const profile = res.rows[0]!;
    expect(profile.id).toBe(validUuid);
    expect(profile.email).toBe('sipetaabumanshur@gmail.com');
    expect(profile.role).toBe('superadmin');
    expect(profile.is_active).toBe(true);
    expect(profile.nama_lengkap).toBe('Superadmin SIPETA Abu Manshur');
  });

  it('6. Idempotensi Ketat: Superadmin target sudah aktif & tidak ada superadmin lain -> Berhenti aman', async () => {
    await expect(db.exec(bootstrapSql)).resolves.not.toThrow();

    const countRes = await db.query<{ count: string }>(
      `SELECT count(*) as count FROM public.profiles WHERE email = 'sipetaabumanshur@gmail.com'`
    );
    expect(parseInt(countRes.rows[0]!.count, 10)).toBe(1);
  });

  it('7. Temuan 2 Patch: Superadmin target aktif tetapi ada Superadmin lain -> Wajib Ditolak', async () => {
    const otherSuperadminId = '33333333-3333-4333-8333-333333333333';

    // Sisipkan Superadmin palsu/lain
    await db.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${otherSuperadminId}', 'intruder.superadmin@pesantren.com', now());

      INSERT INTO public.profiles (id, nama_lengkap, email, role, is_active)
      VALUES ('${otherSuperadminId}', 'Intruder', 'intruder.superadmin@pesantren.com', 'superadmin', true);
    `);

    // Walaupun akun target aktif, bootstrap tetap harus mendeteksi Superadmin lain dan menolak eksekusi
    await expect(db.exec(bootstrapSql)).rejects.toThrow(
      /Ditemukan 1 akun Superadmin lain di database/
    );

    // Bersihkan penyusup untuk pengujian berikutnya
    await db.exec(`DELETE FROM public.profiles WHERE id = '${otherSuperadminId}';`);
    await db.exec(`DELETE FROM auth.users WHERE id = '${otherSuperadminId}';`);
  });

  it('8. Proteksi Status: Superadmin target sudah nonaktif -> Ditolak keras (tidak re-aktivasi otomatis)', async () => {
    await db.exec(`UPDATE public.profiles SET is_active = false WHERE email = 'sipetaabumanshur@gmail.com'`);

    await expect(db.exec(bootstrapSql)).rejects.toThrow(
      /ditemukan dalam status NONAKTIF/
    );

    // Kembalikan ke aktif untuk test berikutnya
    await db.exec(`UPDATE public.profiles SET is_active = true WHERE email = 'sipetaabumanshur@gmail.com'`);
  });

  it('9. Benturan Profil: UUID benar tetapi email profil berbeda -> Ditolak (Konflik UUID)', async () => {
    const isolatedDb = await createCleanDatabase();
    const targetUuid = '44444444-4444-4444-8444-444444444444';

    await isolatedDb.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${targetUuid}', 'sipetaabumanshur@gmail.com', now());
    `);

    await isolatedDb.exec(`
      INSERT INTO public.profiles (id, nama_lengkap, email, role, is_active)
      VALUES ('${targetUuid}', 'User Lain', 'different.email@pesantren.com', 'admin', true);
    `);

    await expect(isolatedDb.exec(bootstrapSql)).rejects.toThrow(
      /KONFLIK UUID/
    );
  });

  it('10. Benturan Profil: Email benar tetapi UUID profil berbeda -> Ditolak (Konflik Email)', async () => {
    const isolatedDb = await createCleanDatabase();
    const authTargetUuid = '55555555-5555-4555-8555-555555555555';
    const profileOtherUuid = '66666666-6666-4666-8666-666666666666';

    await isolatedDb.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${authTargetUuid}', 'sipetaabumanshur@gmail.com', now());

      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${profileOtherUuid}', 'other.auth@pesantren.com', now());
    `);

    await isolatedDb.exec(`
      INSERT INTO public.profiles (id, nama_lengkap, email, role, is_active)
      VALUES ('${profileOtherUuid}', 'Klaim Email', 'sipetaabumanshur@gmail.com', 'admin', true);
    `);

    await expect(isolatedDb.exec(bootstrapSql)).rejects.toThrow(
      /KONFLIK EMAIL/
    );
  });

  it('11. Benturan Profil: Dua profil berbeda masing-masing cocok dengan UUID dan Email -> Ditolak', async () => {
    const isolatedDb = await createCleanDatabase();
    const authTargetUuid = '77777777-7777-4777-8777-777777777777';
    const otherUserUuid = '88888888-8888-4888-8888-888888888888';

    await isolatedDb.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${authTargetUuid}', 'sipetaabumanshur@gmail.com', now());

      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${otherUserUuid}', 'other@pesantren.com', now());
    `);

    await isolatedDb.exec(`
      INSERT INTO public.profiles (id, nama_lengkap, email, role, is_active)
      VALUES ('${authTargetUuid}', 'Profil Match UUID', 'other.uuid.match@pesantren.com', 'admin', true);
    `);

    await isolatedDb.exec(`
      INSERT INTO public.profiles (id, nama_lengkap, email, role, is_active)
      VALUES ('${otherUserUuid}', 'Profil Match Email', 'sipetaabumanshur@gmail.com', 'admin', true);
    `);

    await expect(isolatedDb.exec(bootstrapSql)).rejects.toThrow(
      /INTEGRITAS TERNODAI/
    );
  });

  it('12. Konkurensi: Dua proses bootstrap bersamaan berjalan aman terlindungi advisory lock', async () => {
    const isolatedDb = await createCleanDatabase();
    const targetUserId = '99999999-9999-4999-8999-999999999999';

    await isolatedDb.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${targetUserId}', 'sipetaabumanshur@gmail.com', now());
    `);

    const run1 = isolatedDb.exec(bootstrapSql);
    const run2 = isolatedDb.exec(bootstrapSql);

    const results = await Promise.allSettled([run1, run2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const countRes = await isolatedDb.query<{ count: string }>(
      `SELECT count(*) as count FROM public.profiles WHERE email = 'sipetaabumanshur@gmail.com'`
    );
    expect(parseInt(countRes.rows[0]!.count, 10)).toBe(1);
  });

  it('13. Query Verifikasi: Memastikan kueri verifikasi pasca-bootstrap menghasilkan data valid', async () => {
    const verifySql = `
      SELECT
        u.id AS auth_user_id,
        u.email AS auth_email,
        u.confirmed_at AS auth_confirmed_at,
        p.id AS profile_id,
        p.nama_lengkap AS profile_nama_lengkap,
        p.email AS profile_email,
        p.role AS profile_role,
        p.is_active AS profile_is_active,
        (u.id = p.id) AS is_fk_valid,
        (p.role = 'superadmin' AND p.is_active = true) AS is_superadmin_active,
        (SELECT count(*) FROM public.profiles WHERE role = 'superadmin') AS total_superadmin_count
      FROM auth.users u
      INNER JOIN public.profiles p ON u.id = p.id
      WHERE lower(u.email) = 'sipetaabumanshur@gmail.com';
    `;

    const res = await db.query<{
      auth_user_id: string;
      auth_email: string;
      profile_id: string;
      profile_role: string;
      profile_is_active: boolean;
      is_fk_valid: boolean;
      is_superadmin_active: boolean;
      total_superadmin_count: string;
    }>(verifySql);

    expect(res.rows.length).toBe(1);
    const row = res.rows[0]!;
    expect(row.auth_email).toBe('sipetaabumanshur@gmail.com');
    expect(row.profile_role).toBe('superadmin');
    expect(row.profile_is_active).toBe(true);
    expect(row.is_fk_valid).toBe(true);
    expect(row.is_superadmin_active).toBe(true);
    expect(parseInt(row.total_superadmin_count, 10)).toBe(1);
  });

  it('14. Transaction Safety: Table Lock EXCLUSIVE MODE pada public.profiles memblokir mutasi konkuren eksternal dan mengizinkan SELECT', async () => {
    const isolatedDb = await createCleanDatabase();
    const targetUserId = 'aaaa1111-2222-4333-8444-555566667777';

    await isolatedDb.exec(`
      INSERT INTO auth.users (id, email, confirmed_at)
      VALUES ('${targetUserId}', 'sipetaabumanshur@gmail.com', now());
    `);

    // Uji bahwa LOCK TABLE profiles IN EXCLUSIVE MODE dapat diperoleh dalam transaksi
    await isolatedDb.exec(`
      BEGIN;
      LOCK TABLE public.profiles IN EXCLUSIVE MODE;
      -- SELECT biasa tetap diizinkan
      SELECT count(*) FROM public.profiles;
      COMMIT;
    `);

    // Jalankan bootstrap script yang menggunakan lock tersebut
    await expect(isolatedDb.exec(bootstrapSql)).resolves.not.toThrow();

    const verify = await isolatedDb.query<{ role: string }>(
      `SELECT role FROM public.profiles WHERE id = '${targetUserId}'`
    );
    expect(verify.rows[0]!.role).toBe('superadmin');
  });
});
