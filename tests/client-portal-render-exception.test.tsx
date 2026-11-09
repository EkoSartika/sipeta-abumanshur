import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SuperadminPortal } from "@/modules/superadmin/superadmin-portal";
import { AdminPortal } from "@/modules/admin/admin-portal";
import { TuPortal } from "@/modules/tu/tu-portal";
import { BendaharaPortal } from "@/modules/bendahara/bendahara-portal";
import { PengelolaPortal } from "@/modules/pengelola/pengelola-portal";
import { WaliPortal } from "@/modules/wali/wali-portal";
import { LaporanPortal } from "@/modules/laporan/laporan-portal";
import { UserProfileView } from "@/components/profile/user-profile-view";
import { MustChangePasswordModal } from "@/components/ui/must-change-password-modal";
import { SipetaProvider } from "@/lib/store/sipeta-context";
import SipetaHomePage from "@/app/page";

describe("Regression Test: Client-Side Rendering Exception Prevention", () => {
  it("renders SuperadminPortal across all tabs without exception", () => {
    const tabs = ["dashboard", "users", "rekening", "audit_log"] as const;
    for (const tab of tabs) {
      expect(() => {
        renderToString(
          <SipetaProvider>
            <SuperadminPortal activeTab={tab} />
          </SipetaProvider>
        );
      }).not.toThrow();
    }
  });

  it("renders AdminPortal without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <AdminPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders TuPortal without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <TuPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders BendaharaPortal without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <BendaharaPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders PengelolaPortal without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <PengelolaPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders WaliPortal without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <WaliPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders LaporanPortal without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <LaporanPortal />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders UserProfileView without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <UserProfileView />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders MustChangePasswordModal without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <MustChangePasswordModal />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders SipetaHomePage unauthenticated without exception", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <SipetaHomePage />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders GlobalError fallback screen without exception", async () => {
    const GlobalError = (await import("@/app/global-error")).default;
    expect(() => {
      renderToString(
        <GlobalError
          error={new Error("Simulated root error")}
          reset={() => {}}
        />
      );
    }).not.toThrow();
  });
});
