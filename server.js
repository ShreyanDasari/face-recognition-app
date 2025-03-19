const express = require("express");
const multer = require("multer");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

// Set up storage for uploaded images
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Train model
app.post("/train", (req, res) => {
  exec("python3 detector.py --train", (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr });
    }
    res.json({ message: "Training completed", output: stdout });
  });
});

// Validate model
app.post("/validate", (req, res) => {
  exec("python3 detector.py --validate", (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr });
    }
    res.json({ message: "Validation completed", output: stdout });
  });
});

// Recognize face
app.post("/recognize", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const imagePath = path.resolve(req.file.path);
  exec(`python detector.py --test -f ${imagePath}`, (error, stdout, stderr) => {
    fs.unlinkSync(imagePath); // Clean up the uploaded file
    if (error) {
      return res.status(500).json({ error: stderr });
    }
    res.json({ message: "Recognition completed", output: stdout });
  });
});

app.listen(port, () => {
  console.log(`Face recognition API running on http://localhost:${port}`);
});
