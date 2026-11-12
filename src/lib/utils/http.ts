/**
 * Helper untuk parsing respons fetch HTTP yang tahan terhadap respons non-JSON
 * (misal status HTTP 413 "Request Entity Too Large", HTTP 502 Bad Gateway, atau HTML error dari Vercel/Cloudflare).
 */

export interface SafeHttpResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  message: string;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeHttpResponse<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get("content-type") || "";

    // 1. Tangani kasus Payload Too Large (HTTP 413)
    if (res.status === 413) {
      return {
        ok: false,
        status: 413,
        data: null,
        message:
          "Ukuran data atau file yang diunggah terlalu besar melebihi batas server (Request Entity Too Large). Sistem telah menyiapkan optimasi otomatis, silakan coba unggah kembali.",
      };
    }

    // 2. Tangani kasus Server Error umum
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return {
        ok: false,
        status: res.status,
        data: null,
        message: `Layanan server sedang mengalami kendala sementara (HTTP ${res.status}). Silakan coba beberapa saat lagi.`,
      };
    }

    // 3. Periksa apakah Content-Type mengembalikan JSON
    if (contentType.includes("application/json")) {
      try {
        const json = await res.json();
        return {
          ok: res.ok && json.ok !== false,
          status: res.status,
          data: json,
          message:
            json.message ||
            (res.ok ? "Berhasil." : `Permintaan gagal dengan status HTTP ${res.status}.`),
        };
      } catch (jsonErr: any) {
        return {
          ok: false,
          status: res.status,
          data: null,
          message: `Respons server tidak dapat diurai sebagai JSON: ${jsonErr?.message || "Format tidak valid."}`,
        };
      }
    }

    // 4. Jika bukan JSON, baca sebagai teks untuk pesan yang informatif
    const rawText = await res.text();
    let snippet = rawText.trim();
    if (snippet.length > 120) {
      snippet = snippet.slice(0, 120) + "...";
    }

    if (snippet.toLowerCase().includes("request entity too large") || snippet.toLowerCase().includes("payload too large")) {
      return {
        ok: false,
        status: res.status || 413,
        data: null,
        message:
          "Ukuran file atau data yang dikirim terlalu besar melebihi batas server (Request Entity Too Large). Harap gunakan foto dengan ukuran lebih kecil.",
      };
    }

    return {
      ok: false,
      status: res.status,
      data: null,
      message: res.ok
        ? "Server tidak mengembalikan format JSON yang diharapkan."
        : `Server mengembalikan status ${res.status}: ${snippet || "Respons kosong"}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      message: `Kesalahan jaringan: ${err?.message || "Tidak dapat menghubungi server."}`,
    };
  }
}

