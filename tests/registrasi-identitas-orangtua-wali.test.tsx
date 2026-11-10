import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SipetaProvider } from "@/lib/store/sipeta-context";
import { TuPortal } from "@/modules/tu/tu-portal";
import { WaliPortal } from "@/modules/wali/wali-portal";
import {
  packWaliAlamatWithFamilyMetadata,
  unpackWaliSantriRecord,
  isDataWaliLengkap,
} from "@/lib/utils/family-metadata";

// Mock Supabase client & server untuk menguji POST /api/admin-santri secara terisolasi (tanpa menyentuh Supabase Cloud)
const mockState = {
  existingSantri: null as any,
  existingWaliRel: null as any,
  existingProfile: null as any,
  failAtStep: null as "santri" | "auth" | "profiles" | "wali_santri" | null,
  insertedSantri: [] as any[],
  insertedProfiles: [] as any[],
  insertedWaliSantri: [] as any[],
  createdAuthUsers: [] as any[],
  deletedTables: [] as { table: string; column: string; value: any }[],
  deletedAuthUsers: [] as string[],
};

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  createSupabaseBrowserClient: () => ({}),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { role: "tu", is_active: true, nama_lengkap: "Staf TU" },
            error: null,
          }),
        }),
      }),
    }),
  }),
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: async (payload: any) => {
          if (mockState.failAtStep === "auth") {
            return { data: { user: null }, error: { message: "Simulated Auth Error" } };
          }
          const created = {
            id: "22222222-2222-4222-8222-222222222222",
            ...payload,
          };
          mockState.createdAuthUsers.push(created);
          return { data: { user: created }, error: null };
        },
        deleteUser: async (uid: string) => {
          mockState.deletedAuthUsers.push(uid);
          return { data: {}, error: null };
        },
      },
    },
    from: (table: string) => ({
      select: (_cols?: string, opts?: any) => ({
        eq: (col: string, val: any) => {
          if (opts?.head) {
            return Promise.resolve({ count: 0, error: null });
          }
          return {
            maybeSingle: async () => {
              if (table === "santri" && col === "nis") {
                return { data: mockState.existingSantri, error: null };
              }
              if (table === "wali_santri" && col === "santri_id") {
                return { data: mockState.existingWaliRel, error: null };
              }
              if (table === "profiles" && col === "username") {
                return { data: mockState.existingProfile, error: null };
              }
              if (table === "tahun_ajaran") {
                return {
                  data: { id: "33333333-3333-4333-8333-333333333333", nama: "2026/2027" },
                  error: null,
                };
              }
              if (table === "riwayat_penempatan_santri") {
                return { data: { id: "rw-1" }, error: null };
              }
              return { data: null, error: null };
            },
          };
        },
      }),
      insert: (payload: any) => {
        if (table === "santri") {
          return {
            select: () => ({
              single: async () => {
                if (mockState.failAtStep === "santri") {
                  return { data: null, error: { message: "Simulated Santri Insert Error" } };
                }
                const row = {
                  id: "44444444-4444-4444-8444-444444444444",
                  ...payload,
                };
                mockState.insertedSantri.push(row);
                return { data: row, error: null };
              },
            }),
          };
        }
        if (table === "profiles") {
          // Simulasikan skema asli PostgreSQL: public.profiles TIDAK memiliki kolom santri_id!
          if ("santri_id" in payload) {
            return Promise.resolve({
              error: {
                message: "Could not find the 'santri_id' column of 'profiles' in the schema cache",
              },
            });
          }
          if (mockState.failAtStep === "profiles") {
            return Promise.resolve({
              error: { message: "Simulated Profiles Insert Error" },
            });
          }
          mockState.insertedProfiles.push(payload);
          return Promise.resolve({ error: null });
        }
        if (table === "wali_santri") {
          if (mockState.failAtStep === "wali_santri") {
            return Promise.resolve({
              error: { message: "Simulated Wali Santri Insert Error" },
            });
          }
          mockState.insertedWaliSantri.push(payload);
          return Promise.resolve({ error: null });
        }
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        eq: async (col: string, val: any) => {
          mockState.deletedTables.push({ table, column: col, value: val });
          return { error: null };
        },
      }),
    }),
  }),
}));

import { POST } from "@/app/api/admin-santri/route";

const VALID_TA_UUID = "33333333-3333-4333-8333-333333333333";
const VALID_KELAS_UUID = "55555555-5555-4555-8555-555555555555";
const VALID_KAMAR_UUID = "66666666-6666-4666-8666-666666666666";

