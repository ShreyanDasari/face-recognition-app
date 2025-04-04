const express = require("express");
const router = express.Router();
const { exec } = require("child_process");
const upload = require("../middleware/upload");
const path = require("path");
const fs = require("fs");

router.post("/", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const imagePath = path.resolve(req.file.path);

  // Fix: Wrap the imagePath in quotes to handle spaces and special characters
  exec(`python3 detector.py --test -m hog -f "${imagePath}"`, (error, stdout, stderr) => {
    // Clean up the uploaded file
    fs.unlinkSync(imagePath);
    
    if (error) return res.status(500).json({ error: stderr });

    try {
      const result = JSON.parse(stdout);
      if (!result.found) return res.status(404).json(result);
      res.json(result);
    } catch (e) {
      // Added error parameter to catch for better debugging
      res.status(500).json({ 
        error: "Failed to parse recognition result",
        details: e.message,
        stdout: stdout
      });
    }
  });
});

module.exports = router;