// ============================================================================
// SIPETA - API Route Transaksi Keuangan & Top-Up Uang Saku
// Melayani persistensi server-side atomik untuk:
// 1. Checkout pembayaran tagihan & alokasi multi-tagihan
// 2. Pengajuan top-up uang saku dari wali santri
// 3. Verifikasi pembayaran & verifikasi top-up oleh Bendahara
// 4. Pembacaan transaksi tersinkronisasi untuk Wali dan Bendahara
// Sesuai Bagian E PRD & Kebijakan Integritas Keuangan Pesantren
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

// Helper untuk memastikan rekening resmi pesantren selalu tersedia
async function ensureRekeningResmiAktif(adminClient: any) {
  const { data: existing } = await adminClient
    .from("rekening_pesantren")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  // Jika belum ada di database, inisialisasi satu rekening resmi aktif
  const defaultRekening = {
    nama_bank: "Bank Syariah Indonesia (BSI)",
    kode_bank: "451",
    nomor_rekening: "7141234567",
    atas_nama: "Pondok Pesantren Modern Abu Manshur",
    catatan_instruksi: "Transfer via ATM, Mobile Banking, atau Teller.",
    is_active: true,
  };

  const { data: created, error } = await adminClient
    .from("rekening_pesantren")
    .insert(defaultRekening)
    .select()
    .single();

  if (error || !created) {
    return defaultRekening;
  }
  return created;
}

// Helper upload base64 ke Supabase Storage (Private Bucket)
async function uploadBase64ToStorage(
  adminClient: any,
  bucket: string,
  storagePath: string,
  base64OrUrl: string
): Promise<string> {
  if (!base64OrUrl || !base64OrUrl.startsWith("data:")) {
    // Bukan data URL (sudah berupa storage path atau url eksternal)
    return base64OrUrl;
  }

  try {
    const matches = base64OrUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64OrUrl;
    }

    const contentType = matches[1] || "image/jpeg";
    const base64Data = matches[2];
    if (!base64Data) {
      return base64OrUrl;
    }
    const buffer = Buffer.from(base64Data, "base64");

    const { data, error } = await adminClient.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error || !data?.path) {
      console.warn(`Gagal upload base64 ke ${bucket}:`, error?.message);
      return base64OrUrl;
    }

    return data.path;
  } catch (err) {
    console.error("Exception upload base64:", err);
    return base64OrUrl;
  }
}

