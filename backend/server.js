const express = require('express');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const { Pool } = require("pg");
const path = require("path");
const session = require('express-session');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session must come BEFORE routes
app.use(session({
    secret: 'parkSmartSecret123!',
    resave: false,
    saveUninitialized: false,
}));

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

            req.session.email = email; // ✅ Save session here
            console.log("🔑 Admin logged in.");
            return res.redirect("/admin/updateSlots");

        } else if (user_type === 'user') {
            const result = await pool.query("SELECT * FROM USERS WHERE E_mail = $1", [email]);
            if (result.rows.length === 0) return res.status(401).send("❌ User not found.");

            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).send("❌ Incorrect user password.");

            console.log("👤 User logged in.");
            return res.redirect(`/user/parking?location=${encodeURIComponent(user.location)}&userId=${user.user_id}`);

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
    const { fname, lname, email, phone, user_type, password, vehicle_no, vehicle_type, location } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const userResult = await pool.query(`
           INSERT INTO USERS (Fname, Lname, E_mail, Phone_No, User_Type, Password, Location)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING User_Id;
        `, [fname, lname, email, phone, user_type, hashedPassword, location]); // ✅ Added location here

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
    try {
      const result = await pool.query("SELECT * FROM PARKING_LOTS");
      const noLotsAvailable = result.rows.every(lot => lot.available_slots === 0);
  
      res.render("pages/availableSlots", {
        lots: result.rows,
        noLotsAvailable // 👈 passed to EJS
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  });
  

// Book Slot Page
app.get("/bookSlot/:slotId", async (req, res) => {
    const { slotId } = req.params;
    const userId = req.query.userId;

    try {
        const vehicles = await pool.query("SELECT * FROM VEHICLES WHERE User_Id = $1", [userId]);

        if (vehicles.rows.length === 0) {
            return res.redirect(`/addVehicle?userId=${userId}&slotId=${slotId}`);
        }

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
        const active = await pool.query(
            "SELECT * FROM RESERVATIONS WHERE User_Id = $1 AND Reservation_Status = 'Confirmed'",
            [userId]
        );

        if (active.rows.length > 0) {
            return res.status(400).send("⚠️ You already have an active reservation.");
        }

        const result = await pool.query(`
            INSERT INTO RESERVATIONS (User_Id, Slot_Id, Start_Time, Reservation_Status)
            VALUES ($1, $2, CURRENT_TIMESTAMP, 'Confirmed')
            RETURNING *;
        `, [userId, slotId]);

        await pool.query("Call mark_slot_as_booked($1)",[slotId]);
        
        await pool.query(`
            UPDATE PARKING_LOTS 
            SET available_slots = GREATEST(available_slots - 1, 0)
            WHERE lot_id = (
                SELECT lot_id FROM PARKING_SLOTS WHERE slot_id = $1
            )
        `, [slotId]);
        const reservation = result.rows[0];

        res.render("pages/confirmBooking", {
            reservationId: reservation.reservation_id,
            startTime: reservation.start_time,
            endTime: reservation.end_time || 'N/A',
            userId: reservation.user_id
        });
    } catch (err) {
        console.error("Booking failed:", err);

        // ✅ Add this condition to catch your PostgreSQL trigger error
        if (err.message.includes("Slots full in the selected parking lot")) {
            return res.status(400).send("❌ No slots available in this parking lot.");
        }

        res.status(500).send("❌ Booking failed.");
    }
});
// Return available slots JSON
app.get("/api/availableSlots", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM PARKING_LOTS");
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching slots:", err);
        res.status(500).json({ error: "Failed to fetch slots" });
    }
});

// Admin Slot Management
app.get("/admin/updateSlots", async (req, res) => {
    const adminEmail = req.session.email;
    try {
        const adminResult = await pool.query("SELECT * FROM ADMIN WHERE Email = $1", [adminEmail]);
        const admin = adminResult.rows[0];

        const lotResult = await pool.query("SELECT * FROM PARKING_LOTS WHERE Lot_Id = $1", [admin.lot_id]);

        res.render("pages/updateSlots", { lots: lotResult.rows });
    } catch (err) {
        console.error("Error fetching admin lot:", err);
        res.status(500).send("Error loading data.");
    }
});

// Update available slots
app.post("/admin/updateSlots", async (req, res) => {
    const { lot_id, available_slots } = req.body;
    try {
        const totalQuery = await pool.query("SELECT total_slots FROM PARKING_LOTS WHERE lot_id = $1", [lot_id]);
        const totalSlots = totalQuery.rows[0].total_slots;

        if (parseInt(available_slots) > totalSlots) {
            return res.status(400).send("Available slots cannot exceed total slots.");
        }

        await pool.query("UPDATE PARKING_LOTS SET available_slots = $1 WHERE lot_id = $2", [available_slots, lot_id]);
        res.redirect("/admin/updateSlots");
    } catch (err) {
        console.error("Error updating slots:", err);
        res.status(500).send("Update failed.");
    }
});

// Decrease slot by 1
app.post("/admin/decreaseSlot", async (req, res) => {
    const { lot_id } = req.body;
    try {
        await pool.query(`
            UPDATE PARKING_LOTS 
            SET available_slots = GREATEST(available_slots - 1, 0) 
            WHERE lot_id = $1
        `, [lot_id]);
        res.redirect("/admin/updateSlots");
    } catch (err) {
        console.error("Error decreasing slot:", err);
        res.status(500).send("Failed to decrease slot.");
    }
});

// DELETE SLOT
app.post("/admin/deleteSlot", async (req, res) => {
    const { lot_id, slot_no } = req.body;
    try {
        await pool.query("DELETE FROM PARKING_SLOTS WHERE Lot_Id = $1 AND Slot_No = $2", [lot_id, slot_no]);
        await pool.query(`
            UPDATE PARKING_LOTS 
            SET total_slots = total_slots - 1, 
                available_slots = GREATEST(available_slots - 1, 0) 
            WHERE Lot_Id = $1
        `, [lot_id]);
        res.redirect("/admin/updateSlots");
    } catch (err) {
        console.error("Error deleting slot:", err);
        res.status(500).send("Slot deletion failed.");
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
