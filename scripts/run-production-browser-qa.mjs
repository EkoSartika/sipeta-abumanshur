import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "https://sipetaabumanshur.vercel.app";
const USER_DATA_DIR = "C:\\Users\\Eko\\.gemini\\antigravity\\scratch\\chrome-qa-profile";

// Clean user data dir if exists
try {
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
} catch {}

let chromeProcess;
let ws;
let messageId = 1;
const pendingCallbacks = new Map();

function sendCommand(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    pendingCallbacks.set(id, { resolve, reject });
    const payload = JSON.stringify({ id, method, params });
    ws.send(payload);
  });
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("==================================================================");
  console.log("SIPETA FINAL PRODUCTION BROWSER QA AUTOMATION");
  console.log("Target:", BASE_URL);
  console.log("==================================================================");

  chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${USER_DATA_DIR}`,
    "--window-size=1280,800"
  ]);

  await wait(2500);

  // 1. Get targets
  const versionRes = await fetch("http://127.0.0.1:9222/json");
  const targets = await versionRes.json();
  const pageTarget = targets.find(t => t.type === "page") || targets[0];
  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error("No page target found with webSocketDebuggerUrl");
  }

  console.log("Connected to Chrome Page Target:", pageTarget.id);

  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  const consoleLogs = [];
  const networkErrors = [];
  const pageErrors = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingCallbacks.has(msg.id)) {
      const { resolve, reject } = pendingCallbacks.get(msg.id);
      pendingCallbacks.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
      return;
    }

    // Event handling
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map(a => a.value ?? a.description ?? "").join(" ");
      consoleLogs.push({ type: msg.params.type, text });
    } else if (msg.method === "Runtime.exceptionThrown") {
      pageErrors.push(msg.params.exceptionDetails);
    } else if (msg.method === "Network.responseReceived") {
      const { response } = msg.params;
      if (response.status >= 400) {
        networkErrors.push({ url: response.url, status: response.status, statusText: response.statusText });
      }
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  // Enable domains
  await sendCommand("Page.enable");
  await sendCommand("Runtime.enable");
  await sendCommand("Network.enable");
  await sendCommand("DOM.enable");

  const results = {};

  // =========================================================================
  // TEST 1: Landing Page (Desktop 1280x800)
  // =========================================================================
  console.log("\n[TEST 1] Loading Landing Page (Desktop Viewport 1280x800)...");
  await sendCommand("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  await sendCommand("Page.navigate", { url: `${BASE_URL}` });
  for (let i = 0; i < 15; i++) {
    await wait(1000);
    const check = await sendCommand("Runtime.evaluate", {
      expression: "!document.body.innerText.includes('Memeriksa status')",
      returnByValue: true
    });
    if (check.result.value) break;
  }

  const evalTitle = await sendCommand("Runtime.evaluate", { expression: "document.title" });
  console.log("Page Title:", evalTitle.result.value);

  const evalLandingContent = await sendCommand("Runtime.evaluate", {
    expression: `(() => {
      const text = document.body.innerText;
      return {
        hasSipeta: text.includes("SIPETA"),
        hasAbuManshur: text.includes("Abu Manshur"),
        hasTahunPelajaran: text.includes("2024/2025"),
        hasLoginWali: text.includes("Login Wali Santri") || text.includes("Masuk Portal"),
        hasRolePortals: text.includes("Tata Usaha") && text.includes("Pengasuh") && text.includes("Bendahara") && text.includes("Asatidz"),
        fullTextSnippet: text.slice(0, 300).replace(/\\s+/g, " ")
      };
    })()`,
    returnByValue: true
  });
  console.log("Landing Page Evaluation:", evalLandingContent.result.value);
  results.landingDesktop = evalLandingContent.result.value;

  // =========================================================================
  // TEST 2: Landing Page (Mobile Viewport 375x667)
  // =========================================================================
  console.log("\n[TEST 2] Evaluating Mobile Viewport Responsiveness (375x667)...");
  await sendCommand("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true
  });
  await wait(1500);

  const evalMobile = await sendCommand("Runtime.evaluate", {
    expression: `(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasHorizontalScrollbar = scrollWidth > clientWidth;
      return {
        scrollWidth,
        clientWidth,
        hasHorizontalScrollbar,
        isResponsive: !hasHorizontalScrollbar
      };
    })()`,
    returnByValue: true
  });
  console.log("Mobile Viewport Evaluation:", evalMobile.result.value);
  results.landingMobile = evalMobile.result.value;

  // Restore Desktop
  await sendCommand("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  // =========================================================================
  // TEST 3: Login Pages for All Roles
  // =========================================================================
  const loginPages = [
    { role: "tu", path: "/tu/login", expectedText: "Tata Usaha" },
    { role: "admin", path: "/admin/login", expectedText: "Pengasuh" },
    { role: "bendahara", path: "/bendahara/login", expectedText: "Bendahara" },
    { role: "pengelola", path: "/pengelola/login", expectedText: "Asatidz" },
    { role: "asatidz", path: "/asatidz/login", expectedText: "Asatidz" },
    { role: "superadmin", path: "/superadmin/login", expectedText: "Superadmin" },
    { role: "wali", path: "/login", expectedText: "Wali Santri" }
  ];

  results.loginPages = [];

  for (const lp of loginPages) {
    console.log(`\n[TEST 3] Testing Login View: ${lp.path} (${lp.expectedText})...`);
    await sendCommand("Page.navigate", { url: `${BASE_URL}${lp.path}` });
    await wait(2500);

    const checkView = await sendCommand("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body.innerText;
        const inputs = Array.from(document.querySelectorAll("input")).map(i => ({ type: i.type, placeholder: i.placeholder, name: i.name }));
        const buttons = Array.from(document.querySelectorAll("button")).map(b => b.innerText.trim());
        return {
          path: "${lp.path}",
          hasExpectedRole: text.includes("${lp.expectedText}"),
          inputCount: inputs.length,
          inputs,
          buttons: buttons.filter(b => b.length > 0).slice(0, 5),
          hasTahunAjaran: text.includes("2024/2025")
        };
      })()`,
      returnByValue: true
    });
    console.log(`Result for ${lp.path}:`, checkView.result.value);
    results.loginPages.push(checkView.result.value);
  }

  // =========================================================================
  // TEST 4: Form Interaction & Security Validation on TU Login
  // =========================================================================
  console.log("\n[TEST 4] Testing Form Interaction & Invalid Credential Validation on /tu/login...");
  await sendCommand("Page.navigate", { url: `${BASE_URL}/tu/login` });
  await wait(2000);

  // Type invalid credentials
  const submitInvalid = await sendCommand("Runtime.evaluate", {
    expression: `(async () => {
      const userInputs = document.querySelectorAll("input");
      let userInput = userInputs[0];
      let passInput = userInputs[1];
      if (!userInput || !passInput) return { error: "inputs not found" };

      userInput.value = "tatausaha_test_invalid";
      userInput.dispatchEvent(new Event("input", { bubbles: true }));

      passInput.value = "WrongPassword999!";
      passInput.dispatchEvent(new Event("input", { bubbles: true }));

      const submitBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Masuk"));
      if (!submitBtn) return { error: "submit button not found" };
      submitBtn.click();

      // Wait 3 seconds for Supabase response
      await new Promise(r => setTimeout(r, 3000));

      const errorAlert = document.body.innerText;
      return {
        hasErrorMessage: errorAlert.includes("tidak cocok") || errorAlert.includes("Akses ditolak") || errorAlert.includes("gagal"),
        textSnippet: errorAlert.slice(0, 400).replace(/\\s+/g, " ")
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("Invalid Login Submission Result:", submitInvalid.result.value);
  results.invalidLoginFeedback = submitInvalid.result.value;

  // =========================================================================
  // TEST 5: API Endpoints (Health, Auth, Protected Routes)
  // =========================================================================
  console.log("\n[TEST 5] Verifying API Endpoints Live...");
  const apiTests = await sendCommand("Runtime.evaluate", {
    expression: `(async () => {
      const endpoints = [
        { url: "/api/health", method: "GET", expectedStatus: 200 },
        { url: "/api/admin-users", method: "GET", expectedStatus: 401 },
        { url: "/api/admin-santri", method: "GET", expectedStatus: 401 },
        { url: "/api/auth/profile", method: "GET", expectedStatus: 401 }
      ];

      const resList = [];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, { method: ep.method });
          let body = {};
          try { body = await res.json(); } catch {}
          resList.push({
            url: ep.url,
            status: res.status,
            ok: res.status === ep.expectedStatus,
            bodySnippet: JSON.stringify(body).slice(0, 150)
          });
        } catch (err) {
          resList.push({ url: ep.url, error: err.message });
        }
      }
      return resList;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("API Tests Results:", apiTests.result.value);
  results.apiEndpoints = apiTests.result.value;

  // =========================================================================
  // SUMMARY OF CONSOLE LOGS & NETWORK
  // =========================================================================
  console.log("\n==================================================================");
  console.log("CONSOLE & NETWORK SUMMARY:");
  console.log("Total Console Logs:", consoleLogs.length);
  console.log("Total Page Errors:", pageErrors.length);
  console.log("Network 4xx/5xx (excluding intentional API 401 tests):", networkErrors.filter(n => !n.url.includes("/api/admin-") && !n.url.includes("/api/auth/")).length);

  if (pageErrors.length > 0) {
    console.error("Page Errors Found:", JSON.stringify(pageErrors, null, 2));
  }
  if (consoleLogs.filter(c => c.type === "error").length > 0) {
    console.warn("Console Errors Found:", consoleLogs.filter(c => c.type === "error"));
  }

  results.summary = {
    totalConsoleLogs: consoleLogs.length,
    consoleErrors: consoleLogs.filter(c => c.type === "error"),
    pageErrors,
    networkErrors: networkErrors.filter(n => !n.url.includes("/api/admin-") && !n.url.includes("/api/auth/"))
  };

  fs.writeFileSync(
    "C:\\Users\\Eko\\.gemini\\antigravity\\scratch\\sipeta\\scripts\\qa-browser-results.json",
    JSON.stringify(results, null, 2)
  );

  console.log("Browser QA execution completed. Results saved to scripts/qa-browser-results.json");
}

main()
  .catch(err => {
    console.error("Fatal QA Error:", err);
  })
  .finally(() => {
    if (ws) ws.close();
    if (chromeProcess) chromeProcess.kill();
  });
