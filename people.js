const express = require('express');
const router = express.Router();




// People endpoints
router.post("/people", async (req, res) => {
    try {
      const personId = await db.addPerson(req.body);
      res.status(201).json({ id: personId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
router.get("/people", async (req, res) => {
    try {
      const people = await db.getAllPeople();
      res.json(people);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
router.get("/people/:id", async (req, res) => {
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
  
router.put("/people/:id", async (req, res) => {
    try {
      await db.updatePerson(req.params.id, req.body);
      res.json({ message: "Person updated successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
router.delete("/people/:id", async (req, res) => {
    try {
      await db.deletePerson(req.params.id);
      res.json({ message: "Person deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Reference endpoints
router.post("/people/:id/references", upload.single("image"), async (req, res) => {
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
  
router.get("/people/:id/references", async (req, res) => {
    try {
      const references = await db.getReferences(req.params.id);
      res.json(references);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
router.delete("/references/:id", async (req, res) => {
    try {
      await db.deleteReference(req.params.id);
      res.json({ message: "Reference deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  