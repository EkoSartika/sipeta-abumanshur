import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { TuPortal } from "@/modules/tu/tu-portal";
import { SipetaProvider, useSipeta } from "@/lib/store/sipeta-context";
import { INITIAL_USERS } from "@/lib/store/initial-data";
import { administrasiService } from "@/lib/services/administrasi.service";
import type { TahunAjaran } from "@/types/database";
import fs from "node:fs";
import path from "node:path";

const tuUser = INITIAL_USERS.find((u) => u.role === "tu");

const UUID_TA_2026_2027 = "a1b2c3d4-e5f6-4789-8012-3456789abcde";
const UUID_KELAS_7A = "11111111-2222-4333-8444-555555555555";
const UUID_KAMAR_AB01 = "66666666-7777-4888-8999-000000000000";

const fixtureTahunAjaranList: TahunAjaran[] = [
  {
    id: UUID_TA_2026_2027,
    nama: "2026/2027",
    tanggal_mulai: "2026-07-01",
    tanggal_selesai: "2027-06-30",
    is_active: true,
  },
];

function TestActionConsumer({
  onReady,
}: {
  onReady: (actions: ReturnType<typeof useSipeta>) => void;
}) {
  const actions = useSipeta();
  onReady(actions);
  return null;
}

describe("Registrasi Santri & Import Excel — Pemetaan UUID Tahun Pelajaran", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. UI menampilkan label Tahun Pelajaran '2026/2027', bukan UUID", () => {
    const html = renderToString(
      <SipetaProvider
        initialUser={tuUser}
        initialTahunAjaranList={fixtureTahunAjaranList}
      >
        <TuPortal activeTab="tambah_santri" />
      </SipetaProvider>
    );

    expect(html).toContain("Tahun Pelajaran: 2026/2027");
    expect(html).not.toContain(`Tahun Pelajaran: ${UUID_TA_2026_2027}`);
  });

  it("2. Payload registrasi santri mengirim UUID tahun pelajaran aktif (bukan 'ta-2026-2027' dan bukan label '2026/2027')", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          message: "Santri dan Akun Wali berhasil didaftarkan secara atomik.",
          data: {
            santri_id: "99999999-8888-4777-8666-555555555555",
            wali_username: "202607991",
            wali_user_id: "77777777-6666-4555-8444-333333333333",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    let captured!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider
        initialUser={tuUser}
        initialAuthMode="supabase"
        initialTahunAjaranList={fixtureTahunAjaranList}
      >
        <TestActionConsumer onReady={(a) => (captured = a)} />
      </SipetaProvider>
    );

    const res = await captured.createSantriWithWali({
      nis: "202607991",
      nama_lengkap: "Ahmad Fauzan Al-Manshur",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-04-12",
      jenis_kelamin: "L",
      alamat: "Jl. Pesantren No. 10, Cirebon",
      tahun_masuk: 2026,
      kelas_id: UUID_KELAS_7A,
      kamar_id: UUID_KAMAR_AB01,
      nama_wali: "H. Sulaiman",
      hubungan_wali: "Ayah",
      telepon_wali: "081234567890",
    });

    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, reqInit] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/admin-santri");
    const sentBody = JSON.parse(String(reqInit?.body));

    expect(sentBody.tahun_ajaran_id).toBe(UUID_TA_2026_2027);
    expect(sentBody.tahun_ajaran_id).not.toBe("ta-2026-2027");
    expect(sentBody.tahun_ajaran_id).not.toBe("2026/2027");
    expect(sentBody.kelas_id).toBe(UUID_KELAS_7A);
    expect(sentBody.kamar_id).toBe(UUID_KAMAR_AB01);
  });

  it("3. Label '2026/2027' tidak pernah disimpan sebagai UUID; otomatis dipetakan ke UUID atau ditolak jika tidak valid", async () => {
    let captured!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider
        initialUser={tuUser}
        initialTahunAjaranList={fixtureTahunAjaranList}
      >
        <TestActionConsumer onReady={(a) => (captured = a)} />
      </SipetaProvider>
    );

    // Jika label "2026/2027" dikirim, dipetakan ke UUID_TA_2026_2027
    const mappedRes = await captured.createSantriWithWali({
      nis: "202607992",
      nama_lengkap: "Santri Uji Pemetaan Label",
      tempat_lahir: "Bandung",
      tanggal_lahir: "2013-05-10",
      jenis_kelamin: "L",
      alamat: "Bandung",
      tahun_masuk: 2026,
      tahun_ajaran_id: "2026/2027",
      kelas_id: captured.kelasList[0]!.id,
      kamar_id: captured.kamarList[0]!.id,
      nama_wali: "Wali Uji",
      hubungan_wali: "Ayah",
      telepon_wali: "081299998888",
    });
    expect(mappedRes.ok).toBe(true);

    // Jika label tahun pelajaran yang tidak ada ("2099/2100") dikirim, ditolak dengan aman
    const invalidLabelRes = await captured.createSantriWithWali({
      nis: "202607993",
      nama_lengkap: "Santri Label Tidak Valid",
      tempat_lahir: "Bandung",
      tanggal_lahir: "2013-05-10",
      jenis_kelamin: "L",
      alamat: "Bandung",
      tahun_masuk: 2026,
      tahun_ajaran_id: "2099/2100",
      kelas_id: captured.kelasList[0]!.id,
      kamar_id: captured.kamarList[0]!.id,
      nama_wali: "Wali Uji",
      hubungan_wali: "Ayah",
      telepon_wali: "081299997777",
    });
    expect(invalidLabelRes.ok).toBe(false);
    expect(invalidLabelRes.message).toContain("tidak boleh digunakan sebagai UUID");
  });

  it("4. Kegagalan tahap transaksi atau ketiadaan tahun pelajaran aktif menghentikan registrasi dengan aman (Rollback)", async () => {
    // Skenario A: Tahun pelajaran aktif kosong
    let emptyTaActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser} initialTahunAjaranList={[]}>
        <TestActionConsumer onReady={(a) => (emptyTaActions = a)} />
      </SipetaProvider>
    );

    const noTaRes = await emptyTaActions.createSantriWithWali({
      nis: "202607994",
      nama_lengkap: "Santri Tanpa TA",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-01-01",
      jenis_kelamin: "L",
      alamat: "Cirebon",
      tahun_masuk: 2026,
      kelas_id: emptyTaActions.kelasList[0]!.id,
      kamar_id: emptyTaActions.kamarList[0]!.id,
      nama_wali: "Wali Tanpa TA",
      hubungan_wali: "Ayah",
      telepon_wali: "081211112222",
    });
    expect(noTaRes.ok).toBe(false);
    expect(noTaRes.message).toContain("Tahun Pelajaran aktif");

    // Skenario B: Server mengembalikan pesan Rollback saat salah satu tahap gagal
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          message:
            "Transaksi registrasi dibatalkan secara aman (Rollback): Gagal membuat akun auth wali: Simulasi kegagalan tahap B",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    );

    let supActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider
        initialUser={tuUser}
        initialAuthMode="supabase"
        initialTahunAjaranList={fixtureTahunAjaranList}
      >
        <TestActionConsumer onReady={(a) => (supActions = a)} />
      </SipetaProvider>
    );

    const rollbackRes = await supActions.createSantriWithWali({
      nis: "202607995",
      nama_lengkap: "Santri Uji Rollback",
      tempat_lahir: "Cirebon",
      tanggal_lahir: "2013-02-02",
      jenis_kelamin: "L",
      alamat: "Cirebon",
      tahun_masuk: 2026,
      kelas_id: UUID_KELAS_7A,
      kamar_id: UUID_KAMAR_AB01,
      nama_wali: "Wali Rollback",
      hubungan_wali: "Ayah",
      telepon_wali: "081233334444",
    });
    expect(rollbackRes.ok).toBe(false);
    expect(rollbackRes.message).toContain("Rollback");
  });

  it("5. Import Excel menggunakan pemetaan UUID tahun pelajaran aktif dan tidak memiliki hardcode 'ta-2026-2027'", async () => {
    const importSpy = vi
      .spyOn(administrasiService, "importSantriBatch")
      .mockResolvedValueOnce({
        ok: true,
        message: "Berhasil mengimport 1 santri.",
        report: {
          total_processed: 1,
          success_count: 1,
          failed_count: 0,
          wali_account_created_count: 1,
          results: [],
          imported_at: new Date().toISOString(),
        },
      });

    let captured!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider
        initialUser={tuUser}
        initialAuthMode="supabase"
        initialTahunAjaranList={fixtureTahunAjaranList}
      >
        <TestActionConsumer onReady={(a) => (captured = a)} />
      </SipetaProvider>
    );

    const importRes = await captured.importSantriBatch([
      {
        row_number: 2,
        nis: "202607996",
        nama_lengkap: "Santri Import Excel",
        jenis_kelamin: "L",
        tempat_lahir: "Kuningan",
        tanggal_lahir: "2013-08-17",
        kelas: "Kelas VII-A",
        kode_kelas: "KLS-7A",
        kamar: "ASR-AB-01",
        nama_wali: "Bapak Import",
        hubungan_wali: "Ayah",
        no_telepon_wali: "081255556666",
        alamat: "Kuningan, Jawa Barat",
      },
    ]);

    expect(importRes.ok).toBe(true);
    expect(importSpy).toHaveBeenCalledWith(expect.any(Array), UUID_TA_2026_2027);

    // Verifikasi statis pada kode endpoint server bahwa hardcode "ta-2026-2027" sudah dihapus
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/admin-santri/route.ts"),
      "utf-8"
    );
    const importRouteSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/admin-santri/import/route.ts"),
      "utf-8"
    );

    expect(routeSource).not.toContain('tahun_ajaran_id: "ta-2026-2027"');
    expect(importRouteSource).not.toContain('tahun_ajaran_id: "ta-2026-2027"');
    expect(routeSource).toContain("tahun_ajaran_id: resolvedTahunAjaranId");
    expect(importRouteSource).toContain("tahun_ajaran_id: rowTahunAjaranId");
  });
});
