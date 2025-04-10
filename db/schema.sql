-- USERS table
CREATE TABLE USERS (
    User_Id SERIAL PRIMARY KEY,
    Fname VARCHAR(50),
    Lname VARCHAR(50),
    E_mail VARCHAR(100) UNIQUE,
    Phone_No VARCHAR(15),
    User_Type VARCHAR(20)
);

ALTER TABLE USERS
ADD COLUMN Password TEXT;

ALTER TABLE ADMIN
ADD COLUMN Lot_Id INT UNIQUE REFERENCES PARKING_LOTS(Lot_Id) ON DELETE SET NULL;

-- VEHICLES table
CREATE TABLE VEHICLES (
    Vehicle_Id SERIAL PRIMARY KEY,
    User_Id INT REFERENCES USERS(User_Id) ON DELETE CASCADE,
    Vehicle_No VARCHAR(20) UNIQUE NOT NULL,
    Vehicle_Type VARCHAR(20),
    Register_Date DATE
);

-- PARKING_LOTS table
CREATE TABLE PARKING_LOTS (
    Lot_Id SERIAL PRIMARY KEY,
    Parking_Lot_Name VARCHAR(100),
    Location VARCHAR(100),
    Total_Slots INT,
    Available_Slots INT
);
select *from PARKING_LOTS
select *from PARKING_SLOTS

INSERT INTO PARKING_SLOTS (Slot_No, Lot_Id, Location, Slot_Type, Status)
VALUES 
  ('A1', 2, 'Downtown', 'Compact', 'Available'),
  ('A2', 2, 'Downtown', 'Compact', 'Available'),
  ('A3', 2, 'Downtown', 'SUV', 'Available'),
  ('A4', 2, 'Downtown', 'EV', 'Available'),
  ('A5', 2, 'Downtown', 'Bike', 'Available');


-- PARKING_SLOTS table
CREATE TABLE PARKING_SLOTS (
    Slot_Id SERIAL PRIMARY KEY,
    Slot_No VARCHAR(20),
    Lot_Id INT REFERENCES PARKING_LOTS(Lot_Id) ON DELETE CASCADE,
    Location VARCHAR(100),
    Slot_Type VARCHAR(50),
    Status VARCHAR(20)  -- Available, Occupied
);

-- RESERVATIONS table
CREATE TABLE RESERVATIONS (
    Reservation_Id SERIAL PRIMARY KEY,
    User_Id INT REFERENCES USERS(User_Id) ON DELETE CASCADE,
    Slot_Id INT REFERENCES PARKING_SLOTS(Slot_Id) ON DELETE CASCADE,
    Start_Time TIMESTAMP,
    End_Time TIMESTAMP,
    Reservation_Status VARCHAR(20)  -- Pending, Confirmed, Cancelled
);

-- ENTRY_EXIT_LOGS table
CREATE TABLE ENTRY_EXIT_LOGS (
    Log_Id SERIAL PRIMARY KEY,
    Vehicle_Id INT REFERENCES VEHICLES(Vehicle_Id) ON DELETE CASCADE,
    Entry_Time TIMESTAMP,
    Exit_Time TIMESTAMP,
    Duration_Parked INT
);

-- ADMIN table
CREATE TABLE ADMIN (
    Admin_Id SERIAL PRIMARY KEY,
    Name VARCHAR(50),
    Email VARCHAR(100) UNIQUE,
    Password VARCHAR(255),
    Role VARCHAR(20)
);
select *from ADMIN
select *from USERS


INSERT INTO PARKING_LOTS (Parking_Lot_Name, Location, Total_Slots, Available_Slots)
VALUES 
('Main Street Lot', 'Downtown', 100, 80),
('Eastside Garage', 'East City', 150, 120),
('Metro Center', 'Central Park', 200, 180),
('Airport Parking', 'Airport Zone', 300, 275),
('Mall Parking', 'City Center', 120, 110);

SELECT * FROM PARKING_LOTS;

