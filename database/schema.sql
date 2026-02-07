-- =============================================
-- 1. DATABASE INITIALIZATION
-- =============================================
CREATE DATABASE IF NOT EXISTS corp_hotel_booking;
USE corp_hotel_booking;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================
-- 2. RESET/DROP EXISTING TABLES
-- =============================================
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS payment_records;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS room_types;
DROP TABLE IF EXISTS CorporateSearch;
DROP TABLE IF EXISTS HotelPosts;
DROP TABLE IF EXISTS CorporateDetails;
DROP TABLE IF EXISTS HotelDetails;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS GoogleAuthUsers;

-- Re-enable Foreign Key checks for creation
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================
-- 3. IDENTITY & PROFILE TABLES
-- =============================================
-- Table: users (Unified table matching auth.ts)
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255),
    firstName VARCHAR(100),
    lastName VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'user', -- 'admin', 'user'
    corporateClientId BIGINT,
    
    -- New fields for Profile Flow
    identityType ENUM('Hotel', 'Corporate') DEFAULT NULL,
    isProfileCompleted BOOLEAN DEFAULT FALSE,
    
    isGoogleAuth BOOLEAN DEFAULT FALSE,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_users_email (email),
    INDEX idx_users_identity (identityType)
);

-- Table: HotelDetails
CREATE TABLE HotelDetails (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    userId BIGINT NOT NULL, -- Changed from GoogleAuthUsers_Id
    HotelName VARCHAR(255) NOT NULL,
    City VARCHAR(100) NOT NULL,
    State VARCHAR(100),
    Country VARCHAR(100),
    Pincode VARCHAR(20),
    Address TEXT,
    ContactNumber VARCHAR(20),
    ContactEmail VARCHAR(255),
    SupervisorName VARCHAR(100),
    SupervisorEmail VARCHAR(255),
    SupervisorContact VARCHAR(20),
    StarCategory INT CHECK (StarCategory BETWEEN 1 AND 5),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_hotel_user FOREIGN KEY (userId) 
        REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_hotel_city (City),
    INDEX idx_hotel_name (HotelName)
);

-- Table: CorporateDetails
CREATE TABLE CorporateDetails (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    userId BIGINT NOT NULL, -- Changed from GoogleAuthUsers_Id
    CompanyName VARCHAR(255) NOT NULL,
    IndustryType VARCHAR(100),
    City VARCHAR(100),
    State VARCHAR(100),
    Country VARCHAR(100),
    Pincode VARCHAR(20),
    OfficeAddress TEXT,
    ContactNumber VARCHAR(20),
    ContactEmail VARCHAR(255),
    SupervisorName VARCHAR(100),
    SupervisorEmail VARCHAR(255),
    SupervisorContact VARCHAR(20),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_corp_user FOREIGN KEY (userId) 
        REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_corp_name (CompanyName)
);

-- =============================================
-- 4. MARKETING & SEARCH TABLES
-- =============================================

-- Table: HotelPosts
CREATE TABLE HotelPosts (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    HotelDetails_Id BIGINT NOT NULL,
    Title VARCHAR(255) NOT NULL,
    Description TEXT,
    Price DECIMAL(10, 2),
    MinPrice DECIMAL(10, 2),
    MaxPrice DECIMAL(10, 2),
    AvailableDate DATE,
    StartDate DATE,
    EndDate DATE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_posts_hotel FOREIGN KEY (HotelDetails_Id) 
        REFERENCES HotelDetails(Id) ON DELETE CASCADE,
    INDEX idx_posts_price (Price)
);

