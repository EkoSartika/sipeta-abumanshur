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
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import {
  isSupabaseConfigured,
  getSupabaseUrl,
  getSupabasePublishableKey,
} from "@/lib/supabase/client";

// Helper sanitasi pesan error dari PostgreSQL RPC agar informatif dan user-friendly
function sanitizeRpcError(errorMessage: string | undefined): string {
  if (!errorMessage) return "Terjadi kesalahan pada pemrosesan transaksi di database.";

  let clean = errorMessage;
  // Tangkap pesan dari PL/pgSQL RAISE EXCEPTION
  const match =
    clean.match(/RAISE EXCEPTION\s+['"]?([^'"]+)['"]?/i) ||
    clean.match(/ERROR:\s+(.+)$/m);
  if (match && match[1]) {
    clean = match[1].trim();
  }

  // Jika error masih mengandung detail constraint database internal
  if (clean.includes("violates check constraint") || clean.includes("violates foreign key")) {
    return "Data transaksi tidak memenuhi validasi aturan bisnis pesantren.";
  }

  if (clean.includes("idx_transaksi_pembayaran_idempotency_key")) {
    return "Konflik Idempotensi: Transaksi dengan idempotency key ini sedang atau telah diproses.";
  }

  return clean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(val: string): boolean {
  return UUID_REGEX.test(val);
}

// Helper untuk mendapatkan client Supabase yang membawa identitas JWT pengguna asli
async function getAuthenticatedUserClient(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, client: null, error: "Akses ditolak: Anda harus login terlebih dahulu." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const accessToken = session?.access_token || bearerToken;

  // Jika access token tersedia eksplisit, ikat ke header Authorization pada client
  if (accessToken && isSupabaseConfigured()) {
    const userClient = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return { user, client: userClient, error: null };
  }

  // Fallback ke server client SSR berbasis cookie
  return { user, client: supabase, error: null };
}

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

  // Ambil user dan Supabase client yang membawa identitas JWT pengguna asli
  const { user, client: userClient, error: clientErr } = await getAuthenticatedUserClient(request);
  if (clientErr || !user || !userClient) {
    return NextResponse.json(
      { ok: false, message: clientErr || "Akses ditolak: Anda harus login terlebih dahulu." },
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

  // VALIDASI ROLE SERVER-SIDE KETAT
  // Role 'pengelola' (Asatidz) dan 'tu' DILARANG KERAS melakukan aksi transaksi keuangan
  if (profile.role === "pengelola") {
    return NextResponse.json(
      { ok: false, message: "Akses ditolak: Role Asatidz (Pengelola) tidak memiliki wewenang transaksi keuangan." },
      { status: 403 }
    );
  }

  if (profile.role === "tu") {
    return NextResponse.json(
      { ok: false, message: "Akses ditolak: Role Tata Usaha (TU) tidak memiliki wewenang transaksi keuangan." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const action = body.action;

    // =========================================================================
    // AKSI 1: CHECKOUT PEMBAYARAN TAGIHAN (ATOMIC RPC MIGRATION 018)
    // =========================================================================
    if (action === "CHECKOUT_PEMBAYARAN") {
      // 1. Ekstraksi dan Validasi Idempotency Key
      const headerKey = request.headers.get("Idempotency-Key");
      const bodyKey = body.idempotency_key || body.idempotencyKey;
      const rawKey = headerKey || bodyKey || null;

      let idempotencyKey: string | null = null;
      if (rawKey) {
        const cleanKey = String(rawKey).trim();
        if (cleanKey.length > 0) {
          if (!isValidUUID(cleanKey)) {
            return NextResponse.json(
              { ok: false, message: "Format Idempotency-Key tidak valid. Harus berupa format UUID v4 standar." },
              { status: 400 }
            );
          }
          idempotencyKey = cleanKey;
        }
      }

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

      // Upload bukti transfer jika berupa base64 ke Supabase Storage (pertahankan file jika terjadi error RPC)
      let storagePath = buktiTransfer;
      if (buktiTransfer.startsWith("data:")) {
        const filename = `${santriId}/${Date.now()}-bukti-bayar.jpg`;
        storagePath = await uploadBase64ToStorage(adminClient, "bukti-pembayaran", filename, buktiTransfer);
      }

      // Format payload items untuk RPC
      const rpcItems = items.map((it) => ({
        tagihan_id: it.tagihan_id,
        nominal_bayar: Number(it.nominal_bayar),
      }));

      const rpcPayload: Record<string, any> = {
        p_santri_id: santriId,
        p_items: rpcItems,
        p_tanggal_transfer: tanggalTransfer,
        p_nama_pengirim: namaPengirim,
        p_bank_pengirim: bankPengirim || "Bank Transfer",
        p_bukti_transfer_path: storagePath || null,
      };
      if (idempotencyKey) {
        rpcPayload.p_idempotency_key = idempotencyKey;
      }

      // Panggil RPC rpc_checkout_pembayaran_v2 secara atomik menggunakan userClient (membawa auth.uid())
      const { data: rpcRes, error: rpcErr } = await userClient.rpc("rpc_checkout_pembayaran_v2", rpcPayload);

      if (rpcErr) {
        const cleanMsg = sanitizeRpcError(rpcErr.message);
        const isConflict = cleanMsg.includes("Konflik Idempotensi") || rpcErr.message.includes("Konflik Idempotensi");
        return NextResponse.json(
          { ok: false, message: cleanMsg },
          { status: isConflict ? 409 : 400 }
        );
      }

      if (!rpcRes || !rpcRes.ok) {
        const cleanMsg = sanitizeRpcError(rpcRes?.message || "Gagal melakukan checkout pembayaran.");
        const isConflict = cleanMsg.includes("Konflik Idempotensi");
        return NextResponse.json(
          { ok: false, message: cleanMsg },
          { status: isConflict ? 409 : 400 }
        );
      }

      const isReplay = rpcRes.is_idempotent_replay === true;
      return NextResponse.json({
        ok: true,
        transaksi_id: rpcRes.transaksi_id,
        nomor_transaksi: rpcRes.nomor_transaksi,
        total_nominal: rpcRes.total_nominal,
        status: rpcRes.status,
        is_idempotent_replay: isReplay,
        transaksi: {
          id: rpcRes.transaksi_id,
          nomor_transaksi: rpcRes.nomor_transaksi,
          santri_id: santriId,
          total_nominal: rpcRes.total_nominal,
          status: rpcRes.status,
          bukti_transfer_path: storagePath,
          bukti_transfer_url: storagePath,
          items: rpcItems,
        },
        message: isReplay
          ? `Pengajuan pembayaran ${rpcRes.nomor_transaksi} telah tercatat sebelumnya (Replay Idempoten).`
          : rpcRes.message || `Pengajuan pembayaran ${rpcRes.nomor_transaksi} berhasil disimpan permanen ke database dan menunggu verifikasi Bendahara.`,
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
    // AKSI 3: VERIFIKASI PEMBAYARAN OLEH BENDAHARA (ATOMIC RPC MIGRATION 018)
    // =========================================================================
    if (action === "VERIFIKASI_PEMBAYARAN") {
      if (profile.role !== "bendahara" && profile.role !== "superadmin") {
        return NextResponse.json(
          { ok: false, message: "Akses ditolak: Hanya Bendahara yang berwenang memverifikasi pembayaran." },
          { status: 403 }
        );
      }

      const transaksiId = String(body.transaksi_id || "").trim();
      const keputusan = body.keputusan as "DISETUJUI" | "DITOLAK";
      const catatan = String(body.catatan || "").trim();

      if (!transaksiId || !["DISETUJUI", "DITOLAK"].includes(keputusan)) {
        return NextResponse.json(
          { ok: false, message: "ID transaksi dan keputusan valid (DISETUJUI / DITOLAK) wajib disertakan." },
          { status: 400 }
        );
      }

      if (keputusan === "DITOLAK" && catatan.length < 3) {
        return NextResponse.json(
          { ok: false, message: "Alasan penolakan wajib diisi minimal 3 karakter." },
          { status: 400 }
        );
      }

      // Panggil RPC rpc_verifikasi_pembayaran_v2 secara atomik menggunakan userClient (membawa auth.uid())
      const { data: rpcRes, error: rpcErr } = await userClient.rpc("rpc_verifikasi_pembayaran_v2", {
        p_transaksi_id: transaksiId,
        p_keputusan: keputusan,
        p_catatan: catatan || (keputusan === "DISETUJUI" ? "Bukti transfer sah dan dana diterima." : "Ditolak oleh Bendahara."),
      });

      if (rpcErr) {
        return NextResponse.json(
          { ok: false, message: sanitizeRpcError(rpcErr.message) },
          { status: 400 }
        );
      }

      if (!rpcRes || !rpcRes.ok) {
        return NextResponse.json(
          { ok: false, message: rpcRes?.message || "Gagal memproses verifikasi transaksi." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        nomor_transaksi: rpcRes.nomor_transaksi,
        status: rpcRes.status,
        message: rpcRes.message || `Transaksi ${rpcRes.nomor_transaksi} berhasil ${keputusan === "DISETUJUI" ? "disetujui dan tagihan santri telah diperbarui" : "ditolak"}.`,
      });
    }

    // =========================================================================
    // AKSI 4: VERIFIKASI TOP-UP UANG SAKU OLEH BENDAHARA (ATOMIC RPC MIGRATION 018)
    // =========================================================================
    if (action === "VERIFIKASI_TOPUP") {
      if (profile.role !== "bendahara" && profile.role !== "superadmin") {
        return NextResponse.json(
          { ok: false, message: "Akses ditolak: Hanya Bendahara yang berwenang memverifikasi top-up uang saku." },
          { status: 403 }
        );
      }

      const pengajuanId = String(body.pengajuan_id || "").trim();
      const keputusan = body.keputusan as "DISETUJUI" | "DITOLAK";
      const catatan = String(body.catatan || "").trim();

      if (!pengajuanId || !["DISETUJUI", "DITOLAK"].includes(keputusan)) {
        return NextResponse.json(
          { ok: false, message: "ID pengajuan dan keputusan valid wajib disertakan." },
          { status: 400 }
        );
      }

      if (keputusan === "DITOLAK" && catatan.length < 3) {
        return NextResponse.json(
          { ok: false, message: "Alasan penolakan wajib diisi minimal 3 karakter." },
          { status: 400 }
        );
      }

      // Panggil RPC rpc_verifikasi_topup_uang_saku_v2 secara atomik menggunakan userClient (membawa auth.uid())
      const { data: rpcRes, error: rpcErr } = await userClient.rpc("rpc_verifikasi_topup_uang_saku_v2", {
        p_pengajuan_id: pengajuanId,
        p_keputusan: keputusan,
        p_catatan: catatan || (keputusan === "DISETUJUI" ? "Top-up disetujui dan saldo santri telah ditambahkan." : "Ditolak oleh Bendahara."),
      });

      if (rpcErr) {
        return NextResponse.json(
          { ok: false, message: sanitizeRpcError(rpcErr.message) },
          { status: 400 }
        );
      }

      if (!rpcRes || !rpcRes.ok) {
        return NextResponse.json(
          { ok: false, message: rpcRes?.message || "Gagal memproses verifikasi top-up." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        nomor_pengajuan: rpcRes.nomor_pengajuan,
        status: rpcRes.status,
        mutasi_id: rpcRes.mutasi_id,
        saldo_akhir: rpcRes.saldo_akhir,
        message: rpcRes.message || `Pengajuan top-up ${rpcRes.nomor_pengajuan} berhasil ${keputusan === "DISETUJUI" ? "disetujui dan saldo santri telah ditambahkan" : "ditolak"}.`,
      });
    }

    return NextResponse.json({ ok: false, message: `Aksi "${action}" tidak dikenal.` }, { status: 400 });
  } catch (err: any) {
    console.error("Error API Keuangan:", err);
    return NextResponse.json({ ok: false, message: err?.message || "Terjadi kesalahan internal server." }, { status: 500 });
  }
}

