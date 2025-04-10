const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Constants
const uploadsDir = path.join(__dirname, "uploads");
const resultsFile = path.join(__dirname, "results.xlsx");

// Ensure directories and result file exist
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(resultsFile)) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Observer ID", "Frame ID", "Timestamp", "Person ID", "Name", "Confidence", "Status"]
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  XLSX.writeFile(wb, resultsFile);
}

module.exports = function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("✅ Client connected");

    let lastProcessed = 0;
    let isProcessing = false;
    const interval = 500;

    ws.on("message", async (msg) => {
      const now = Date.now();
      if (isProcessing || (now - lastProcessed < interval)) return;

      try {
        isProcessing = true;
        lastProcessed = now;
        const data = JSON.parse(msg);

        if (!data.observerId || !data.frameId || !data.timestamp || !data.image) {
          return ws.send(JSON.stringify({ error: "Invalid data format" }));
        }

        const tempImagePath = path.join(uploadsDir, `frame_${data.frameId}.jpg`);
        fs.writeFileSync(tempImagePath, Buffer.from(data.image, 'base64'));

        runCustomDetector(tempImagePath, (err, result) => {
          fs.existsSync(tempImagePath) && fs.unlinkSync(tempImagePath);

          if (err) {
            updateExcel(data, null, 0, "Error: " + err);
            return ws.send(JSON.stringify({
              frameId: data.frameId,
              timestamp: data.timestamp,
              error: "Detection failed",
              details: err
            }));
          }

          if (result.found && result.person) {
            updateExcel(data, result.person, result.confidence, "Match Found");
            ws.send(JSON.stringify({
              frameId: data.frameId,
              timestamp: data.timestamp,
              found: true,
              person: result.person,
              confidence: result.confidence
            }));
          } else {
            updateExcel(data, null, 0, "No Match");
            ws.send(JSON.stringify({
              frameId: data.frameId,
              timestamp: data.timestamp,
              found: false,
              message: "No matching person found"
            }));
          }

          isProcessing = false;
        });

      } catch (err) {
        isProcessing = false;
        ws.send(JSON.stringify({ error: "Invalid message format", details: err.message }));
      }
    });

    ws.on("close", () => console.log("🔴 Client disconnected"));
  });

  return wss;
};

// 🔁 Replace or customize detection logic here
function runCustomDetector(imagePath, callback) {
  const python = spawn("python3", ["custom_detector.py", "--file", imagePath]);
  let stdout = "", stderr = "";
  const timeoutMs = 10000;

  const timeout = setTimeout(() => {
    python.kill();
    callback("Timeout exceeded", null);
  }, timeoutMs);

  python.stdout.on("data", (data) => stdout += data);
  python.stderr.on("data", (data) => stderr += data);

  python.on("close", (code) => {
    clearTimeout(timeout);
    if (code !== 0) return callback(stderr, null);

    try {
      const result = JSON.parse(stdout);
      callback(null, result);
    } catch (e) {
      callback("Invalid JSON: " + e.message, null);
    }
  });
}

// Excel logging
function updateExcel(data, person, confidence, status) {
  try {
    const workbook = XLSX.readFile(resultsFile);
    const worksheet = workbook.Sheets["Results"];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    rows.push([
      data.observerId,
      data.frameId,
      new Date(data.timestamp).toISOString(),
      person?.id || "N/A",
      person?.name || "N/A",
      confidence || 0,
      status
    ]);

    const updatedSheet = XLSX.utils.aoa_to_sheet(rows);
    workbook.Sheets["Results"] = updatedSheet;
    XLSX.writeFile(workbook, resultsFile);
    console.log("📄 Excel updated");
  } catch (err) {
    console.error("❌ Excel update failed:", err);
  }
}
