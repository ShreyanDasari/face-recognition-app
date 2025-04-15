const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");
const db = require("../models/db");

// Add a new notification
router.post("/", upload.single("photo"), async (req, res) => {
    const { observer_id, detected_person_id } = req.body;

    if (!observer_id || !detected_person_id || !req.file) {
        return res.status(400).json({ error: "Missing required fields or photo" });
    }

    try {
        const photoData = fs.readFileSync(path.resolve(req.file.path));
        fs.unlinkSync(req.file.path); // cleanup

        const newId = await db.addNotification({
            observer_id,
            detected_person_id,
            photo: photoData
        });

        res.json({ success: true, id: newId });
    } catch (error) {
        res.status(500).json({ error: "Failed to store notification", details: error.message });
    }
});

// Get all notifications
router.get("/", async (req, res) => {
    try {
        const notifications = await db.getAllNotifications();
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch notifications", details: error.message });
    }
});

// Get notifications for a specific detected_person_id
router.get("/person/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const results = await db.getNotificationsByPersonId(id);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch person notifications", details: error.message });
    }
});

// Delete a notification by ID
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await db.deleteNotification(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete notification", details: error.message });
    }
});

router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const notification = await db.getNotificationById(id);
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch notification", details: error.message });
    }
});
module.exports = router;
