const express = require("express");
const multer = require("multer");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const db = require("./models/db");

const app = express();
const port = 3000;

app.use(express.json());

// Set up storage for uploaded images
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // Ensure uploads directory exists
    if (!fs.existsSync("uploads")) {
      fs.mkdirSync("uploads");
    }
    cb(null, "uploads/");
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// Initialize multer with storage configuration
const upload = multer({ storage: storage });

// People endpoints
app.post("/people", async (req, res) => {
  try {
    const personId = await db.addPerson(req.body);
    res.status(201).json({ id: personId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/people", async (req, res) => {
  try {
    const people = await db.getAllPeople();
    res.json(people);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/people/:id", async (req, res) => {
  try {
    const person = await db.getPerson(req.params.id);
    if (!person) {
      return res.status(404).json({ error: "Person not found" });
    }
    res.json(person);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/people/:id", async (req, res) => {
  try {
    await db.updatePerson(req.params.id, req.body);
    res.json({ message: "Person updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/people/:id", async (req, res) => {
  try {
    await db.deletePerson(req.params.id);
    res.json({ message: "Person deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reference endpoints
app.post("/people/:id/references", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  try {
    // Read the file as a buffer
    const imageBuffer = fs.readFileSync(req.file.path);
    // Convert buffer to base64 string for storage
    const imageBase64 = imageBuffer.toString('base64');
    
    const referenceId = await db.addReference(req.params.id, imageBase64);
    fs.unlinkSync(req.file.path); // Clean up the uploaded file
    res.status(201).json({ id: referenceId });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path); // Clean up the uploaded file if there was an error
    }
    res.status(500).json({ error: error.message });
  }
});

app.get("/people/:id/references", async (req, res) => {
  try {
    const references = await db.getReferences(req.params.id);
    res.json(references);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/references/:id", async (req, res) => {
  try {
    await db.deleteReference(req.params.id);
    res.json({ message: "Reference deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Train model endpoint
app.post("/train", (req, res) => {
  exec("python3 detector.py --train", (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr });
    }
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (parseError) {
      res.json({ message: "Training completed", output: stdout });
    }
  });
});

// Validate model endpoint
app.post("/validate", (req, res) => {
  exec("python3 detector.py --validate", (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr });
    }
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (parseError) {
      res.json({ message: "Validation completed", output: stdout });
    }
  });
});

// Recognize face endpoint
app.post("/recognize", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const imagePath = path.resolve(req.file.path);
    exec(`python3 detector.py --test -f ${imagePath}`, (error, stdout, stderr) => {
      fs.unlinkSync(imagePath);
      
      if (error) {
        return res.status(500).json({ error: stderr });
      }
      
      try {
        const result = JSON.parse(stdout);
        if (!result.found) {
          return res.status(404).json(result);
        }
        res.json(result);
      } catch (parseError) {
        res.status(500).json({ error: "Failed to parse recognition result" });
      }
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Face recognition API running on http://localhost:${port}`);
});