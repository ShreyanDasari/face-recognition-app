const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const amqp = require("amqplib");

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const resultsFile = path.join(__dirname, "results.xlsx");
if (!fs.existsSync(resultsFile)) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Observer ID", "Frame ID", "Timestamp", "Person ID", "Name", "Confidence", "Status"]
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  XLSX.writeFile(wb, resultsFile);
}

const RABBITMQ_URL = "amqp://rabbitmq";
const QUEUE_NAME = "image_processing_queue";

async function connectRabbitMQ() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  console.log("🐰 Connected to RabbitMQ");
  return { connection, channel };
}

module.exports = async function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  const { channel } = await connectRabbitMQ();

  wss.on("connection", (ws) => {
    console.log("✅ Client connected");

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);

        if (!data.observerId || !data.frameId || !data.timestamp || !data.image) {
          ws.send(JSON.stringify({ error: "Invalid data format" }));
          return;
        }

        console.log("📥 Received data:", data.frameId);

        // Directly pass base64 image data to queue
        const task = { ...data };
        channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(task)), { persistent: true });
        console.log("📤 Image queued for processing");
      } catch (error) {
        console.error("❌ Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log("🔴 Client disconnected");
    });
  });
};

async function startWorker() {
  const { channel } = await connectRabbitMQ();

  channel.consume(QUEUE_NAME, async (msg) => {
    if (msg !== null) {
      const data = JSON.parse(msg.content.toString());
      console.log("🔄 Processing image:", data.frameId);

      const tempImagePath = path.join(uploadsDir, `temp_${data.frameId}.jpg`);
      fs.writeFileSync(tempImagePath, Buffer.from(data.image, "base64"));

      processImageWithPython(tempImagePath, (error, result) => {
        if (error) {
          updateExcel(data.observerId, data.frameId, data.timestamp, null, null, 0, "Error: " + error);
          if (fs.existsSync(tempImagePath)) {
            fs.unlinkSync(tempImagePath);
          }
        } else {
          updateExcel(
            data.observerId,
            data.frameId,
            data.timestamp,
            result.person?.id || "N/A",
            result.person?.name || "N/A",
            result.confidence || 0,
            result.found ? "Match Found" : "No Match"
          );

          if (!result.found && fs.existsSync(tempImagePath)) {
            fs.unlinkSync(tempImagePath);
          }
        }
        channel.ack(msg);
      });
    }
  }, { noAck: false });
}

startWorker().catch(console.error);

function processImageWithPython(imagePath, callback) {
  try {
    const pythonProcess = spawn("python3", ["detector.py", "--test", "-f", imagePath]);
    let stdoutData = "";
    let stderrData = "";

    pythonProcess.stdout.on("data", (data) => { stdoutData += data.toString(); });
    pythonProcess.stderr.on("data", (data) => { stderrData += data.toString(); });

    pythonProcess.on("close", (code) => {
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
    data.push([observerId, frameId, new Date(timestamp).toISOString(), personId, name, confidence, status]);
    workbook.Sheets["Results"] = XLSX.utils.aoa_to_sheet(data);
    XLSX.writeFile(workbook, resultsFile);
    console.log("📄 Result saved to Excel");
  } catch (error) {
    console.error("❌ Error updating Excel:", error);
  }
}
