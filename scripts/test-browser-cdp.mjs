import { spawn } from "child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chromeProcess = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-port=9222",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=C:\\Users\\Eko\\.gemini\\antigravity\\scratch\\chrome-test-profile`
]);

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("Starting Chrome headless...");
  await wait(2000);

  const res = await fetch("http://127.0.0.1:9222/json/version");
  const version = await res.json();
  console.log("Chrome CDP Version:", version);

  chromeProcess.kill();
  console.log("Chrome terminated cleanly.");
}

main().catch(err => {
  console.error(err);
  chromeProcess.kill();
});
