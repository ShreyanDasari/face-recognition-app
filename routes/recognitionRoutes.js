const express = require("express");
const router = express.Router();
const { exec } = require("child_process");
const upload = require("../middleware/upload");
const path = require("path");
const fs = require("fs");
const db = require("../models/db");

router.post("/", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const imagePath = path.resolve(req.file.path);

  // Read the image file as binary data before processing
  const imageBlob = fs.readFileSync(imagePath);

  // Fix: Wrap the imagePath in quotes to handle spaces and special characters
  exec(`python3 detector.py --test -m hog -f "${imagePath}"`, (error, stdout, stderr) => {
    // Clean up the uploaded file
    fs.unlinkSync(imagePath);
    
    if (error) return res.status(500).json({ error: stderr });

    try {
      const result = JSON.parse(stdout);
      
      // If a person is identified, add to notification table
      if (result.found) {
        // Get the observer ID (you'll need to determine where this comes from)
        const observerId = req.query.observerId || req.body.observerId || 1; // Default or from request
        
        // Add notification to database with the image blob
        db.addNotification({
          observer_id: "inweb",
          detected_person_id: result.person.id, // Assuming this is returned by your Python script
          photo: imageBlob // Passing the actual image blob
        })
        .then(() => console.log("Notification saved successfully"))
        .catch(err => console.error("Error saving notification:", err));
      }
      
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