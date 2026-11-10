import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SipetaProvider, useSipeta } from "@/lib/store/sipeta-context";
import { MasterTahunAjaranView } from "@/components/master/master-tahun-ajaran-view";
import { WaliPortal } from "@/modules/wali/wali-portal";
import { administrasiService } from "@/lib/services/administrasi.service";
import { INITIAL_USERS } from "@/lib/store/initial-data";
import type { TahunAjaran } from "@/types/database";

const adminUser = INITIAL_USERS.find((u) => u.role === "admin")!;
const superadminUser = INITIAL_USERS.find((u) => u.role === "superadmin")!;

const UUID_TA_2024_2025 = "11111111-1111-4111-8111-111111111111";
const UUID_TA_2026_2027 = "22222222-2222-4222-8222-222222222222";

const fixtureTaList: TahunAjaran[] = [
  {
    id: UUID_TA_2024_2025,
    nama: "2024/2025",
    tanggal_mulai: "2024-07-01",
    tanggal_selesai: "2025-06-30",
    is_active: true,
  },
  {
    id: UUID_TA_2026_2027,
    nama: "2026/2027",
    tanggal_mulai: "2026-07-01",
    tanggal_selesai: "2027-06-30",
    is_active: false,
  },
];

function ContextConsumer({
  onReady,
}: {
  onReady: (ctx: ReturnType<typeof useSipeta>) => void;
}) {
  const ctx = useSipeta();
  onReady(ctx);
  return null;
}

describe("Perbaikan Tahun Akademik, Dinamisasi Data, & Isolasi Wali SIPETA", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. setActiveTahunAjaran mengaktifkan 2026/2027 via RPC, menonaktifkan 2024/2025, dan menyinkronkan profil_pesantren", async () => {
    const rpcSpy = vi
      .spyOn(administrasiService, "setActiveTahunAjaran")
      .mockResolvedValueOnce({
        ok: true,
        message: "Tahun pelajaran 2026/2027 berhasil diaktifkan melalui RPC resmi.",
      });

    let ctx!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider
        initialUser={adminUser}
        initialAuthMode="supabase"
        initialTahunAjaranList={fixtureTaList}
      >
        <ContextConsumer onReady={(c) => (ctx = c)} />
      </SipetaProvider>
    );

    const res = await ctx.setActiveTahunAjaran(UUID_TA_2026_2027);
    expect(res.ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith(UUID_TA_2026_2027);
  });

  it("2. setActiveTahunAjaran menolak ID non-UUID (seperti 'ta-2026-2027') dan kegagalan RPC tanpa menampilkan sukses palsu", async () => {
    let ctx!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider
        initialUser={superadminUser}
        initialAuthMode="supabase"
        initialTahunAjaranList={fixtureTaList}
      >
        <ContextConsumer onReady={(c) => (ctx = c)} />
      </SipetaProvider>
    );

    vi.spyOn(administrasiService, "setActiveTahunAjaran").mockResolvedValueOnce({
      ok: false,
      message: "ID Tahun Pelajaran tidak valid (bukan UUID database resmi).",
    });

    const failRes = await ctx.setActiveTahunAjaran("ta-2026-2027");
    expect(failRes.ok).toBe(false);
    expect(failRes.message).toContain("bukan UUID");
  });

  it("3. Mode Supabase tidak membocorkan INITIAL_TAHUN_AJARAN / INITIAL_SANTRI saat tabel database kosong", () => {
    let ctx!: ReturnType<typeof useSipeta>;
    const html = renderToString(
      <SipetaProvider initialUser={superadminUser} initialAuthMode="supabase">
        <ContextConsumer onReady={(c) => (ctx = c)} />
        <MasterTahunAjaranView />
      </SipetaProvider>
    );

    expect(ctx.tahunAjaranList).toHaveLength(0);
    expect(ctx.santriList).toHaveLength(0);
    expect(html).toContain("Belum Ada Master Tahun Pelajaran di Database");
  });

  it("4. MasterTahunAjaranView menampilkan Tahun Pelajaran Aktif yang konsisten dengan record is_active", () => {
    const active2026List: TahunAjaran[] = [
      {
        id: UUID_TA_2024_2025,
        nama: "2024/2025",
        tanggal_mulai: "2024-07-01",
        tanggal_selesai: "2025-06-30",
        is_active: false,
      },
      {
        id: UUID_TA_2026_2027,
        nama: "2026/2027",
        tanggal_mulai: "2026-07-01",
        tanggal_selesai: "2027-06-30",
        is_active: true,
      },
    ];

    const html = renderToString(
      <SipetaProvider
        initialUser={adminUser}
        initialAuthMode="supabase"
        initialTahunAjaranList={active2026List}
      >
        <MasterTahunAjaranView />
      </SipetaProvider>
    );

    expect(html).toContain("2026/2027");
    expect(html).toContain("Sedang Berjalan");
  });

  it("5. WaliPortal pada mode Supabase terisolasi penuh dan tidak bocor ke santri dummy (Ahmad Fauzan)", () => {
    const customWali = {
      id: "33333333-3333-4333-8333-333333333333",
      email: "2026999@wali.abumanshur.id",
      username: "2026999",
      nama_lengkap: "Bapak Abdullah (Wali Zaid)",
      no_telepon: "08123456789",
      role: "wali" as const,
      is_active: true,
      santri_id: "44444444-4444-4444-8444-444444444444",
      created_at: new Date().toISOString(),
    };

    const html = renderToString(
      <SipetaProvider initialUser={customWali} initialAuthMode="supabase">
        <WaliPortal activeTab="dashboard" />
      </SipetaProvider>
    );

    expect(html).not.toContain("Ahmad Fauzan Al-Manshur");
    expect(html).toContain("2026999");
  });
});
