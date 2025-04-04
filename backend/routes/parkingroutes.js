const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import database connection

// Fetch all parking slots
router.get('/slots', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM parking_slots");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
