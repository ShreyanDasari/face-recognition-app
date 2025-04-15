const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Ensure directories exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Ensure results file exists
const resultsFile = path.join(__dirname, "results.xlsx");
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
    let processingFrame = false;
    let lastProcessedTime = 0;
    const minProcessingInterval = 500; // Minimum 500ms between frames

    ws.on("message", async (message) => {
      const currentTime = Date.now();
      
      // Check if enough time has passed since last processing
      if (currentTime - lastProcessedTime < minProcessingInterval) {
        return;
      }

      // Skip if still processing previous frame
      if (processingFrame) {
        return;
      }

      try {
        processingFrame = true;
        lastProcessedTime = currentTime;
        const data = JSON.parse(message);

        // Validate required fields
        if (!data.observerId || !data.frameId || !data.timestamp || !data.image) {
          console.error("❌ Invalid data format");
          ws.send(JSON.stringify({ 
            error: "Invalid data format",
            frameId: data.frameId,
            timestamp: data.timestamp 
          }));
          processingFrame = false;
          return;
        }

        console.log("📥 Received data:", {
          observerId: data.observerId,
          frameId: data.frameId,
          timestamp: new Date(data.timestamp).toISOString()
        });

        // Save base64 image to temp file
        const tempImagePath = path.join(uploadsDir, `temp_${data.frameId}.jpg`);
        try {
          const imageBuffer = Buffer.from(data.image, 'base64');
          fs.writeFileSync(tempImagePath, imageBuffer);

          processImageWithPython(tempImagePath, (error, result) => {
            try {
              // Clean up temp file
              if (fs.existsSync(tempImagePath)) {
                fs.unlinkSync(tempImagePath);
              }

              if (error) {
                console.error("❌ Recognition error:", error);
                ws.send(JSON.stringify({
                  error: "Recognition failed",
                  details: error,
                  frameId: data.frameId,
                  timestamp: data.timestamp
                }));
                updateExcel(
                  data.observerId,
                  data.frameId,
                  data.timestamp,
                  null,
                  null,
                  0,
                  "Error: " + error
                );
                return;
              }

              // Process recognition result
              if (result.found && result.person) {
                console.log("✅ Recognized:", {
                  name: result.person.name,
                  confidence: result.confidence
                });

                updateExcel(
                  data.observerId,
                  data.frameId,
                  data.timestamp,
                  result.person.id,
                  result.person.name,
                  result.confidence,
                  "Match Found"
                );

                // Send detailed response
                ws.send(JSON.stringify({
                  frameId: data.frameId,
                  timestamp: data.timestamp,
                  found: true,
                  person: result.person,
                  confidence: result.confidence
                }));
              } else {
                console.log("🚫 No matching person found");
                updateExcel(
                  data.observerId,
                  data.frameId,
                  data.timestamp,
                  null,
                  null,
                  0,
                  "No Match"
                );

                ws.send(JSON.stringify({
                  frameId: data.frameId,
                  timestamp: data.timestamp,
                  found: false,
                  message: "No matching person found"
                }));
              }
            } finally {
              processingFrame = false;
            }
          });
        } catch (error) {
          console.error("❌ Image processing error:", error);
          if (fs.existsSync(tempImagePath)) {
            fs.unlinkSync(tempImagePath);
          }
          processingFrame = false;
          ws.send(JSON.stringify({
            error: "Image processing failed",
            details: error.message,
            frameId: data.frameId,
            timestamp: data.timestamp
          }));
        }
      } catch (error) {
        console.error("❌ Error parsing message:", error);
        processingFrame = false;
        ws.send(JSON.stringify({ 
          error: "Invalid message format",
          details: error.message 
        }));
      }
    });

    ws.on("close", () => {
      console.log("🔴 Client disconnected");
    });
  });

  return wss;
};

function processImageWithPython(imagePath, callback) {
  try {
    const pythonProcess = spawn("python3", ["detector.py", "--test", "-f", imagePath]);
    let stdoutData = "";
    let stderrData = "";

    // Increase timeout to 10 seconds
    const timeoutDuration = 10000; // 10 seconds
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error("Recognition timeout"));
      }, timeoutDuration);
    });

    pythonProcess.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on("close", (code) => {
      clearTimeout(timeoutId);
      
      if (code !== 0) {
        callback(`Python process error (${code}): ${stderrData}`, null);
        return;
      }

      try {
        const result = JSON.parse(stdoutData);
        callback(null, result);
      } catch (err) {
        callback(`Failed to parse result: ${err.message}`, null);
      }
    });

  } catch (error) {
    callback(`Failed to start recognition: ${error.message}`, null);
  }
}

function updateExcel(observerId, frameId, timestamp, personId, name, confidence, status) {
  try {
    const workbook = XLSX.readFile(resultsFile);
    const worksheet = workbook.Sheets["Results"];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Add new row with all details
    data.push([
      observerId,
      frameId,
      new Date(timestamp).toISOString(),
      personId || "N/A",
      name || "N/A",
      confidence || 0,
      status
    ]);

    const newWorksheet = XLSX.utils.aoa_to_sheet(data);
    workbook.Sheets["Results"] = newWorksheet;
    XLSX.writeFile(workbook, resultsFile);
    console.log("📄 Result saved to Excel");
  } catch (error) {
    console.error("❌ Error updating Excel:", error);
  }
}