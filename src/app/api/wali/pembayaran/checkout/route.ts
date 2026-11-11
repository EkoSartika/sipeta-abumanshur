// ============================================================================
// SIPETA - API Route Dedicated Checkout Pembayaran Wali Santri
// Endpoint: POST /api/wali/pembayaran/checkout
//
// Menerapkan Idempotency Key berbasis UUID v4:
// 1. Menerima key dari header 'Idempotency-Key' atau request body 'idempotency_key'/'idempotencyKey'
// 2. Memvalidasi format UUID
// 3. Memastikan auth.uid() membawa sesi asli role wali via authenticated user client
// 4. Meneruskan ke RPC PostgreSQL rpc_checkout_pembayaran_v2 secara atomik
// 5. Menangani replay idempoten (is_idempotent_replay) & sanitasi error
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

// Regex UUID v4 / RFC 4122
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(val: string): boolean {
  return UUID_REGEX.test(val);
}

// Sanitasi error RPC agar aman untuk frontend dan tidak mengekspos struktur internal
function sanitizeRpcError(errorMessage: string | undefined): { status: number; message: string } {
  if (!errorMessage) {
    return { status: 400, message: "Terjadi kesalahan pada pemrosesan transaksi checkout di database." };
  }

  let clean = errorMessage;
  const match =
    clean.match(/RAISE EXCEPTION\s+['"]?([^'"]+)['"]?/i) ||
    clean.match(/ERROR:\s+(.+)$/m);
  if (match && match[1]) {
    clean = match[1].trim();
  }

  // Deteksi konflik idempotensi
  if (clean.includes("Konflik Idempotensi") || clean.includes("idx_transaksi_pembayaran_idempotency_key")) {
    return {
      status: 409,
      message: "Konflik Idempotensi: Idempotency key ini telah digunakan sebelumnya dengan parameter pembayaran yang berbeda.",
    };
  }

  if (clean.includes("Akses ditolak: Idempotency key terikat pada akun wali lain")) {
    return { status: 403, message: "Akses ditolak: Idempotency key terikat pada akun wali lain." };
  }

  if (clean.includes("Akses ditolak: Idempotency key terikat pada santri yang berbeda")) {
    return { status: 400, message: "Akses ditolak: Idempotency key terikat pada santri yang berbeda." };
  }

  if (clean.includes("violates check constraint") || clean.includes("violates foreign key")) {
    return { status: 400, message: "Data transaksi tidak memenuhi validasi aturan bisnis pesantren." };
  }

  return { status: 400, message: clean };
}

// Helper autentikasi JWT user client
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

  return { user, client: supabase, error: null };
}

// Upload bukti transfer base64 ke bucket private bukti-pembayaran
async function uploadBase64ToStorage(
  adminClient: any,
  bucket: string,
  storagePath: string,
  base64OrUrl: string
): Promise<string> {
  if (!base64OrUrl || !base64OrUrl.startsWith("data:")) {
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

    const { error } = await adminClient.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error("[Storage Upload Error]", error.message);
      return base64OrUrl;
    }

    return storagePath;
  } catch (err) {
    console.error("[Storage Upload Catch]", err);
    return base64OrUrl;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, client: userClient, error: authError } = await getAuthenticatedUserClient(request);
    if (authError || !user || !userClient) {
      return NextResponse.json(
        { ok: false, message: authError || "Akses ditolak: Pengguna tidak terautentikasi." },
        { status: 401 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Layanan database backend tidak tersedia." },
        { status: 500 }
      );
    }

    // Verifikasi profil pengguna dan role wali
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ ok: false, message: "Profil pengguna tidak ditemukan." }, { status: 403 });
    }

    if (profile.status !== "aktif") {
      return NextResponse.json({ ok: false, message: "Akun Anda saat ini tidak aktif." }, { status: 403 });
    }

    if (profile.role !== "wali") {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Hanya akun wali yang berhak melakukan checkout pembayaran." },
        { status: 403 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, message: "Payload JSON request tidak valid." }, { status: 400 });
    }

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

    // 2. Ekstraksi Field Checkout
    let santriId = String(body.santri_id || body.santriId || "").trim();
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

    // 3. Verifikasi Relasi Santri dengan Wali
    const { data: relasiWali } = await adminClient
      .from("wali_santri")
      .select("santri_id")
      .eq("user_id", user.id);

    const santriIds = (relasiWali ?? []).map((r: any) => r.santri_id);
    if (santriIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Akun Anda belum terhubung dengan data santri resmi mana pun." },
        { status: 403 }
      );
    }

    if (!santriId || !santriIds.includes(santriId)) {
      santriId = santriIds[0];
    }

    // 4. Unggah Bukti Transfer ke Supabase Storage jika Base64
    let storagePath = buktiTransfer;
    if (buktiTransfer.startsWith("data:")) {
      const filename = `${santriId}/${Date.now()}-bukti-bayar.jpg`;
      storagePath = await uploadBase64ToStorage(adminClient, "bukti-pembayaran", filename, buktiTransfer);
    }

    // 5. Format Payload Items untuk RPC
    const rpcItems = items.map((it) => ({
      tagihan_id: it.tagihan_id,
      nominal_bayar: Number(it.nominal_bayar),
    }));

    // 6. Eksekusi RPC rpc_checkout_pembayaran_v2 dengan Authenticated User Client
    const { data: rpcRes, error: rpcErr } = await userClient.rpc("rpc_checkout_pembayaran_v2", {
      p_santri_id: santriId,
      p_items: rpcItems,
      p_tanggal_transfer: tanggalTransfer,
      p_nama_pengirim: namaPengirim,
      p_bank_pengirim: bankPengirim || "Bank Transfer",
      p_bukti_transfer_path: storagePath || null,
      p_idempotency_key: idempotencyKey,
    });

    if (rpcErr) {
      const sanitized = sanitizeRpcError(rpcErr.message);
      return NextResponse.json({ ok: false, message: sanitized.message }, { status: sanitized.status });
    }

    if (!rpcRes || !rpcRes.ok) {
      const sanitized = sanitizeRpcError(rpcRes?.message || "Gagal melakukan checkout pembayaran.");
      return NextResponse.json({ ok: false, message: sanitized.message }, { status: sanitized.status });
    }

    // 7. Format Response dengan Informasi Idempotent Replay Eksplisit
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
        items: rpcItems,
      },
      message: isReplay
        ? `Pengajuan pembayaran ${rpcRes.nomor_transaksi} telah tercatat sebelumnya (Replay Idempoten).`
        : rpcRes.message || `Pengajuan pembayaran ${rpcRes.nomor_transaksi} berhasil disimpan dan menunggu verifikasi Bendahara.`,
    });
  } catch (error: any) {
    console.error("[API Checkout Error]", error);
    return NextResponse.json(
      { ok: false, message: "Terjadi kesalahan internal pada server saat memproses checkout pembayaran." },
      { status: 500 }
    );
  }
}
