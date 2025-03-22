const WebSocket = require("ws");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Ensure results file exists
const resultsFile = path.join(__dirname, "results.xlsx");
if (!fs.existsSync(resultsFile)) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Observer ID", "Frame ID", "Timestamp", "Recognition Result"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, resultsFile);
}

// Ensure frames directory exists
const framesDir = path.join(__dirname, "frames");
if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
}

module.exports = function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on("connection", (ws) => {
        console.log("✅ Client connected");

        ws.on("message", (message) => {
            try {
                const data = JSON.parse(message);

                // Validate required fields
                if (!data.observerId || !data.frameId || !data.timestamp || !data.image) {
                    console.error("❌ Invalid data format:", data);
                    ws.send(JSON.stringify({ error: "Invalid data format" }));
                    return;
                }

                console.log("📥 Received data:", {
                    observerId: data.observerId,
                    frameId: data.frameId,
                    timestamp: data.timestamp,
                });

                // Decode and save image
                const imageBuffer = Buffer.from(data.image, "base64");
                const imagePath = path.join(framesDir, `${data.frameId}.jpg`);
                fs.writeFileSync(imagePath, imageBuffer);

                // Run face recognition script
                exec(`python3 detector.py --test -f ${imagePath}`, (error, stdout, stderr) => {
                    // Delete image after processing
                    fs.unlink(imagePath, (err) => {
                        if (err) console.warn(`⚠️ Failed to delete ${imagePath}:`, err);
                    });

                    if (error) {
                        console.error("❌ Error executing script:", stderr);
                        ws.send(JSON.stringify({ error: "Recognition failed" }));
                        return;
                    }

                    try {
                        const result = JSON.parse(stdout);
                        console.log("✅ Recognition result:", result);

                        // Append result to Excel
                        updateExcel(data.observerId, data.frameId, data.timestamp, result.found ? "Match Found" : "No Match");

                        // Send response
                        ws.send(JSON.stringify(result));

                    } catch (err) {
                        console.error("❌ Failed to parse recognition result:", err);
                        ws.send(JSON.stringify({ error: "Invalid recognition output" }));
                    }
                });

            } catch (error) {
                console.error("❌ Error parsing JSON:", error);
                ws.send(JSON.stringify({ error: "Invalid JSON format" }));
            }
        });

        ws.on("close", () => {
            console.log("🔴 Client disconnected");
        });
    });

    return wss;
};

// Function to update Excel file
function updateExcel(observerId, frameId, timestamp, result) {
    try {
        const workbook = XLSX.readFile(resultsFile);
        const worksheet = workbook.Sheets["Results"];

        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        data.push([observerId, frameId, timestamp, result]);

        const newWorksheet = XLSX.utils.aoa_to_sheet(data);
        workbook.Sheets["Results"] = newWorksheet;

        XLSX.writeFile(workbook, resultsFile);
        console.log("📄 Result saved to Excel");
    } catch (error) {
        console.error("❌ Error updating Excel file:", error);
    }
}
