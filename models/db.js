const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create a new database instance
const db = new sqlite3.Database(path.join(__dirname, '../face_recognition.db'));

// Initialize database tables
db.serialize(() => {
    // Create People table
    db.run(`CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER,
        address TEXT,
        info TEXT,
        email TEXT,
        phone TEXT,
        gender TEXT,
        nationality TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create face_references table for face images
    db.run(`CREATE TABLE IF NOT EXISTS face_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        imageData BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES people(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observer_id TEXT NOT NULL,
        detected_person_id INTEGER NOT NULL,
        photo BLOB NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (detected_person_id) REFERENCES people(id) ON DELETE CASCADE
    )`);
});

// Helper functions for database operations
const dbOperations = {
    // People operations
    addPerson: (personData) => {
        return new Promise((resolve, reject) => {
            const { name, age, address, info, email, phone, gender, nationality } = personData;
            db.run(
                `INSERT INTO people (name, age, address, info, email, phone, gender, nationality)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, age, address, info, email, phone, gender, nationality],
                function (err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                }
            );
        });
    },

    getPerson: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM people WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },

    getAllPeople: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM people', (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },

    updatePerson: (id, personData) => {
        const updates = Object.keys(personData).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(personData), id];

        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE people SET ${updates} WHERE id = ?`,
                values,
                (err) => {
                    if (err) reject(err);
                    resolve(true);
                }
            );
        });
    },

    deletePerson: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM people WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                resolve(true);
            });
        });
    },

    // Reference operations
    addReference: (userId, imageBase64) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO face_references (userId, imageData) VALUES (?, ?)',
                [userId, imageBase64],
                function (err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                }
            );
        });
    },

    getReferences: (userId) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM face_references WHERE userId = ?', [userId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },

    deleteReference: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM face_references WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                resolve(true);
            });
        });
    },

    addNotification: ({ observer_id, detected_person_id, photo }) => {
        return new Promise((resolve, reject) => {
          const sql = `INSERT INTO notifications (observer_id, detected_person_id, photo, timestamp) VALUES (?, ?, ?, datetime('now'))`;
          db.run(sql, [observer_id, detected_person_id, photo], function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
          });
        });
      },

    getNotificationsByPersonId: (personId) => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM notifications WHERE detected_person_id = ?`,
                [personId],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                }
            );
        });
    },

    getAllNotifications: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM notifications', (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },

    deleteNotification: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM notifications WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                resolve(true);
            });
        });
    },

};

module.exports = dbOperations; 