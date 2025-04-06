const express = require('express');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const { Pool } = require("pg");
const path = require("path");

require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL pool
const pool = new Pool({
    connectionString: 'postgres://postgres:1234@localhost:5432/smart_parking_management'
});

// EJS Views and Static Files
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../frontend/views"));
app.use(express.static(path.join(__dirname, "../frontend/public")));

// Routes
const authRoutes = require("./routes/auth");
const parkingRoutes = require('./routes/parkingroutes');
app.use("/", authRoutes);
app.use("/api/parking", parkingRoutes);

// Root Route
app.get("/", (req, res) => {
    res.render("pages/home");
});

// Login Routes
app.get("/login", (req, res) => {
    res.render("pages/login");
});

app.post("/login", async (req, res) => {
    const { email, password, user_type } = req.body;

    try {
        if (user_type === 'admin') {
            const result = await pool.query("SELECT * FROM ADMIN WHERE Email = $1", [email]);
            if (result.rows.length === 0) return res.status(401).send("❌ Admin not found.");

            const admin = result.rows[0];
            const isMatch = await bcrypt.compare(password, admin.password);
            if (!isMatch) return res.status(401).send("❌ Incorrect admin password.");

            console.log("🔑 Admin logged in.");
            return res.redirect("/admin/updateSlots");

        } else if (user_type === 'user') {
            const result = await pool.query("SELECT * FROM USERS WHERE E_mail = $1", [email]);
            if (result.rows.length === 0) return res.status(401).send("❌ User not found.");

            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).send("❌ Incorrect user password.");

            console.log("👤 User logged in.");
            req.userId = user.user_id; // Simulating session
            return res.redirect(`/user/parking?location=Downtown&userId=${user.user_id}`);

        } else {
            return res.status(400).send("❌ Invalid user type.");
        }
    } catch (err) {
        console.error("❌ Login error:", err);
        res.status(500).send("🚨 Login failed.");
    }
});

// Signup Routes
app.get("/signup", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM PARKING_LOTS");
        res.render("pages/signup", { lots: result.rows });
    } catch (err) {
        console.error("Error fetching parking lots:", err);
        res.status(500).send("Server error");
    }
});

app.post("/signup", async (req, res) => {
    const { fname, lname, email, phone, user_type, password, vehicle_no, vehicle_type } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await pool.query(`
            INSERT INTO USERS (Fname, Lname, E_mail, Phone_No, User_Type, Password)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING User_Id;
        `, [fname, lname, email, phone, user_type, hashedPassword]);

        const userId = userResult.rows[0].user_id;

        await pool.query(`
            INSERT INTO VEHICLES (User_Id, Vehicle_No, Vehicle_Type, Register_Date)
            VALUES ($1, $2, $3, CURRENT_DATE);
        `, [userId, vehicle_no, vehicle_type]);

        console.log("✅ Signup success, redirecting to login...");
        res.redirect("/login");
    } catch (err) {
        console.error("❌ Error during signup:", err);
        res.status(500).send("Signup failed.");
    }
});

// User Parking View
app.get("/user/parking", async (req, res) => {
    const { location } = req.query;
    try {
        const result = await pool.query(
            "SELECT * FROM PARKING_LOTS WHERE Location = $1",
            [location]
        );
        res.render("pages/availableSlots", { lots: result.rows, location });
    } catch (err) {
        console.error("Error fetching slots:", err);
        res.status(500).send("Something went wrong.");
    }
});

// Book Slot Page
app.get("/bookSlot/:slotId", async (req, res) => {
   const { slotId } = req.params;
    const userId = req.query.userId;

    try {
        const vehicles = await pool.query("SELECT * FROM VEHICLES WHERE User_Id = $1", [userId]);

        if (vehicles.rows.length === 0) {
            // No vehicle exists, redirect to add vehicle page
            return res.redirect(`/addVehicle?userId=${userId}&slotId=${slotId}`);
        }

        // Proceed as before if vehicle exists
        res.render("pages/bookSlot", { slotId, vehicles: vehicles.rows, userId });
    } catch (err) {
        console.error("Error checking vehicles:", err);
        res.status(500).send("Error loading booking page.");
    }
});

// Confirm Booking
app.post("/user/bookSlot", async (req, res) => {
    const { userId, slotId, vehicleId } = req.body;

    try {
        // Check if user already has an active reservation
        const active = await pool.query(
            "SELECT * FROM RESERVATIONS WHERE User_Id = $1 AND Reservation_Status = 'Confirmed'",
            [userId]
        );

        if (active.rows.length > 0) {
            return res.status(400).send("⚠️ You already have an active reservation.");
        }

        // Insert new reservation
        const result = await pool.query(`
            INSERT INTO RESERVATIONS (User_Id, Slot_Id, Start_Time, Reservation_Status)
            VALUES ($1, $2, CURRENT_TIMESTAMP, 'Confirmed')
            RETURNING *;
        `, [userId, slotId]);

        // Mark the slot as occupied
        await pool.query(
            "UPDATE PARKING_SLOTS SET Status = 'Occupied' WHERE Slot_Id = $1",
            [slotId]
        );

        const reservation = result.rows[0];

        // ✅ Only pass required values to confirmation page
        res.render("pages/confirmBooking", {
            reservationId: reservation.reservation_id,
            startTime: reservation.start_time,
            endTime: reservation.end_time || 'N/A',
            userId: reservation.user_id
        });
    } catch (err) {
        console.error("Booking failed:", err);
        res.status(500).send("❌ Booking failed.");
    }
});



// Admin Slot Management
app.get("/admin/updateSlots", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM PARKING_LOTS");
        res.render("pages/updateSlots", { lots: result.rows });
    } catch (err) {
        console.error("Error fetching parking lots:", err);
        res.status(500).send("Error loading parking lot data.");
    }
});

app.post("/admin/updateSlots", async (req, res) => {
    const { lot_id, available_slots } = req.body;

    try {
        const totalQuery = await pool.query("SELECT Total_Slots FROM PARKING_LOTS WHERE Lot_Id = $1", [lot_id]);
        const totalSlots = totalQuery.rows[0].total_slots;

        if (parseInt(available_slots) > totalSlots) {
            return res.status(400).send("Available slots cannot exceed total slots.");
        }

        await pool.query(
            "UPDATE PARKING_LOTS SET Available_Slots = $1 WHERE Lot_Id = $2",
            [available_slots, lot_id]
        );

        res.redirect("/admin/updateSlots");
    } catch (err) {
        console.error("Error updating slots:", err);
        res.status(500).send("Update failed");
    }
});

app.get('/admin/decreaseSlot', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parking_lots ORDER BY parking_lot_name');
        res.render('decreaseSlot', { lots: result.rows });
    } catch (err) {
        console.error('Error fetching lots:', err);
        res.status(500).send('❌ Server Error.');
    }
});

app.post('/admin/decreaseSlot', async (req, res) => {
    const lotId = req.body.lot_id;

    try {
        await pool.query(`
            UPDATE parking_lots 
            SET available_slots = GREATEST(available_slots - 1, 0) 
            WHERE lot_id = $1
        `, [lotId]);

        res.redirect('/admin/updateSlots');
    } catch (err) {
        console.error('Error decreasing slot:', err);
        res.status(500).send('❌ Server Error while decreasing slot.');
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something went wrong!");
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));