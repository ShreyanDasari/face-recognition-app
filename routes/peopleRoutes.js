const express = require("express");
const router = express.Router();
const db = require("../models/db");

// Create a new person
router.post("/", async (req, res) => {
  try {
    const personId = await db.addPerson(req.body);
    res.status(201).json({ id: personId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all people
router.get("/", async (req, res) => {
  try {
    const people = await db.getAllPeople();
    res.json(people);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific person
router.get("/:id", async (req, res) => {
  try {
    const person = await db.getPerson(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });
    res.json(person);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a person
router.put("/:id", async (req, res) => {
  try {
    await db.updatePerson(req.params.id, req.body);
    res.json({ message: "Person updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a person
router.delete("/:id", async (req, res) => {
  try {
    await db.deletePerson(req.params.id);
    res.json({ message: "Person deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