-- Table: Chat
CREATE TABLE Chat (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    CorporateDetails_Id BIGINT,
    HotelDetails_Id BIGINT,
    HotelPosts_Id BIGINT,
    Message TEXT NOT NULL,
    SenderType ENUM('Hotel', 'Corporate') NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_chat_corp FOREIGN KEY (CorporateDetails_Id) 
        REFERENCES CorporateDetails(Id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_hotel FOREIGN KEY (HotelDetails_Id) 
        REFERENCES HotelDetails(Id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_post FOREIGN KEY (HotelPosts_Id) 
        REFERENCES HotelPosts(Id) ON DELETE SET NULL
);

-- Table: CorporateSearch
CREATE TABLE CorporateSearch (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    CorporateDetails_Id BIGINT NOT NULL,
    SearchQuery VARCHAR(255),
    PreferredLocation VARCHAR(100),
    MinPrice DECIMAL(10, 2),
    MaxPrice DECIMAL(10, 2),
    SearchTimestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_search_corp FOREIGN KEY (CorporateDetails_Id) 
        REFERENCES CorporateDetails(Id) ON DELETE CASCADE
);

-- =============================================
-- 5. INVENTORY & ROOM TABLES
-- =============================================

-- Table: room_types
CREATE TABLE room_types (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    HotelDetails_Id BIGINT NOT NULL,
    Name VARCHAR(100) NOT NULL,
    Description TEXT,
    Capacity INT NOT NULL,
    BasePrice DECIMAL(10, 2) NOT NULL,
    CorporatePrice DECIMAL(10, 2), -- Discounted price for corporates
    Amenities JSON,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_rt_hotel FOREIGN KEY (HotelDetails_Id) 
        REFERENCES HotelDetails(Id) ON DELETE CASCADE
);


-- =============================================
-- 6. TRANSACTION TABLES (BOOKINGS & PAYMENTS)
-- =============================================
-- Table: bookings
CREATE TABLE bookings (
     Id BIGINT AUTO_INCREMENT PRIMARY KEY,
     BookingNumber VARCHAR(50) UNIQUE NOT NULL,
     userId BIGINT NOT NULL, -- User who booked
     CorporateDetails_Id BIGINT,         -- Optional: if booked for a company
     HotelDetails_Id BIGINT NOT NULL,
     RoomTypes_Id BIGINT NOT NULL, -- CHANGED: Link to Room Type
     -- Rooms_Id BIGINT, -- REMOVED: No longer linking to specific room
     
     CheckInDate DATE NOT NULL,
     CheckOutDate DATE NOT NULL,
    RoomQuantity INT DEFAULT 1,
    GuestCount INT DEFAULT 1, -- Capacity
    GuestName VARCHAR(255) NOT NULL,
     GuestEmail VARCHAR(255) NOT NULL,
     GuestPhone VARCHAR(20),
     SpecialRequests TEXT,
     TotalPrice DECIMAL(12, 2) NOT NULL,
     Discount DECIMAL(10, 2) DEFAULT 0,
     FinalPrice DECIMAL(12, 2),
     PaymentStatus ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
     BookingStatus ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show') DEFAULT 'pending',
     
     -- Approval workflow fields
     ApprovedAt TIMESTAMP NULL,
     RejectionReason TEXT NULL,
     
     CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

     -- CONSTRAINTS (Foreign Keys)
     CONSTRAINT fk_bk_user FOREIGN KEY (userId) 
        REFERENCES users(id) ON DELETE CASCADE,
     CONSTRAINT fk_bk_corp FOREIGN KEY (CorporateDetails_Id) 
        REFERENCES CorporateDetails(Id) ON DELETE SET NULL,
     CONSTRAINT fk_bk_hotel FOREIGN KEY (HotelDetails_Id) 
        REFERENCES HotelDetails(Id) ON DELETE RESTRICT,
     CONSTRAINT fk_bk_roomtype FOREIGN KEY (RoomTypes_Id) 
        REFERENCES room_types(Id) ON DELETE RESTRICT,
     
     -- INDEXES
     INDEX idx_bk_dates (CheckInDate, CheckOutDate),
     INDEX idx_bk_status (BookingStatus),
     INDEX idx_bk_hotel (HotelDetails_Id)
);

-- Table: payment_records
CREATE TABLE payment_records (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    Bookings_Id BIGINT NOT NULL,
    Amount DECIMAL(12, 2) NOT NULL,
    PaymentMethod VARCHAR(50),
    TransactionId VARCHAR(255),
    Status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_pay_booking FOREIGN KEY (Bookings_Id) 
        REFERENCES bookings(Id) ON DELETE CASCADE,
    INDEX idx_pay_status (Status)
);

-- =============================================
-- 7. SYSTEM TABLES
-- =============================================
CREATE TABLE audit_logs (
    Id BIGINT AUTO_INCREMENT PRIMARY KEY,
    userId BIGINT,
    Action VARCHAR(255) NOT NULL,
    TableName VARCHAR(100),
    RecordId BIGINT,
    Changes JSON,
    IpAddress VARCHAR(45),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_audit_user FOREIGN KEY (userId) 
        REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_created (CreatedAt)
);