function buildPostRequest(body: Record<string, any>) {
  return new NextRequest("http://localhost:3000/api/admin-santri", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Perbaikan Registrasi Santri & Identitas Orang Tua/Wali SIPETA", () => {
  beforeEach(() => {
    mockState.existingSantri = null;
    mockState.existingWaliRel = null;
    mockState.existingProfile = null;
    mockState.failAtStep = null;
    mockState.insertedSantri = [];
    mockState.insertedProfiles = [];
    mockState.insertedWaliSantri = [];
    mockState.createdAuthUsers = [];
    mockState.deletedTables = [];
    mockState.deletedAuthUsers = [];
  });

  it("1. Registrasi santri dengan Ayah sebagai penanggung jawab akun menggunakan nama ayah & menyimpan data keluarga", async () => {
    const req = buildPostRequest({
      nis: "202607201",
      nama_lengkap: "Ahmad Zaki Al-Faruq",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-04-12",
      jenis_kelamin: "L",
      alamat: "Jl. Perjuangan No. 10 Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: {
        nama_lengkap: "H. Sulaiman Al-Faruq",
        no_telepon: "081211112222",
        pekerjaan: "Wiraswasta",
      },
      ibu: {
        nama_lengkap: "Hj. Maryam Zahra",
        no_telepon: "081233334444",
        pekerjaan: "Guru",
      },
      data_wali: null,
      penanggung_jawab: "Ayah",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.penanggung_jawab).toBe("Ayah");
    expect(json.data.nama_akun_wali).toBe("H. Sulaiman Al-Faruq");
    expect(json.data.wali_username).toBe("202607201");

    // Pastikan public.profiles TIDAK dikirimi kolom santri_id
    expect(mockState.insertedProfiles).toHaveLength(1);
    const insertedProf = mockState.insertedProfiles[0];
    expect("santri_id" in insertedProf).toBe(false);
    expect(insertedProf.nama_lengkap).toBe("H. Sulaiman Al-Faruq");
    expect(insertedProf.username).toBe("202607201");
    expect(insertedProf.must_change_password).toBe(true);

    // Pastikan relasi 1:1 dan identitas keluarga tersimpan di public.wali_santri
    expect(mockState.insertedWaliSantri).toHaveLength(1);
    const unpackedWali = unpackWaliSantriRecord({
      id: "w-1",
      ...mockState.insertedWaliSantri[0],
    });
    expect(unpackedWali.santri_id).toBe("44444444-4444-4444-8444-444444444444");
    expect(unpackedWali.user_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(unpackedWali.penanggung_jawab).toBe("Ayah");
    expect(unpackedWali.nama_lengkap).toBe("H. Sulaiman Al-Faruq");
    expect(unpackedWali.nama_ayah).toBe("H. Sulaiman Al-Faruq");
    expect(unpackedWali.pekerjaan_ayah).toBe("Wiraswasta");
    expect(unpackedWali.nama_ibu).toBe("Hj. Maryam Zahra");
    expect(unpackedWali.pekerjaan_ibu).toBe("Guru");
    expect(unpackedWali.alamat).toBe("Jl. Perjuangan No. 10 Cirebon");
  });

  it("2. Registrasi santri dengan Ibu sebagai penanggung jawab akun menggunakan nama ibu", async () => {
    const req = buildPostRequest({
      nis: "202607202",
      nama_lengkap: "Nabila Khairunnisa",
      tempat_lahir: "Kuningan",
      tanggal_lahir: "2013-08-20",
      jenis_kelamin: "P",
      alamat: "Jl. Siliwangi No. 45 Kuningan",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: {
        nama_lengkap: "H. Burhanuddin",
        no_telepon: "",
        pekerjaan: "Petani",
      },
      ibu: {
        nama_lengkap: "Hj. Aisyah Humaira",
        no_telepon: "081355556666",
        pekerjaan: "Pedagang",
      },
      data_wali: null,
      penanggung_jawab: "Ibu",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.penanggung_jawab).toBe("Ibu");
    expect(json.data.nama_akun_wali).toBe("Hj. Aisyah Humaira");

    const insertedProf = mockState.insertedProfiles[0];
    expect(insertedProf.nama_lengkap).toBe("Hj. Aisyah Humaira");
    expect(insertedProf.no_telepon).toBe("081355556666");

    const unpackedWali = unpackWaliSantriRecord({
      id: "w-2",
      ...mockState.insertedWaliSantri[0],
    });
    expect(unpackedWali.penanggung_jawab).toBe("Ibu");
    expect(unpackedWali.hubungan).toBe("Ibu");
    expect(unpackedWali.nama_ayah).toBe("H. Burhanuddin");
    expect(unpackedWali.nama_ibu).toBe("Hj. Aisyah Humaira");
  });

  it("3. Registrasi santri dengan Wali sebagai penanggung jawab akun saat data wali lengkap", async () => {
    const req = buildPostRequest({
      nis: "202607203",
      nama_lengkap: "Muhammad Luthfi Hakim",
      tempat_lahir: "Majalengka",
      tanggal_lahir: "2013-01-15",
      jenis_kelamin: "L",
      alamat: "Jl. KH Abdul Halim Majalengka",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: {
        nama_lengkap: "H. Hasan Basri",
        no_telepon: "",
        pekerjaan: "Wiraswasta",
      },
      ibu: {
        nama_lengkap: "Hj. Khadijah",
        no_telepon: "",
        pekerjaan: "Ibu Rumah Tangga",
      },
      data_wali: {
        nama_lengkap: "H. Ridwan Kamil",
        hubungan: "Paman",
        no_telepon: "081577778888",
      },
      penanggung_jawab: "Wali",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.penanggung_jawab).toBe("Wali");
    expect(json.data.nama_akun_wali).toBe("H. Ridwan Kamil");

    const unpackedWali = unpackWaliSantriRecord({
      id: "w-3",
      ...mockState.insertedWaliSantri[0],
    });
    expect(unpackedWali.penanggung_jawab).toBe("Wali");
    expect(unpackedWali.nama_ayah).toBe("H. Hasan Basri");
    expect(unpackedWali.nama_ibu).toBe("Hj. Khadijah");
    expect(unpackedWali.nama_wali).toBe("H. Ridwan Kamil");
    expect(unpackedWali.hubungan_wali_detail).toBe("Paman");
    expect(unpackedWali.no_hp_wali).toBe("081577778888");
  });

  it("4. Menolak pilihan penanggung jawab akun = Wali jika Data Wali kosong atau belum lengkap", async () => {
    const req = buildPostRequest({
      nis: "202607204",
      nama_lengkap: "Santri Wali Kosong",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-02-10",
      jenis_kelamin: "L",
      alamat: "Jl. Raya Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: { nama_lengkap: "H. Abdullah" },
      ibu: { nama_lengkap: "Hj. Aminah" },
      data_wali: null,
      penanggung_jawab: "Wali",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toMatch(/Data Wali/i);
    expect(mockState.insertedSantri).toHaveLength(0);
  });

  it("5. Menolak registrasi jika Nama Lengkap Ayah atau Nama Lengkap Ibu kosong", async () => {
    const reqNoAyah = buildPostRequest({
      nis: "202607205",
      nama_lengkap: "Santri Tanpa Ayah",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-03-10",
      jenis_kelamin: "L",
      alamat: "Jl. Raya Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: { nama_lengkap: "" },
      ibu: { nama_lengkap: "Hj. Aminah" },
      penanggung_jawab: "Ibu",
    });

    const res1 = await POST(reqNoAyah);
    const json1 = await res1.json();
    expect(res1.status).toBe(400);
    expect(json1.ok).toBe(false);
    expect(json1.message).toMatch(/Nama lengkap ayah wajib diisi/i);

    const reqNoIbu = buildPostRequest({
      nis: "202607206",
      nama_lengkap: "Santri Tanpa Ibu",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-03-10",
      jenis_kelamin: "L",
      alamat: "Jl. Raya Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: { nama_lengkap: "H. Abdullah" },
      ibu: { nama_lengkap: "" },
      penanggung_jawab: "Ayah",
    });

    const res2 = await POST(reqNoIbu);
    const json2 = await res2.json();
    expect(res2.status).toBe(400);
    expect(json2.ok).toBe(false);
    expect(json2.message).toMatch(/Nama lengkap ibu wajib diisi/i);
  });

  it("6. Pembuatan akun wali berbasis NIS (username = NIS, password awal = NIS) dan must_change_password = true", async () => {
    const req = buildPostRequest({
      nis: "202607207",
      nama_lengkap: "Santri Kredensial NIS",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-05-10",
      jenis_kelamin: "L",
      alamat: "Jl. Raya Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: { nama_lengkap: "H. Manshur" },
      ibu: { nama_lengkap: "Hj. Halimah" },
      penanggung_jawab: "Ayah",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockState.createdAuthUsers).toHaveLength(1);
    expect(mockState.createdAuthUsers[0].password).toBe("202607207");
    expect(mockState.createdAuthUsers[0].user_metadata.username).toBe("202607207");
    expect(mockState.createdAuthUsers[0].user_metadata.must_change_password).toBe(true);
    expect(mockState.insertedProfiles[0].username).toBe("202607207");
    expect(mockState.insertedProfiles[0].must_change_password).toBe(true);
  });

  it("7. Keterhubungan akurat 1:1 antara santri <-> wali_santri <-> profiles", async () => {
    const req = buildPostRequest({
      nis: "202607208",
      nama_lengkap: "Santri Relasi Akurat",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-05-10",
      jenis_kelamin: "L",
      alamat: "Jl. Raya Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: { nama_lengkap: "H. Ibrahim" },
      ibu: { nama_lengkap: "Hj. Sarah" },
      penanggung_jawab: "Ayah",
    });

    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);

    const santriRow = mockState.insertedSantri[0];
    const profileRow = mockState.insertedProfiles[0];
    const waliRelRow = mockState.insertedWaliSantri[0];

    expect(waliRelRow.santri_id).toBe(santriRow.id);
    expect(waliRelRow.user_id).toBe(profileRow.id);
  });

  it("8. Menolak duplikasi NIS santri yang sudah terdaftar aktif dengan akun wali", async () => {
    mockState.existingSantri = { id: "snt-existing", nis: "202607201" };
    mockState.existingWaliRel = { id: "wali-existing" };

    const req = buildPostRequest({
      nis: "202607201",
      nama_lengkap: "Santri Duplikat",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-05-10",
      jenis_kelamin: "L",
      alamat: "Jl. Raya Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: { nama_lengkap: "H. Ibrahim" },
      ibu: { nama_lengkap: "Hj. Sarah" },
      penanggung_jawab: "Ayah",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.message).toMatch(/sudah terdaftar/i);
  });

  it("9. Rollback bersih jika salah satu tahap gagal (menghapus wali_santri, profiles, auth.users, riwayat_penempatan_santri, saldo_uang_saku, dan santri)", async () => {
    mockState.failAtStep = "wali_santri";

    const req = buildPostRequest({
      nis: "202607209",
      nama_lengkap: "Santri Uji Rollback",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-05-10",
      jenis_kelamin: "L",
      alamat: "Jl. Raya Cirebon",
      tahun_masuk: 2026,
      tahun_ajaran_id: VALID_TA_UUID,
      kelas_id: VALID_KELAS_UUID,
      kamar_id: VALID_KAMAR_UUID,
      ayah: { nama_lengkap: "H. Yusuf" },
      ibu: { nama_lengkap: "Hj. Zulaikha" },
      penanggung_jawab: "Ayah",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.message).toMatch(/Rollback/i);

    // Pastikan auth user dihapus
    expect(mockState.deletedAuthUsers).toContain("22222222-2222-4222-8222-222222222222");

    // Pastikan profiles, wali_santri, saldo_uang_saku, riwayat_penempatan_santri, dan santri dihapus bersih
    const deletedTableNames = mockState.deletedTables.map((d) => d.table);
    expect(deletedTableNames).toContain("profiles");
    expect(deletedTableNames).toContain("wali_santri");
    expect(deletedTableNames).toContain("saldo_uang_saku");
    expect(deletedTableNames).toContain("riwayat_penempatan_santri");
    expect(deletedTableNames).toContain("santri");
  });

  it("10. Render UI Formulir Registrasi TU & Portal Wali Santri menampilkan struktur identitas keluarga baru", () => {
    const tuHtml = renderToStaticMarkup(
      <SipetaProvider
        initialUser={{
          id: "usr-tu-01",
          nama_lengkap: "Staf Tata Usaha",
          email: "tu@sipeta.internal",
          username: "tu_pondok",
          no_telepon: "081200001111",
          role: "tu",
          is_active: true,
          created_at: "2026-01-01T00:00:00Z",
        }}
        initialAuthMode="demo"
      >
        <TuPortal activeTab="tambah_santri" />
      </SipetaProvider>
    );

    expect(tuHtml).toContain("A. Data Ayah");
    expect(tuHtml).toContain("Nama Lengkap Ayah *");
    expect(tuHtml).toContain("B. Data Ibu");
    expect(tuHtml).toContain("Nama Lengkap Ibu *");
    expect(tuHtml).toContain("C. Data Wali (Opsional)");
    expect(tuHtml).toContain("Penanggung Jawab Akun Portal Orang Tua/Wali (1:1) *");

    const waliHtml = renderToStaticMarkup(
      <SipetaProvider
        initialUser={{
          id: "usr-wali-01",
          nama_lengkap: "H. Sulaiman Al-Faruq",
          email: "202407001@sipeta.internal",
          username: "202407001",
          no_telepon: "081211112222",
          role: "wali",
          is_active: true,
          santri_id: "snt-001",
          created_at: "2026-01-01T00:00:00Z",
        }}
        initialAuthMode="demo"
      >
        <WaliPortal activeTab="profil_santri" />
      </SipetaProvider>
    );

    expect(waliHtml).toContain("Informasi Keluarga &amp; Penanggung Jawab Akun");
    expect(waliHtml).toContain("Data Ayah:");
    expect(waliHtml).toContain("Data Ibu:");
  });
});
