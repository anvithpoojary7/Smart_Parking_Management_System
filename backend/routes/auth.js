const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Database connection
const bcrypt = require('bcrypt');

// Admin Signup Route (Only one admin per parking lot, email must be unique)


// User Signup
// === USER SIGNUP ===
router.post('/signup/user', async (req, res) => {
    const { fname, lname, email, password, phone, user_type } = req.body;

    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        await db.query(
            `INSERT INTO USERS (Fname, Lname, E_mail, Password, Phone_No, User_Type)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [fname, lname, email, hashedPassword, phone, user_type]
        );

        // ✅ DIFFERENT SUCCESS OUTPUT
        res.status(201).send("✅ User registered successfully! You can now log in as a user.");
    } catch (err) {
        console.error("🔥 User signup error:", err.message);
        // ❌ DIFFERENT ERROR OUTPUT
        res.status(500).send("🚨 Failed to register user. Please try again later.");
    }
});


// === ADMIN SIGNUP ===
router.post('/signup/admin', async (req, res) => {
    const { name, email, password, lot_id } = req.body;

    try {
        // Check if admin exists for the lot
        const adminCheck = await db.query(
            'SELECT * FROM ADMIN WHERE Lot_Id = $1',
            [lot_id]
        );

        if (adminCheck.rowCount > 0) {
            return res.status(400).send("❌ This parking lot already has an admin.");
        }

        // Check if email is taken
        const emailCheck = await db.query(
            'SELECT * FROM ADMIN WHERE Email = $1',
            [email]
        );

        if (emailCheck.rowCount > 0) {
            return res.status(400).send("❌ This admin email is already in use.");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new admin
        await db.query(
            'INSERT INTO ADMIN (Name, Email, Password, Lot_Id) VALUES ($1, $2, $3, $4)',
            [name, email, hashedPassword, lot_id]
        );

        // ✅ DIFFERENT SUCCESS OUTPUT
        res.status(201).send("✅ Admin registered successfully! You can now log in as admin.");
    } catch (err) {
        console.error("🔥 Admin signup error:", err.message);
        // ❌ DIFFERENT ERROR OUTPUT
        res.status(500).send("🚨 Failed to register admin. Please contact support.");
    }
});


module.exports = router;
