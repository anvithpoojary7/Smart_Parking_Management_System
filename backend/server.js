const express = require('express');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
// Load environment variables just once at the beginning
require('dotenv').config();

const app = express();

// Set up middleware FIRST
app.use(express.json());
app.use(express.urlencoded({extended: true}));

// THEN register routes
const authRoutes = require("./routes/auth");
app.use("/", authRoutes);

const { Pool } = require("pg"); // PostgreSQL client

// Import and use the routes
const parkingRoutes = require('./routes/parkingroutes');
app.use('/api/parking', parkingRoutes);

const pool = new Pool({
    connectionString: 'postgres://postgres:1234@localhost:5432/smart_parking_management'
});

const path = require("path");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../frontend/views"));

app.use(express.static(path.join(__dirname, "../frontend/public")));

// Rest of your code...

app.get("/",(req,res)=>{
    res.render("pages/home");
})

app.get("/login", (req, res) => {
    res.render("pages/login");
});

app.post("/login", async (req, res) => {
    const { email, password, user_type } = req.body;

    try {
        if (user_type === 'admin') {
            const result = await pool.query("SELECT * FROM ADMIN WHERE Email = $1", [email]);

            if (result.rows.length === 0) {
                return res.status(401).send("❌ Admin not found.");
            }

            const admin = result.rows[0];

            const isMatch = await bcrypt.compare(password, admin.password);
            if (!isMatch) {
                return res.status(401).send("❌ Incorrect admin password.");
            }

            console.log("🔑 Admin logged in.");
            return res.redirect("/admin/updateSlots");

        } else if (user_type === 'user') {
            const result = await pool.query("SELECT * FROM USERS WHERE E_mail = $1", [email]);

            if (result.rows.length === 0) {
                return res.status(401).send("❌ User not found.");
            }

            const user = result.rows[0];

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).send("❌ Incorrect user password.");
            }

            console.log("👤 User logged in.");
            return res.redirect("/user/parking?location=Downtown");

        } else {
            return res.status(400).send("❌ Invalid user type.");
        }
    } catch (err) {
        console.error("❌ Login error:", err);
        res.status(500).send("🚨 Login failed.");
    }
});



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
    const { fname, lname, email, phone, user_type } = req.body;

    try {
        await pool.query(`
            INSERT INTO USERS (Fname, Lname, E_mail, Phone_No, User_Type)
            VALUES ($1, $2, $3, $4, $5);
        `, [fname, lname, email, phone, user_type]);

        console.log("✅ Signup success, redirecting to login...");
        res.redirect("/login");
    } catch (err) {
        console.error("❌ Error during signup:", err);
        res.status(500).send("Signup failed.");
    }
});

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
        // Optional: Check if available_slots <= Total_Slots
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
        // Ensure available_slots doesn’t go below 0
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




// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something went wrong!");
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));