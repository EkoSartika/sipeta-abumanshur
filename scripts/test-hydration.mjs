import { spawn } from "child_process";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "https://sipetaabumanshur.vercel.app";

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9223",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=C:\\Users\\Eko\\.gemini\\antigravity\\scratch\\chrome-test-hydration`
  ]);

  await wait(2000);
  const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);

  let id = 1;
  const callbacks = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id)(msg.result);
      callbacks.delete(msg.id);
    }
  };

  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    callbacks.set(curId, resolve);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await new Promise(r => ws.onopen = r);
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("Navigating to", BASE_URL);
  await send("Page.navigate", { url: BASE_URL });

  // Poll for hydration completion up to 10s
  for (let i = 0; i < 10; i++) {
    await wait(1000);
    const evalRes = await send("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body.innerText;
        const isLoading = text.includes("Memeriksa status autentikasi");
        const has2024 = text.includes("2024/2025");
        const has2026 = text.includes("2026/2027");
        const match = text.match(/Tahun (?:Ajaran|Pelajaran) [^\\n]+/);
        return { isLoading, has2024, has2026, match: match ? match[0] : null };
      })()`,
      returnByValue: true
    });
    console.log(`Second ${i+1}:`, evalRes.result.value);
    if (!evalRes.result.value.isLoading) break;
  }

  ws.close();
  chromeProcess.kill();
}

main().catch(console.error);
