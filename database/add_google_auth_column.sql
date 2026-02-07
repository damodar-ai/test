-- Add isGoogleAuth column to users table for Google OAuth support

USE corp_hotel_booking;

ALTER TABLE users 
ADD COLUMN isGoogleAuth BOOLEAN DEFAULT FALSE 
AFTER isActive;

-- Verify the column was added
DESCRIBE users;