// ----------------------------------------------------------------------------
// GET: Pembacaan Transaksi dan Pengajuan Top-Up Terpusat
// ----------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabase belum dihubungkan." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, message: "Akses ditolak: Anda harus login terlebih dahulu." },
      { status: 401 }
    );
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, message: "Klien admin Supabase tidak tersedia." }, { status: 500 });
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return NextResponse.json(
      { ok: false, message: "Profil pengguna tidak aktif atau tidak ditemukan." },
      { status: 403 }
    );
  }

  // VALIDASI ROLE SERVER-SIDE KETAT
  // Role 'pengelola' (Asatidz) dan 'tu' DILARANG KERAS mengakses data transaksi keuangan
  if (profile.role === "pengelola") {
    return NextResponse.json(
      { ok: false, message: "Akses ditolak: Role Asatidz (Pengelola) tidak memiliki wewenang mengakses data transaksi keuangan." },
      { status: 403 }
    );
  }

  if (profile.role === "tu") {
    return NextResponse.json(
      { ok: false, message: "Akses ditolak: Role Tata Usaha (TU) tidak memiliki wewenang mengakses data transaksi keuangan." },
      { status: 403 }
    );
  }

  if (!["wali", "bendahara", "admin", "superadmin"].includes(profile.role)) {
    return NextResponse.json(
      { ok: false, message: "Akses ditolak: Role Anda tidak memiliki wewenang mengakses modul keuangan." },
      { status: 403 }
    );
  }

  try {
    const url = new URL(request.url);
    const santriIdParam = url.searchParams.get("santri_id");

    let santriFilter: string | null = santriIdParam;
    let waliSantriIds: string[] = [];

    // Jika wali, kunci ketat pada santri miliknya
    if (profile.role === "wali") {
      const { data: waliSantriList } = await adminClient
        .from("wali_santri")
        .select("santri_id")
        .eq("user_id", user.id);

      waliSantriIds = (waliSantriList ?? []).map((w: any) => w.santri_id);
      if (waliSantriIds.length === 0) {
        return NextResponse.json({
          ok: true,
          transaksiPembayaranList: [],
          pengajuanUangSakuList: [],
        });
      }

      if (santriIdParam) {
        // Tolak jika wali mencoba memanipulasi santri_id milik wali lain
        if (!waliSantriIds.includes(santriIdParam)) {
          return NextResponse.json(
            { ok: false, message: "Akses ditolak: Anda tidak memiliki akses ke data santri tersebut." },
            { status: 403 }
          );
        }
        santriFilter = santriIdParam;
      } else {
        santriFilter = null;
      }
    }

    // 1. Ambil Transaksi Pembayaran beserta Alokasi & Tagihan
    let trxQuery = adminClient
      .from("transaksi_pembayaran")
      .select("*, santri:santri_id(id, nis, nama_lengkap), alokasi:alokasi_pembayaran(*, tagihan:tagihan_id(id, judul_tagihan, sisa_tagihan, nominal_tagihan))")
      .order("created_at", { ascending: false });

    if (profile.role === "wali") {
      if (santriFilter) {
        trxQuery = trxQuery.eq("santri_id", santriFilter);
      } else {
        trxQuery = trxQuery.in("santri_id", waliSantriIds);
      }
    } else if (santriFilter) {
      trxQuery = trxQuery.eq("santri_id", santriFilter);
    }

    const { data: trxList, error: trxErr } = await trxQuery;
    if (trxErr) throw trxErr;

    // 2. Ambil Pengajuan Top-up Uang Saku
    let topupQuery = adminClient
      .from("pengajuan_uang_saku")
      .select("*, santri:santri_id(id, nis, nama_lengkap), wali:wali_user_id(id, nama_lengkap, email)")
      .order("created_at", { ascending: false });

    if (profile.role === "wali") {
      if (santriFilter) {
        topupQuery = topupQuery.eq("santri_id", santriFilter);
      } else {
        topupQuery = topupQuery.in("santri_id", waliSantriIds);
      }
    } else if (santriFilter) {
      topupQuery = topupQuery.eq("santri_id", santriFilter);
    }

    const { data: topupList, error: topupErr } = await topupQuery;
    if (topupErr) throw topupErr;

    return NextResponse.json({
      ok: true,
      transaksiPembayaranList: (trxList ?? []).map((row: any) => ({
        ...row,
        bukti_transfer_url: row.bukti_transfer_path || row.bukti_transfer_url || "",
        bukti_transfer_path: row.bukti_transfer_path || row.bukti_transfer_url || "",
        alokasi: Array.isArray(row.alokasi)
          ? row.alokasi.map((a: any) => ({
              ...a,
              judul_tagihan: a.judul_tagihan || a.tagihan?.judul_tagihan || "Tagihan Santri",
            }))
          : [],
      })),
      pengajuanUangSakuList: (topupList ?? []).map((row: any) => ({
        ...row,
        bukti_transfer_url: row.bukti_transfer_path || row.bukti_transfer_url || "",
        bukti_transfer_path: row.bukti_transfer_path || row.bukti_transfer_url || "",
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Gagal memuat data transaksi." }, { status: 500 });
  }
}

// ----------------------------------------------------------------------------
// POST: Eksekusi Atomik Checkout, Pengajuan Top-Up, dan Verifikasi Bendahara
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabase belum dihubungkan." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, message: "Akses ditolak: Anda harus login terlebih dahulu." },
      { status: 401 }
    );
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, message: "Klien admin Supabase tidak tersedia." }, { status: 500 });
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, nama_lengkap, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return NextResponse.json(
      { ok: false, message: "Profil pengguna tidak aktif atau tidak ditemukan." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const action = body.action;

    // =========================================================================
    // AKSI 1: CHECKOUT PEMBAYARAN TAGIHAN
    // =========================================================================
    if (action === "CHECKOUT_PEMBAYARAN") {
      let santriId = String(body.santri_id || "").trim();
      const items: Array<{ tagihan_id: string; nominal_bayar: number }> = body.items || [];
      const tanggalTransfer = body.tanggal_transfer || new Date().toISOString().slice(0, 10);
      const namaPengirim = String(body.nama_pengirim || "").trim();
      const bankPengirim = String(body.bank_pengirim || "").trim();
      let buktiTransfer = String(body.bukti_transfer || body.bukti_transfer_url || "").trim();

      if (items.length === 0) {
        return NextResponse.json({ ok: false, message: "Keranjang pembayaran masih kosong." }, { status: 400 });
      }

      if (!namaPengirim) {
        return NextResponse.json({ ok: false, message: "Nama pemilik rekening pengirim wajib diisi." }, { status: 400 });
      }

      // Verifikasi relasi santri bagi role Wali
      if (profile.role === "wali") {
        const { data: relasiWali } = await adminClient
          .from("wali_santri")
          .select("santri_id")
          .eq("user_id", user.id);

        const santriIds = (relasiWali ?? []).map((r: any) => r.santri_id);
        if (santriIds.length === 0) {
          return NextResponse.json({ ok: false, message: "Akun Anda belum terhubung dengan data santri resmi." }, { status: 403 });
        }

        if (!santriId || !santriIds.includes(santriId)) {
          santriId = santriIds[0];
        }
      }

      // Pastikan rekening pesantren tersedia
      const rekening = await ensureRekeningResmiAktif(adminClient);

      // Upload bukti transfer jika berupa base64
      let storagePath = buktiTransfer;
      if (buktiTransfer.startsWith("data:")) {
        const filename = `${santriId}/${Date.now()}-bukti-bayar.jpg`;
        storagePath = await uploadBase64ToStorage(adminClient, "bukti-pembayaran", filename, buktiTransfer);
      }

      // Validasi setiap tagihan di database
      let totalNominal = 0;
      const verifiedAlokasi: Array<{ tagihan_id: string; nominal_alokasi: number; judul_tagihan: string }> = [];

      for (const item of items) {
        const { data: tagihan, error: tghErr } = await adminClient
          .from("tagihan")
          .select("id, santri_id, judul_tagihan, sisa_tagihan, status, nominal_tagihan")
          .eq("id", item.tagihan_id)
          .maybeSingle();

        if (tghErr || !tagihan) {
          return NextResponse.json(
            { ok: false, message: `Tagihan ID "${item.tagihan_id}" tidak ditemukan di database.` },
            { status: 400 }
          );
        }

        if (tagihan.status === "LUNAS" || tagihan.sisa_tagihan <= 0) {
          return NextResponse.json(
            { ok: false, message: `Tagihan "${tagihan.judul_tagihan}" sudah lunas.` },
            { status: 400 }
          );
        }

        const nominal = Number(item.nominal_bayar);
        if (isNaN(nominal) || nominal <= 0) {
          return NextResponse.json({ ok: false, message: "Nominal pembayaran tagihan tidak valid." }, { status: 400 });
        }

        if (nominal > tagihan.sisa_tagihan) {
          return NextResponse.json(
            { ok: false, message: `Nominal pembayaran Rp ${nominal.toLocaleString("id-ID")} melebihi sisa tagihan "${tagihan.judul_tagihan}" (Rp ${tagihan.sisa_tagihan.toLocaleString("id-ID")}).` },
            { status: 400 }
          );
        }

        totalNominal += nominal;
        verifiedAlokasi.push({
          tagihan_id: tagihan.id,
          nominal_alokasi: nominal,
          judul_tagihan: tagihan.judul_tagihan,
        });
      }

      if (totalNominal <= 0) {
        return NextResponse.json({ ok: false, message: "Total nominal pembayaran harus lebih dari 0." }, { status: 400 });
      }

      // Nomor transaksi resmi atomik
      const tanggalCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const nomorTransaksi = `TRX-BYR-${tanggalCode}-${randomSuffix}`;
      const statusAwal = storagePath && storagePath.trim().length > 0 ? "MENUNGGU_VERIFIKASI" : "MENUNGGU_TRANSFER";

      // 1. Simpan Transaksi Pembayaran ke Supabase
      const { data: newTrx, error: insertTrxErr } = await adminClient
        .from("transaksi_pembayaran")
        .insert({
          nomor_transaksi: nomorTransaksi,
          santri_id: santriId,
          wali_user_id: user.id,
          total_nominal: totalNominal,
          rekening_tujuan_snapshot: {
            nama_bank: rekening.nama_bank,
            nomor_rekening: rekening.nomor_rekening,
            atas_nama: rekening.atas_nama,
          },
          tanggal_transfer: tanggalTransfer,
          nama_pengirim: namaPengirim,
          bank_pengirim: bankPengirim || "Bank Transfer",
          bukti_transfer_path: storagePath,
          status: statusAwal,
        })
        .select()
        .single();

      if (insertTrxErr || !newTrx) {
        return NextResponse.json(
          { ok: false, message: `Gagal menyimpan transaksi ke database: ${insertTrxErr?.message || "Unknown error"}` },
          { status: 500 }
        );
      }

      // 2. Simpan Alokasi Pembayaran
      const alokasiRows = verifiedAlokasi.map((a) => ({
        transaksi_id: newTrx.id,
        tagihan_id: a.tagihan_id,
        nominal_alokasi: a.nominal_alokasi,
      }));

      const { error: alokasiErr } = await adminClient
        .from("alokasi_pembayaran")
        .insert(alokasiRows);

      if (alokasiErr) {
        // Rollback transaksi jika alokasi gagal
        await adminClient.from("transaksi_pembayaran").delete().eq("id", newTrx.id);
        return NextResponse.json(
          { ok: false, message: `Gagal menyimpan alokasi tagihan: ${alokasiErr.message}` },
          { status: 500 }
        );
      }

      // 3. Bersihkan keranjang
      await adminClient
        .from("keranjang_pembayaran")
        .delete()
        .eq("wali_user_id", user.id)
        .eq("santri_id", santriId);

      // 4. Catat Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        user_role: profile.role,
        aktivitas: "CHECKOUT_PEMBAYARAN",
        jenis_objek: "transaksi_pembayaran",
        objek_id: newTrx.id,
        data_sesudah: {
          nomor_transaksi: nomorTransaksi,
          total_nominal: totalNominal,
          status: statusAwal,
          alokasi_count: verifiedAlokasi.length,
        },
        alasan_perubahan: `Pengajuan pembayaran tagihan via portal wali (${nomorTransaksi})`,
      });

      return NextResponse.json({
        ok: true,
        nomor_transaksi: nomorTransaksi,
        transaksi: {
          ...newTrx,
          bukti_transfer_url: storagePath,
          alokasi: verifiedAlokasi,
        },
        message: `Pengajuan pembayaran ${nomorTransaksi} sebesar Rp ${totalNominal.toLocaleString("id-ID")} berhasil disimpan permanen ke database dan menunggu verifikasi Bendahara.`,
      });
    }

    // =========================================================================
    // AKSI 2: PENGAJUAN TOP-UP UANG SAKU
    // =========================================================================
    if (action === "SUBMIT_TOPUP") {
      let santriId = String(body.santri_id || "").trim();
      const nominal = Number(body.nominal);
      const tanggalTransfer = body.tanggal_transfer || new Date().toISOString().slice(0, 10);
      const namaPengirim = String(body.nama_pengirim || "").trim();
      const bankPengirim = String(body.bank_pengirim || "").trim();
      const keterangan = String(body.keterangan || "Top-up uang saku via portal wali").trim();
      let buktiTransfer = String(body.bukti_transfer || body.bukti_transfer_url || "").trim();

      if (isNaN(nominal) || nominal <= 0) {
        return NextResponse.json({ ok: false, message: "Nominal top-up harus lebih dari 0." }, { status: 400 });
      }

      if (!namaPengirim) {
        return NextResponse.json({ ok: false, message: "Nama pengirim wajib diisi." }, { status: 400 });
      }

      // Verifikasi relasi santri bagi role Wali
      if (profile.role === "wali") {
        const { data: relasiWali } = await adminClient
          .from("wali_santri")
          .select("santri_id")
          .eq("user_id", user.id);

        const santriIds = (relasiWali ?? []).map((r: any) => r.santri_id);
        if (santriIds.length === 0) {
          return NextResponse.json({ ok: false, message: "Akun Anda belum terhubung dengan data santri resmi." }, { status: 403 });
        }

        if (!santriId || !santriIds.includes(santriId)) {
          santriId = santriIds[0];
        }
      }

      const rekening = await ensureRekeningResmiAktif(adminClient);

      // Upload bukti transfer jika berupa base64
      let storagePath = buktiTransfer;
      if (buktiTransfer.startsWith("data:")) {
        const filename = `${santriId}/${Date.now()}-bukti-topup.jpg`;
        storagePath = await uploadBase64ToStorage(adminClient, "bukti-uang-saku", filename, buktiTransfer);
      }

      const tanggalCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const nomorPengajuan = `TOPUP-${tanggalCode}-${randomSuffix}`;

      // Simpan Pengajuan Uang Saku ke Supabase
      const { data: newTopup, error: insertTopupErr } = await adminClient
        .from("pengajuan_uang_saku")
        .insert({
          nomor_pengajuan: nomorPengajuan,
          santri_id: santriId,
          wali_user_id: user.id,
          nominal: nominal,
          rekening_tujuan_snapshot: {
            nama_bank: rekening.nama_bank,
            nomor_rekening: rekening.nomor_rekening,
            atas_nama: rekening.atas_nama,
          },
          tanggal_transfer: tanggalTransfer,
          nama_pengirim: namaPengirim,
          bank_pengirim: bankPengirim || "Bank Transfer",
          bukti_transfer_path: storagePath,
          keterangan: keterangan,
          status: "MENUNGGU_VERIFIKASI",
        })
        .select()
        .single();

      if (insertTopupErr || !newTopup) {
        return NextResponse.json(
          { ok: false, message: `Gagal menyimpan pengajuan top-up ke database: ${insertTopupErr?.message || "Unknown error"}` },
          { status: 500 }
        );
      }

      // Catat Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        user_role: profile.role,
        aktivitas: "AJUKAN_TOPUP_UANG_SAKU",
        jenis_objek: "pengajuan_uang_saku",
        objek_id: newTopup.id,
        data_sesudah: {
          nomor_pengajuan: nomorPengajuan,
          nominal: nominal,
          status: "MENUNGGU_VERIFIKASI",
        },
        alasan_perubahan: `Pengajuan top-up uang saku santri (${nomorPengajuan})`,
      });

      return NextResponse.json({
        ok: true,
        nomor_pengajuan: nomorPengajuan,
        pengajuan: {
          ...newTopup,
          bukti_transfer_url: storagePath,
        },
        message: `Pengajuan top-up ${nomorPengajuan} sebesar Rp ${nominal.toLocaleString("id-ID")} berhasil disimpan permanen ke database dan menunggu verifikasi Bendahara.`,
      });
    }

    // =========================================================================
    // AKSI 3: VERIFIKASI PEMBAYARAN OLEH BENDAHARA
    // =========================================================================
    if (action === "VERIFIKASI_PEMBAYARAN") {
      if (profile.role !== "bendahara" && profile.role !== "superadmin") {
        return NextResponse.json({ ok: false, message: "Akses ditolak: Hanya Bendahara yang berwenang memverifikasi pembayaran." }, { status: 403 });
      }

      const transaksiId = String(body.transaksi_id || "").trim();
      const keputusan = body.keputusan as "DISETUJUI" | "DITOLAK";
      const catatan = String(body.catatan || "").trim();

      if (!transaksiId || !["DISETUJUI", "DITOLAK"].includes(keputusan)) {
        return NextResponse.json({ ok: false, message: "ID transaksi dan keputusan valid (DISETUJUI / DITOLAK) wajib disertakan." }, { status: 400 });
      }

      if (keputusan === "DITOLAK" && catatan.length < 3) {
        return NextResponse.json({ ok: false, message: "Alasan penolakan wajib diisi minimal 3 karakter." }, { status: 400 });
      }

      // Ambil transaksi
      const { data: trx, error: trxErr } = await adminClient
        .from("transaksi_pembayaran")
        .select("*, alokasi:alokasi_pembayaran(*)")
        .eq("id", transaksiId)
        .maybeSingle();

      if (trxErr || !trx) {
        return NextResponse.json({ ok: false, message: "Transaksi pembayaran tidak ditemukan." }, { status: 404 });
      }

      if (trx.status !== "MENUNGGU_VERIFIKASI") {
        return NextResponse.json(
          { ok: false, message: `Transaksi ${trx.nomor_transaksi} sudah diproses sebelumnya dengan status ${trx.status}.` },
          { status: 400 }
        );
      }

      if (keputusan === "DISETUJUI") {
        // Periksa dan perbarui setiap tagihan yang dialokasikan
        const alokasiList = trx.alokasi || [];
        for (const alk of alokasiList) {
          const { data: bill } = await adminClient
            .from("tagihan")
            .select("id, judul_tagihan, total_terbayar, nominal_tagihan, sisa_tagihan")
            .eq("id", alk.tagihan_id)
            .maybeSingle();

          if (!bill) continue;

          const totalTerbayarBaru = Number(bill.total_terbayar) + Number(alk.nominal_alokasi);
          const sisaBaru = Number(bill.nominal_tagihan) - totalTerbayarBaru;
          const statusBaru = sisaBaru <= 0 ? "LUNAS" : "DIBAYAR_SEBAGIAN";

          // Sisa_tagihan adalah kolom generated selalu di Postgres, jadi update hanya total_terbayar dan status
          await adminClient
            .from("tagihan")
            .update({
              total_terbayar: totalTerbayarBaru,
              status: statusBaru,
              updated_at: new Date().toISOString(),
            })
            .eq("id", bill.id);
        }
      }

      // Update status transaksi pembayaran
      const { error: updateTrxErr } = await adminClient
        .from("transaksi_pembayaran")
        .update({
          status: keputusan,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          catatan_verifikasi: catatan || (keputusan === "DISETUJUI" ? "Bukti transfer sah dan dana diterima." : "Ditolak oleh Bendahara."),
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaksiId);

      if (updateTrxErr) {
        return NextResponse.json({ ok: false, message: `Gagal memperbarui status transaksi: ${updateTrxErr.message}` }, { status: 500 });
      }

      // Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        user_role: profile.role,
        aktivitas: `VERIFIKASI_PEMBAYARAN_${keputusan}`,
        jenis_objek: "transaksi_pembayaran",
        objek_id: transaksiId,
        data_sebelum: { status: trx.status },
        data_sesudah: { status: keputusan, verified_by: user.id },
        alasan_perubahan: catatan || `Verifikasi pembayaran oleh ${profile.nama_lengkap}`,
      });

      return NextResponse.json({
        ok: true,
        message: `Transaksi ${trx.nomor_transaksi} berhasil ${keputusan === "DISETUJUI" ? "disetujui dan tagihan santri telah diperbarui" : "ditolak"}.`,
      });
    }

    // =========================================================================
    // AKSI 4: VERIFIKASI TOP-UP UANG SAKU OLEH BENDAHARA
    // =========================================================================
    if (action === "VERIFIKASI_TOPUP") {
      if (profile.role !== "bendahara" && profile.role !== "superadmin") {
        return NextResponse.json({ ok: false, message: "Akses ditolak: Hanya Bendahara yang berwenang memverifikasi top-up uang saku." }, { status: 403 });
      }

      const pengajuanId = String(body.pengajuan_id || "").trim();
      const keputusan = body.keputusan as "DISETUJUI" | "DITOLAK";
      const catatan = String(body.catatan || "").trim();

      if (!pengajuanId || !["DISETUJUI", "DITOLAK"].includes(keputusan)) {
        return NextResponse.json({ ok: false, message: "ID pengajuan dan keputusan valid wajib disertakan." }, { status: 400 });
      }

      const { data: pengajuan, error: pErr } = await adminClient
        .from("pengajuan_uang_saku")
        .select("*")
        .eq("id", pengajuanId)
        .maybeSingle();

      if (pErr || !pengajuan) {
        return NextResponse.json({ ok: false, message: "Pengajuan top-up uang saku tidak ditemukan." }, { status: 404 });
      }

      if (pengajuan.status !== "MENUNGGU_VERIFIKASI") {
        return NextResponse.json(
          { ok: false, message: `Pengajuan ${pengajuan.nomor_pengajuan} sudah diproses sebelumnya (${pengajuan.status}).` },
          { status: 400 }
        );
      }

      if (keputusan === "DISETUJUI") {
        const nominal = Number(pengajuan.nominal);

        // Ambil atau buat saldo uang saku
        const { data: saldoExisting } = await adminClient
          .from("saldo_uang_saku")
          .select("*")
          .eq("santri_id", pengajuan.santri_id)
          .maybeSingle();

        const saldoSebelum = Number(saldoExisting?.saldo_saat_ini || 0);
        const totalMasukLama = Number(saldoExisting?.total_masuk || 0);
        const totalKeluarLama = Number(saldoExisting?.total_keluar || 0);
        const totalPenyesuaianLama = Number(saldoExisting?.total_penyesuaian || 0);

        const saldoSesudah = saldoSebelum + nominal;
        const totalMasukBaru = totalMasukLama + nominal;

        // Upsert saldo uang saku
        await adminClient.from("saldo_uang_saku").upsert(
          {
            santri_id: pengajuan.santri_id,
            saldo_saat_ini: saldoSesudah,
            total_masuk: totalMasukBaru,
            total_keluar: totalKeluarLama,
            total_penyesuaian: totalPenyesuaianLama,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "santri_id" }
        );

        // Catat ke Mutasi Ledger Uang Saku
        const nomorMutasi = `MUT-TOP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        await adminClient.from("mutasi_uang_saku").insert({
          nomor_transaksi: nomorMutasi,
          santri_id: pengajuan.santri_id,
          jenis_mutasi: "TOPUP",
          nominal: nominal,
          saldo_sebelum: saldoSebelum,
          saldo_sesudah: saldoSesudah,
          keterangan: `Top-up disetujui: ${pengajuan.nomor_pengajuan}`,
          petugas_id: user.id,
          referensi_pengajuan_id: pengajuan.id,
        });
      }

      // Update status pengajuan
      await adminClient
        .from("pengajuan_uang_saku")
        .update({
          status: keputusan,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          catatan_verifikasi: catatan || (keputusan === "DISETUJUI" ? "Top-up disetujui dan saldo santri telah ditambahkan." : "Ditolak oleh Bendahara."),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pengajuanId);

      // Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        user_role: profile.role,
        aktivitas: `VERIFIKASI_TOPUP_SAKU_${keputusan}`,
        jenis_objek: "pengajuan_uang_saku",
        objek_id: pengajuanId,
        data_sebelum: { status: pengajuan.status },
        data_sesudah: { status: keputusan, verified_by: user.id },
        alasan_perubahan: catatan || `Verifikasi top-up uang saku oleh ${profile.nama_lengkap}`,
      });

      return NextResponse.json({
        ok: true,
        message: `Pengajuan top-up ${pengajuan.nomor_pengajuan} berhasil ${keputusan === "DISETUJUI" ? "disetujui dan saldo santri telah ditambahkan" : "ditolak"}.`,
      });
    }

    return NextResponse.json({ ok: false, message: `Aksi "${action}" tidak dikenal.` }, { status: 400 });
  } catch (err: any) {
    console.error("Error API Keuangan:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Terjadi kesalahan internal server." }, { status: 500 });
  }
}

