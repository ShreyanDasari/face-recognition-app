const express = require("express");
const router = express.Router();
const { exec } = require("child_process");

router.post("/train", (req, res) => {
  exec("python3 detector.py --train", (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: stderr });

    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch {
      res.json({ message: "Training completed", output: stdout });
    }
  });
});

router.post("/validate", (req, res) => {
  exec("python3 detector.py --validate", (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: stderr });

    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch {
      res.json({ message: "Validation completed", output: stdout });
    }
  });
});

module.exports = router;
