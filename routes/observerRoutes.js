const express = require("express");
const router = express.Router();
const db = require("../models/db");

router.post("/", async (req, res) => {
  try {
    const observerId = await db.addObserver(req.body);
    res.status(201).json({ id: observerId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const observers = await db.getAllObservers();
    res.json(observers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.get("/:id", async (req, res) => {
  try {
    const observer = await db.getObserver(req.params.id);
    if (!observer) return res.status(404).json({ error: "Observer not found" });
    res.json(observer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.put("/:id", async (req, res) => {
  try {
    await db.updateObserver(req.params.id, req.body);
    res.json({ message: "Observer updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.deleteObserver(req.params.id);
    res.json({ message: "Observer deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
