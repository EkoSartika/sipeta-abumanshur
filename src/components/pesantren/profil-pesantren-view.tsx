"use client";

import React, { useEffect, useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Info,
  Landmark,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { storageService } from "@/lib/services/storage.service";
import { compressImageClientSide } from "@/lib/utils/image-compression";

export function ProfilPesantrenView({ readOnly = false }: { readOnly?: boolean }) {
  const {
    currentUser,
    profilPesantren,
    updateProfilPesantren,
    tahunAjaranList,
  } = useSipeta();

  // State Formulir Identitas Yayasan
  const [namaYayasan, setNamaYayasan] = useState(
    profilPesantren?.nama_yayasan || "YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR"
  );
  const [logoYayasanUrl, setLogoYayasanUrl] = useState(
    profilPesantren?.logo_yayasan_url || "/images/logo-abu-manshur.png"
  );

  // State Formulir Identitas Lembaga Pesantren
  const [namaResmi, setNamaResmi] = useState(
    profilPesantren?.nama_resmi || "Pondok Pesantren Modern Abu Manshur"
  );
  const [logoPesantrenUrl, setLogoPesantrenUrl] = useState(
    profilPesantren?.logo_pesantren_url || "/images/logo-abu-manshur.png"
  );
  const [nspp, setNspp] = useState(profilPesantren?.nspp || "510032090045");
  const [akreditasi, setAkreditasi] = useState(profilPesantren?.akreditasi || "Terakreditasi A");
  const [skPendirian, setSkPendirian] = useState(
    profilPesantren?.sk_pendirian || "Kd.10.09/4/PP.00.7/1335/2010"
  );

  // State Formulir Alamat Lengkap
  const [alamat, setAlamat] = useState(
    profilPesantren?.alamat || "Jl. Nyi Ageng Serang, Sindangmekar, Kec. Dukupuntang, Kabupaten Cirebon, Jawa Barat 45652"
  );
  const [kelurahan, setKelurahan] = useState(profilPesantren?.kelurahan || "Sindangmekar");
  const [kecamatan, setKecamatan] = useState(profilPesantren?.kecamatan || "Dukupuntang");
  const [kabupaten, setKabupaten] = useState(profilPesantren?.kabupaten_kota || "Kabupaten Cirebon");
  const [provinsi, setProvinsi] = useState(profilPesantren?.provinsi || "Jawa Barat");
  const [kodePos, setKodePos] = useState(profilPesantren?.kode_pos || "45652");

  // State Formulir Kontak Resmi
  const [telepon, setTelepon] = useState(profilPesantren?.no_telepon || "(0231) 8303388");
  const [noWa, setNoWa] = useState(profilPesantren?.no_wa || "081234567890");
  const [email, setEmail] = useState(profilPesantren?.email || "sekretariat@abumanshur.sch.id");
  const [website, setWebsite] = useState(profilPesantren?.website || "https://abumanshur.sch.id");

  // State Informasi Tambahan & Pimpinan
  const [namaPengasuh, setNamaPengasuh] = useState(profilPesantren?.nama_pengasuh || "Kyai Abu Manshur");
  const [jabatanPenandatangan, setJabatanPenandatangan] = useState(
    profilPesantren?.jabatan_penandatangan || "Pengasuh Pondok Pesantren"
  );
  const [informasiUmum, setInformasiUmum] = useState(profilPesantren?.informasi_umum || "");

  // State Status & Modal
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Sinkronisasi bila profilPesantren berubah di store
  useEffect(() => {
    if (profilPesantren) {
      setNamaYayasan(profilPesantren.nama_yayasan || "YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR");
      setLogoYayasanUrl(profilPesantren.logo_yayasan_url || "/images/logo-abu-manshur.png");
      setNamaResmi(profilPesantren.nama_resmi || "Pondok Pesantren Modern Abu Manshur");
      setLogoPesantrenUrl(profilPesantren.logo_pesantren_url || "/images/logo-abu-manshur.png");
      setNspp(profilPesantren.nspp || "");
      setAkreditasi(profilPesantren.akreditasi || "");
      setSkPendirian(profilPesantren.sk_pendirian || "");
      setAlamat(profilPesantren.alamat || "");
      setKelurahan(profilPesantren.kelurahan || "");
      setKecamatan(profilPesantren.kecamatan || "");
      setKabupaten(profilPesantren.kabupaten_kota || "");
      setProvinsi(profilPesantren.provinsi || "");
      setKodePos(profilPesantren.kode_pos || "");
      setTelepon(profilPesantren.no_telepon || "");
      setNoWa(profilPesantren.no_wa || "");
      setEmail(profilPesantren.email || "");
      setWebsite(profilPesantren.website || "");
      setNamaPengasuh(profilPesantren.nama_pengasuh || "");
      setJabatanPenandatangan(profilPesantren.jabatan_penandatangan || "Pengasuh Pondok Pesantren");
      setInformasiUmum(profilPesantren.informasi_umum || "");
    }
  }, [profilPesantren]);

  // Handler Upload Logo melalui Storage yang tersedia
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "yayasan" | "pesantren") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const check = storageService.validateFile(file, "image_only");
    if (!check.valid) {
      setFeedback({ ok: false, text: check.error || "File gambar logo tidak valid (harus JPG/PNG/WebP, maks 5MB)." });
      return;
    }

    setUploadingLogo(true);
    setFeedback(null);
    try {
      const { dataUrl } = await compressImageClientSide(file, {
        maxWidth: 600,
        maxHeight: 600,
        targetSizeKb: 150,
        maxSafeSizeKb: 300,
        preferWebP: false,
      });

      if (target === "yayasan") {
        setLogoYayasanUrl(dataUrl);
      } else {
        setLogoPesantrenUrl(dataUrl);
      }

      setFeedback({
        ok: true,
        text: `Pratinjau logo ${target === "yayasan" ? "Yayasan" : "Pesantren"} berhasil dimuat. Klik "Simpan Profil Pesantren" untuk menyimpan perubahan.`,
      });
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "/images/logo-abu-manshur.png";
        if (target === "yayasan") {
          setLogoYayasanUrl(result);
        } else {
          setLogoPesantrenUrl(result);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveSubmit = async () => {
    if (!namaResmi.trim()) {
      setFeedback({ ok: false, text: "Nama resmi pesantren wajib diisi." });
      return;
    }
    if (!alamat.trim()) {
      setFeedback({ ok: false, text: "Alamat lengkap pesantren wajib diisi." });
      return;
    }

    setSaving(true);
    setFeedback(null);

    const payload = {
      nama_yayasan: namaYayasan.trim(),
      logo_yayasan_url: logoYayasanUrl,
      nama_resmi: namaResmi.trim(),
      logo_pesantren_url: logoPesantrenUrl,
      nspp: nspp.trim(),
      akreditasi: akreditasi.trim(),
      sk_pendirian: skPendirian.trim(),
      alamat: alamat.trim(),
      kelurahan: kelurahan.trim(),
      kecamatan: kecamatan.trim(),
      kabupaten_kota: kabupaten.trim(),
      provinsi: provinsi.trim(),
      kode_pos: kodePos.trim(),
      no_telepon: telepon.trim(),
      no_wa: noWa.trim(),
      email: email.trim(),
      website: website.trim(),
      nama_pengasuh: namaPengasuh.trim(),
      jabatan_penandatangan: jabatanPenandatangan.trim(),
      informasi_umum: informasiUmum.trim(),
    };

    try {
      const res = await updateProfilPesantren(payload);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setConfirmModalOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const isEditable = !readOnly && currentUser && (currentUser.role === "admin" || currentUser.role === "superadmin" || currentUser.role === "tu");

  return (
    <div className="space-y-6">
      {/* Header Banner Profil Pesantren */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#123C35] border border-emerald-200">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  Profil Lembaga &amp; Identitas Resmi Pesantren
                </h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#123C35]">
                  Sumber Resmi Kop Dokumen &amp; PDF
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pondok Pesantren Modern Abu Manshur • Dikelola oleh Pengasuh, Tata Usaha, dan Superadmin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 border border-[#E5E7EB]">
              Tahun Aktif:{" "}
              <strong className="text-[#123C35]">
                {profilPesantren?.tahun_pelajaran_aktif || "2024/2025"} ({profilPesantren?.semester_aktif || "Ganjil"})
              </strong>
            </span>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mt-4 flex items-center justify-between rounded-xl border px-4 py-3 text-xs ${
              feedback.ok
                ? "border-emerald-200 bg-emerald-50 text-[#123C35]"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold underline ml-4 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Formulir Pengaturan Profil */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmModalOpen(true);
          }}
          className="mt-6 space-y-6 text-xs"
        >
          {/* BAGIAN A: IDENTITAS YAYASAN & LOGO */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-emerald-200/60 pb-2">
              <Landmark className="h-4 w-4 text-emerald-800" />
              <h4 className="font-extrabold text-xs text-emerald-950 uppercase tracking-wider">
                A. Identitas Yayasan Penyelenggara &amp; Logo Resmi
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Nama Resmi Yayasan <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isEditable}
                    value={namaYayasan}
                    onChange={(e) => setNamaYayasan(e.target.value)}
                    placeholder="contoh: YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[40px] uppercase"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Nama yayasan ditampilkan pada baris teratas kop surat resmi dokumen &amp; laporan PDF.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Unggah / Ganti Logo Yayasan
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!isEditable || uploadingLogo}
                      onChange={(e) => handleLogoUpload(e, "yayasan")}
                      className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Unggah / Ganti Logo Pesantren
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!isEditable || uploadingLogo}
                      onChange={(e) => handleLogoUpload(e, "pesantren")}
                      className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#123C35] file:text-white hover:file:bg-[#1D6B59] cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Pratinjau Logo */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-white p-3 text-center shadow-xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Pratinjau Logo Dokumen
                </p>
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-50 p-2 border border-slate-200">
                  <img
                    src={logoPesantrenUrl || logoYayasanUrl || "/images/logo-abu-manshur.png"}
                    alt="Logo Pratinjau"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="mt-2 text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                  {logoPesantrenUrl.startsWith("data:") ? "Gambar Terunggah (Canvas Base64)" : logoPesantrenUrl}
                </span>
              </div>
            </div>
          </div>

          {/* BAGIAN B: IDENTITAS LEMBAGA PESANTREN */}
          <div className="rounded-xl border border-[#E5E7EB] bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
              <Building2 className="h-4 w-4 text-[#123C35]" />
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                B. Identitas Lembaga Pondok Pesantren
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  Nama Resmi Lembaga Pesantren <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!isEditable}
                  value={namaResmi}
                  onChange={(e) => setNamaResmi(e.target.value)}
                  placeholder="contoh: Pondok Pesantren Modern Abu Manshur"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[40px]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  NSPP (Nomor Statistik Pondok Pesantren)
                </label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={nspp}
                  onChange={(e) => setNspp(e.target.value)}
                  placeholder="contoh: 510032090045"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[40px]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Status Akreditasi
                </label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={akreditasi}
                  onChange={(e) => setAkreditasi(e.target.value)}
                  placeholder="contoh: Terakreditasi A"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[40px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  Nomor SK Izin Operasional / Pendirian
                </label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={skPendirian}
                  onChange={(e) => setSkPendirian(e.target.value)}
                  placeholder="contoh: Kd.10.09/4/PP.00.7/1335/2010"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[40px]"
                />
              </div>
            </div>
          </div>

          {/* BAGIAN C: ALAMAT LENGKAP PESANTREN */}
          <div className="rounded-xl border border-[#E5E7EB] bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
              <MapPin className="h-4 w-4 text-rose-700" />
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                C. Alamat Lengkap Pesantren
              </h4>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Alamat Jalan &amp; Kompleks Pesantren <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  disabled={!isEditable}
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  placeholder="contoh: Jl. Nyi Ageng Serang, Sindangmekar, Kec. Dukupuntang, Kabupaten Cirebon, Jawa Barat 45652"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kelurahan / Desa</label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={kelurahan}
                    onChange={(e) => setKelurahan(e.target.value)}
                    placeholder="Sindangmekar"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kecamatan</label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={kecamatan}
                    onChange={(e) => setKecamatan(e.target.value)}
                    placeholder="Dukupuntang"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kabupaten / Kota</label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={kabupaten}
                    onChange={(e) => setKabupaten(e.target.value)}
                    placeholder="Kabupaten Cirebon"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Provinsi</label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={provinsi}
                    onChange={(e) => setProvinsi(e.target.value)}
                    placeholder="Jawa Barat"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kode Pos</label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={kodePos}
                    onChange={(e) => setKodePos(e.target.value)}
                    placeholder="45652"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* BAGIAN D: KONTAK RESMI & MEDIA KOMUNIKASI */}
          <div className="rounded-xl border border-[#E5E7EB] bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
              <Phone className="h-4 w-4 text-teal-700" />
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                D. Kontak Resmi Sekretariat &amp; Komunikasi
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nomor Telepon Hotline</label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={telepon}
                  onChange={(e) => setTelepon(e.target.value)}
                  placeholder="(0231) 8303388"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nomor WhatsApp Resmi</label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={noWa}
                  onChange={(e) => setNoWa(e.target.value)}
                  placeholder="081234567890"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Resmi</label>
                <input
                  type="email"
                  disabled={!isEditable}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sekretariat@abumanshur.sch.id"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Website Resmi</label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://abumanshur.sch.id"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* BAGIAN E: INFORMASI TAMBAHAN & PIMPINAN */}
          <div className="rounded-xl border border-[#E5E7EB] bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
              <UserCheck className="h-4 w-4 text-indigo-700" />
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                E. Pimpinan Pesantren &amp; Penandatangan Resmi
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Nama Pengasuh / Pimpinan Pesantren
                </label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={namaPengasuh}
                  onChange={(e) => setNamaPengasuh(e.target.value)}
                  placeholder="contoh: Kyai Abu Manshur"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Jabatan Resmi Penandatangan Dokumen
                </label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={jabatanPenandatangan}
                  onChange={(e) => setJabatanPenandatangan(e.target.value)}
                  placeholder="contoh: Pengasuh Pondok Pesantren"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[40px]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  Informasi Umum &amp; Komitmen Lembaga
                </label>
                <textarea
                  rows={3}
                  disabled={!isEditable}
                  value={informasiUmum}
                  onChange={(e) => setInformasiUmum(e.target.value)}
                  placeholder="Tuliskan deskripsi ringkas, visi, atau komitmen pondok pesantren..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Tombol Simpan Profil Pesantren */}
          {isEditable && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#E5E7EB] pt-4">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#123C35] shrink-0" />
                <span>Seluruh data identitas tersimpan permanen dan digunakan otomatis pada kop PDF resmi.</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (profilPesantren) {
                      setNamaYayasan(profilPesantren.nama_yayasan || "YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR");
                      setLogoYayasanUrl(profilPesantren.logo_yayasan_url || "/images/logo-abu-manshur.png");
                      setNamaResmi(profilPesantren.nama_resmi || "");
                      setLogoPesantrenUrl(profilPesantren.logo_pesantren_url || "/images/logo-abu-manshur.png");
                      setAlamat(profilPesantren.alamat || "");
                      setTelepon(profilPesantren.no_telepon || "");
                      setNoWa(profilPesantren.no_wa || "");
                      setEmail(profilPesantren.email || "");
                      setWebsite(profilPesantren.website || "");
                      setNspp(profilPesantren.nspp || "");
                      setAkreditasi(profilPesantren.akreditasi || "");
                      setSkPendirian(profilPesantren.sk_pendirian || "");
                      setNamaPengasuh(profilPesantren.nama_pengasuh || "");
                      setJabatanPenandatangan(profilPesantren.jabatan_penandatangan || "");
                      setInformasiUmum(profilPesantren.informasi_umum || "");
                    }
                    setFeedback({ ok: true, text: "Formulir diatur ulang ke data tersimpan." });
                  }}
                  className="flex-1 sm:flex-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition min-h-[42px] cursor-pointer"
                >
                  Batal / Reset
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-[#123C35] px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-[#1D6B59] transition disabled:opacity-50 min-h-[42px] cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? "Menyimpan..." : "Simpan Profil Pesantren"}</span>
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Modal Konfirmasi Simpan Profil Pesantren */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-[#123C35]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">Konfirmasi Simpan Profil Pesantren</h3>
                <p className="text-xs text-slate-500">Pondok Pesantren Modern Abu Manshur</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-[#E5E7EB]">
              <p>Anda akan memperbarui identitas resmi pesantren dengan ringkasan:</p>
              <ul className="list-disc list-inside space-y-1 font-medium text-slate-800">
                <li>Yayasan: <strong>{namaYayasan}</strong></li>
                <li>Lembaga: <strong>{namaResmi}</strong></li>
                <li>Pengasuh: <strong>{namaPengasuh}</strong> ({jabatanPenandatangan})</li>
                <li>Alamat: <span className="text-slate-700">{alamat}</span></li>
              </ul>
              <p className="text-[11px] text-emerald-900 font-semibold pt-1">
                Data terbaru ini akan otomatis menjadi acuan kop surat PDF resmi untuk seluruh kategori laporan.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveSubmit}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#123C35] px-4 py-2 text-xs font-bold text-white hover:bg-[#1D6B59] transition cursor-pointer"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>{saving ? "Menyimpan..." : "Ya, Simpan Permanen"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

