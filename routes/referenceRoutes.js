const express = require("express");
const router = express.Router();
const db = require("../models/db");
const upload = require("../middleware/upload");
const fs = require("fs");

// Upload a reference image
router.post("/:id/references", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString("base64");
    const referenceId = await db.addReference(req.params.id, imageBase64);
    
    fs.unlinkSync(req.file.path);
    res.status(201).json({ id: referenceId });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// Get all references for a person
router.get("/:id/references", async (req, res) => {
  try {
    const references = await db.getReferences(req.params.id);
    res.json(references);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a reference
router.delete("/:id", async (req, res) => {
  try {
    await db.deleteReference(req.params.id);
    res.json({ message: "Reference deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
