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
    const imageData = fs.readFileSync(req.file.path);
    const referenceId = await db.addReference(req.params.id, imageData);
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

// Train model using database
app.post("/train", async (req, res) => {
  try {
    // Get all references from database
    const people = await db.getAllPeople();
    const trainingData = [];
    
    for (const person of people) {
      const references = await db.getReferences(person.id);
      if (references.length > 0) {
        // Create temporary files for training
        const personDir = path.join("training", person.name);
        if (!fs.existsSync(personDir)) {
          fs.mkdirSync(personDir, { recursive: true });
        }
        
        // Save each reference image to a temporary file
        for (let i = 0; i < references.length; i++) {
          const tempPath = path.join(personDir, `${i}.jpg`);
          fs.writeFileSync(tempPath, references[i].imageData);
          trainingData.push({ path: tempPath, personId: person.id });
        }
      }
    }
    
    // Run training
    exec("python3 detector.py --train", async (error, stdout, stderr) => {
      // Clean up temporary files
      fs.rmSync("training", { recursive: true, force: true });
      
      if (error) {
        return res.status(500).json({ error: stderr });
      }
      res.json({ message: "Training completed", output: stdout });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate model using database
app.post("/validate", async (req, res) => {
  try {
    // Get validation data from database
    const people = await db.getAllPeople();
    const validationData = [];
    
    for (const person of people) {
      const references = await db.getReferences(person.id);
      if (references.length > 0) {
        // Create temporary files for validation
        const personDir = path.join("validation", person.name);
        if (!fs.existsSync(personDir)) {
          fs.mkdirSync(personDir, { recursive: true });
        }
        
        // Save each reference image to a temporary file
        for (let i = 0; i < references.length; i++) {
          const tempPath = path.join(personDir, `${i}.jpg`);
          fs.writeFileSync(tempPath, references[i].imageData);
          validationData.push({ path: tempPath, personId: person.id });
        }
      }
    }
    
    // Run validation
    exec("python3 detector.py --validate", async (error, stdout, stderr) => {
      // Clean up temporary files
      fs.rmSync("validation", { recursive: true, force: true });
      
      if (error) {
        return res.status(500).json({ error: stderr });
      }
      res.json({ message: "Validation completed", output: stdout });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recognize face using database
app.post("/recognize", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  try {
    const imagePath = path.resolve(req.file.path);
    
    exec(`python detector.py --test -f ${imagePath}`, async (error, stdout, stderr) => {
      // Clean up the uploaded file
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
