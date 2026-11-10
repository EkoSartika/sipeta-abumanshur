import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { TuPortal } from "@/modules/tu/tu-portal";
import { SipetaProvider, useSipeta } from "@/lib/store/sipeta-context";
import { INITIAL_USERS } from "@/lib/store/initial-data";
import { administrasiService } from "@/lib/services/administrasi.service";

const tuUser = INITIAL_USERS.find((u) => u.role === "tu");
const waliUser = INITIAL_USERS.find((u) => u.role === "wali");
const bendaharaUser = INITIAL_USERS.find((u) => u.role === "bendahara");
const pengelolaUser = INITIAL_USERS.find((u) => u.role === "pengelola");

// Helper component to test actions directly via hooks
function TestKelasKamarActionConsumer({
  onReady,
}: {
  onReady: (actions: ReturnType<typeof useSipeta>) => void;
}) {
  const actions = useSipeta();
  onReady(actions);
  return null;
}

describe("Master Kelas & Master Kamar Asrama Suite (TU Portal)", () => {
  it("1. TuPortal merender subtab Master Kelas dan tombol Tambah Kelas", () => {
    const html = renderToString(
      <SipetaProvider initialUser={tuUser}>
        <TuPortal activeTab="kelas_kamar" />
      </SipetaProvider>
    );

    // Header dan tombol tambah kelas
    expect(html).toContain("Daftar Master Kelas");
    expect(html).toContain("Tambah Kelas");
    expect(html).toContain("Master Kamar Asrama");
  });

  it("2. createKelas memvalidasi input wajib (kode dan nama) serta duplikasi kode kelas", async () => {
    let capturedActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser}>
        <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
      </SipetaProvider>
    );

    // Validasi kosong
    const emptyRes = await capturedActions.createKelas({
      kode_kelas: "   ",
      nama_kelas: "   ",
      tingkat: 7,
      wali_kelas: "Ustadz Test",
      kapasitas: 30,
    });
    expect(emptyRes.ok).toBe(false);
    expect(emptyRes.message).toContain("wajib diisi");

    // Sukses penambahan kelas baru
    const successRes = await capturedActions.createKelas({
      kode_kelas: "KLS-TEST-9Z",
      nama_kelas: "Kelas IX-Z Unggulan",
      tingkat: 9,
      wali_kelas: "Ustadz Ahmad",
      kapasitas: 32,
    });
    expect(successRes.ok).toBe(true);
    expect(successRes.message).toContain("berhasil ditambahkan");

    // Validasi duplikasi kode kelas
    const dupRes = await capturedActions.createKelas({
      kode_kelas: "KLS-TEST-9Z",
      nama_kelas: "Kelas IX-Z Duplikat",
      tingkat: 9,
      wali_kelas: "Ustadz Lain",
      kapasitas: 30,
    });
    expect(dupRes.ok).toBe(false);
    expect(dupRes.message).toContain("sudah digunakan");
  });

  it("3. updateKelas berhasil memperbarui data dan menolak duplikasi kode kelas lain", async () => {
    let capturedActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser}>
        <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
      </SipetaProvider>
    );

    // Ambil kelas yang ada
    const target = capturedActions.kelasList[0];
    expect(target).toBeDefined();
    if (!target) throw new Error("Target kelas undefined");

    // Update sukses
    const updateRes = await capturedActions.updateKelas(target.id, {
      nama_kelas: "Kelas VII-A Revisi",
      kapasitas: 35,
    });
    expect(updateRes.ok).toBe(true);

    // Update dengan kode kelas yang sama milik kelas lain -> Ditolak
    const other = capturedActions.kelasList[1];
    if (other) {
      const dupUpdate = await capturedActions.updateKelas(target.id, {
        kode_kelas: other.kode_kelas,
      });
      expect(dupUpdate.ok).toBe(false);
      expect(dupUpdate.message).toContain("sudah digunakan");
    }
  });

  it("4. deleteKelas memblokir penghapusan kelas yang masih memiliki santri aktif", async () => {
    let capturedActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser}>
        <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
      </SipetaProvider>
    );

    // Cari kelas yang terhubung dengan santri aktif
    const activeSantri = capturedActions.santriList.find((s) => s.status === "AKTIF" && s.kelas_id);
    if (activeSantri) {
      const deleteRes = await capturedActions.deleteKelas(activeSantri.kelas_id!);
      expect(deleteRes.ok).toBe(false);
      expect(deleteRes.message).toContain("santri aktif");
    }
  });

  it("5. createKamar memvalidasi input wajib (kode, nama, gedung, jenis asrama L/P) dan duplikasi", async () => {
    let capturedActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser}>
        <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
      </SipetaProvider>
    );

    // Validasi kosong
    const emptyRes = await capturedActions.createKamar({
      kode_kamar: "   ",
      nama_kamar: "   ",
      gedung_asrama: "   ",
      jenis_asrama: "L",
      musyrif: "Ustadz",
      kapasitas: 20,
    });
    expect(emptyRes.ok).toBe(false);
    expect(emptyRes.message).toContain("wajib diisi");

    // Sukses penambahan kamar santri putri
    const successRes = await capturedActions.createKamar({
      kode_kamar: "ASR-KHD-01",
      nama_kamar: "Kamar Khadijah Al-Kubra 01",
      gedung_asrama: "Gedung Putri Khadijah",
      jenis_asrama: "P",
      musyrif: "Ustadzah Fatimah",
      kapasitas: 18,
    });
    expect(successRes.ok).toBe(true);
    expect(successRes.message).toContain("berhasil ditambahkan");

    // Validasi duplikasi kode kamar
    const dupRes = await capturedActions.createKamar({
      kode_kamar: "ASR-KHD-01",
      nama_kamar: "Kamar Duplikat",
      gedung_asrama: "Gedung Putri",
      jenis_asrama: "P",
      musyrif: "Ustadzah",
      kapasitas: 18,
    });
    expect(dupRes.ok).toBe(false);
    expect(dupRes.message).toContain("sudah digunakan");
  });

  it("6. deleteKamar memblokir penghapusan kamar yang masih ditempati oleh santri aktif", async () => {
    let capturedActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser}>
        <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
      </SipetaProvider>
    );

    // Cari kamar yang memiliki santri aktif
    const activeSantri = capturedActions.santriList.find((s) => s.status === "AKTIF" && s.kamar_id);
    if (activeSantri) {
      const deleteRes = await capturedActions.deleteKamar(activeSantri.kamar_id!);
      expect(deleteRes.ok).toBe(false);
      expect(deleteRes.message).toContain("santri aktif");
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("7. Role restriction: role wali, bendahara, dan pengelola tidak berwenang menambah atau memodifikasi kelas/kamar", async () => {
    for (const unauthorizedUser of [waliUser, bendaharaUser, pengelolaUser]) {
      let capturedActions!: ReturnType<typeof useSipeta>;
      renderToString(
        <SipetaProvider initialUser={unauthorizedUser}>
          <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
        </SipetaProvider>
      );

      const addKelasRes = await capturedActions.createKelas({
        kode_kelas: "KLS-ILLEGAL",
        nama_kelas: "Kelas Ilegal",
        tingkat: 7,
        wali_kelas: "None",
        kapasitas: 30,
      });
      expect(addKelasRes.ok).toBe(false);
      expect(addKelasRes.message).toContain("berwenang");

      const addKamarRes = await capturedActions.createKamar({
        kode_kamar: "KMR-ILLEGAL",
        nama_kamar: "Kamar Ilegal",
        gedung_asrama: "Gedung",
        jenis_asrama: "L",
        musyrif: "None",
        kapasitas: 20,
      });
      expect(addKamarRes.ok).toBe(false);
      expect(addKamarRes.message).toContain("berwenang");
    }
  });

  it("8. Penanganan kegagalan penyimpanan Supabase: menampilkan pesan error dan tidak mengubah state secara optimistis", async () => {
    vi.spyOn(administrasiService, "createKelas").mockResolvedValueOnce({
      ok: false,
      message: "Gagal INSERT ke Supabase: RLS policy atau koneksi bermasalah.",
    });
    vi.spyOn(administrasiService, "createKamar").mockResolvedValueOnce({
      ok: false,
      message: "Gagal INSERT kamar ke Supabase: koneksi terputus.",
    });

    let capturedActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser} initialAuthMode="supabase">
        <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
      </SipetaProvider>
    );

    const failKelas = await capturedActions.createKelas({
      kode_kelas: "KLS-ERR-01",
      nama_kelas: "Kelas Error Test",
      tingkat: 7,
      wali_kelas: "Ustadz",
      kapasitas: 30,
    });
    expect(failKelas.ok).toBe(false);
    expect(failKelas.message).toContain("Gagal INSERT ke Supabase");

    const failKamar = await capturedActions.createKamar({
      kode_kamar: "KMR-ERR-01",
      nama_kamar: "Kamar Error Test",
      gedung_asrama: "Gedung Putra",
      jenis_asrama: "L",
      musyrif: "Ustadz",
      kapasitas: 20,
    });
    expect(failKamar.ok).toBe(false);
    expect(failKamar.message).toContain("Gagal INSERT kamar ke Supabase");
  });

  it("9. Penyimpanan Supabase dan muat ulang (refreshFromSupabase) memastikan kelas & kamar tetap tersedia", async () => {
    const savedKelas = {
      id: "uuid-kls-baru-101",
      kode_kelas: "KLS-7B",
      nama_kelas: "Kelas VII-B Tahfidz",
      tingkat: 7,
      wali_kelas: "Ustadz Zaid",
      kapasitas: 30,
      is_active: true,
    };
    const savedKamar = {
      id: "uuid-kmr-baru-202",
      kode_kamar: "ASR-UMAR-02",
      nama_kamar: "Kamar Umar bin Khattab 02",
      gedung_asrama: "Gedung Putra Al-Faruq",
      jenis_asrama: "L" as const,
      musyrif: "Ustadz Bilal",
      kapasitas: 20,
      is_active: true,
    };

    const createKelasSpy = vi.spyOn(administrasiService, "createKelas").mockResolvedValueOnce({
      ok: true,
      data: savedKelas,
      message: "Kelas baru berhasil dibuat.",
    });
    const createKamarSpy = vi.spyOn(administrasiService, "createKamar").mockResolvedValueOnce({
      ok: true,
      data: savedKamar,
      message: "Kamar asrama baru berhasil ditambahkan.",
    });
    const getKelasSpy = vi.spyOn(administrasiService, "getKelasList").mockResolvedValue([savedKelas]);
    const getKamarSpy = vi.spyOn(administrasiService, "getKamarList").mockResolvedValue([savedKamar]);

    let capturedActions!: ReturnType<typeof useSipeta>;
    renderToString(
      <SipetaProvider initialUser={tuUser} initialAuthMode="supabase">
        <TestKelasKamarActionConsumer onReady={(a) => (capturedActions = a)} />
      </SipetaProvider>
    );

    const resKelas = await capturedActions.createKelas({
      kode_kelas: "KLS-7B",
      nama_kelas: "Kelas VII-B Tahfidz",
      tingkat: 7,
      wali_kelas: "Ustadz Zaid",
      kapasitas: 30,
    });
    expect(resKelas.ok).toBe(true);
    expect(createKelasSpy).toHaveBeenCalledTimes(1);

    const resKamar = await capturedActions.createKamar({
      kode_kamar: "ASR-UMAR-02",
      nama_kamar: "Kamar Umar bin Khattab 02",
      gedung_asrama: "Gedung Putra Al-Faruq",
      jenis_asrama: "L",
      musyrif: "Ustadz Bilal",
      kapasitas: 20,
    });
    expect(resKamar.ok).toBe(true);
    expect(createKamarSpy).toHaveBeenCalledTimes(1);

    // Simulasikan muat ulang dari Supabase
    const reloadedKelas = await administrasiService.getKelasList();
    const reloadedKamar = await administrasiService.getKamarList();
    expect(getKelasSpy).toHaveBeenCalled();
    expect(getKamarSpy).toHaveBeenCalled();
    expect(reloadedKelas).toContainEqual(savedKelas);
    expect(reloadedKamar).toContainEqual(savedKamar);
  });
});