-- Decrease Available_Slots on reservation
CREATE OR REPLACE FUNCTION decrease_available_slots()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE PARKING_LOTS
    SET Available_Slots = Available_Slots - 1
    WHERE Lot_Id = (SELECT Lot_Id FROM PARKING_SLOTS WHERE Slot_Id = NEW.Slot_Id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Increase Available_Slots on cancel/delete
CREATE OR REPLACE FUNCTION increase_available_slots()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE PARKING_LOTS
    SET Available_Slots = Available_Slots + 1
    WHERE Lot_Id = (SELECT Lot_Id FROM PARKING_SLOTS WHERE Slot_Id = OLD.Slot_Id);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Auto-calculate duration on Exit_Time update
CREATE OR REPLACE FUNCTION calculate_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.Exit_Time IS NOT NULL THEN
        NEW.Duration_Parked := EXTRACT(EPOCH FROM (NEW.Exit_Time - NEW.Entry_Time)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prevent double booking for same slot/time
CREATE OR REPLACE FUNCTION prevent_double_booking()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM RESERVATIONS
        WHERE Slot_Id = NEW.Slot_Id
        AND ((NEW.Start_Time, NEW.End_Time) OVERLAPS (Start_Time, End_Time))
    ) THEN
        RAISE EXCEPTION 'Slot already reserved for this time.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- After insert reservation → decrease available slots
CREATE TRIGGER trg_decrease_slots
AFTER INSERT ON RESERVATIONS
FOR EACH ROW EXECUTE FUNCTION decrease_available_slots();

-- After delete reservation → increase available slots
CREATE TRIGGER trg_increase_slots
AFTER DELETE ON RESERVATIONS
FOR EACH ROW EXECUTE FUNCTION increase_available_slots();

-- Before update logs → calculate duration
CREATE TRIGGER trg_calculate_duration
BEFORE UPDATE ON ENTRY_EXIT_LOGS
FOR EACH ROW EXECUTE FUNCTION calculate_duration();

-- Before insert reservation → prevent double booking
CREATE TRIGGER trg_prevent_double_booking
BEFORE INSERT ON RESERVATIONS
FOR EACH ROW EXECUTE FUNCTION prevent_double_booking();

ALTER TABLE ADMIN
ADD COLUMN Lot_Id INT REFERENCES PARKING_LOTS(Lot_Id) ON DELETE CASCADE;
select *from users
select *from admin
select *from RESERVATIONS

SELECT Lot_Id, Status, COUNT(*) FROM PARKING_SLOTS
GROUP BY Lot_Id, Status;

SELECT Lot_Id, available_slots FROM PARKING_LOTS;

ALTER TABLE USERS ADD COLUMN lot_id INT REFERENCES PARKING_LOTS(lot_id);
SELECT * FROM USERS;
SELECT * FROM PARKING_LOTS;

DELETE FROM RESERVATIONS;
DELETE FROM VEHICLES;
DELETE FROM USERS;
DELETE FROM PARKING_SLOTS;
DELETE FROM PARKING_LOTS;

--Enforce 1 admin per lot
CREATE OR REPLACE FUNCTION enforce_single_admin_per_lot()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM PARKING_LOTS
        WHERE Admin_Id = NEW.Admin_Id AND Lot_Id != NEW.Lot_Id
    ) THEN
        RAISE EXCEPTION 'An admin can only manage one parking lot';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER one_admin_per_lot_trigger
BEFORE INSERT OR UPDATE ON PARKING_LOTS
FOR EACH ROW
EXECUTE FUNCTION enforce_single_admin_per_lot();

ALTER TABLE PARKING_LOTS
ADD COLUMN Admin_Id INT UNIQUE REFERENCES ADMIN(Admin_Id) ON DELETE SET NULL;

-- Drop function and trigger if they already exist
DROP TRIGGER IF EXISTS check_admin_unique ON parking_lots;
DROP FUNCTION IF EXISTS enforce_single_admin_per_lot;

-- Create the function
CREATE OR REPLACE FUNCTION enforce_single_admin_per_lot()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM parking_lots
        WHERE admin_id = NEW.admin_id AND lot_id != NEW.lot_id
    ) THEN
        RAISE EXCEPTION 'An admin can only be assigned to one parking lot.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER check_admin_unique
BEFORE INSERT OR UPDATE ON parking_lots
FOR EACH ROW
EXECUTE FUNCTION enforce_single_admin_per_lot();


-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS one_admin_per_lot_trigger ON PARKING_LOTS;

-- Drop the function if it exists
DROP FUNCTION IF EXISTS enforce_single_admin_per_lot();



CREATE OR REPLACE FUNCTION enforce_single_admin_per_lot()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM PARKING_LOTS
        WHERE Admin_Id = NEW.Admin_Id AND Lot_Id != NEW.Lot_Id
    ) THEN
        RAISE EXCEPTION 'An admin can only manage one parking lot';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER one_admin_per_lot_trigger
BEFORE INSERT OR UPDATE ON PARKING_LOTS
FOR EACH ROW
EXECUTE FUNCTION enforce_single_admin_per_lot();


