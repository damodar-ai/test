# Backend API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST `/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "user",
    "corporateClientId": null
  }
}
```

#### POST `/auth/register`
Create a new user account.

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1-555-1234"
}
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": 2,
    "email": "newuser@example.com",
    "role": "user"
  }
}
```

#### GET `/auth/profile` (Protected)
Get current user profile.

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1-555-1234",
  "role": "user",
  "corporateClientId": null
}
```

### Hotels

#### GET `/hotels`
List all available hotels with pagination.

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 10)
- `city` (optional) - Filter by city

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Grand Business Plaza",
      "city": "New York",
      "address": "123 Business St",
      "country": "USA",
      "rating": 4.8,
      "totalRooms": 250
    }
  ],
  "pagination": {
    "total": 10,
    "page": 1,
    "limit": 10
  }
}
```

#### GET `/hotels/:id`
Get details for a specific hotel.

**Response:**
```json
{
  "id": 1,
  "name": "Grand Business Plaza",
  "description": "Premium corporate hotel in downtown",
  "address": "123 Business St",
  "city": "New York",
  "country": "USA",
  "postalCode": "10001",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "rating": 4.8,
  "totalRooms": 250,
  "amenities": ["WiFi", "Meeting Rooms", "Gym"],
  "contactEmail": "reservations@grandplaza.com",
  "contactPhone": "+1-555-0101"
}
```

#### GET `/hotels/:id/rooms`
Get available room types for a hotel between specific dates.

**Query Parameters:**
- `checkInDate` (required) - Format: YYYY-MM-DD
- `checkOutDate` (required) - Format: YYYY-MM-DD

**Response:**
```json
[
  {
    "id": 1,
    "hotelId": 1,
    "name": "Standard Room",
    "description": "Basic comfortable room",
    "capacity": 2,
    "basePrice": 150,
    "corporatePrice": 120,
    "amenities": ["WiFi", "TV"],
    "availableCount": 10
  },
  {
    "id": 2,
    "hotelId": 1,
    "name": "Business Suite",
    "description": "Suite with work area",
    "capacity": 2,
    "basePrice": 250,
    "corporatePrice": 200,
    "amenities": ["WiFi", "Desk", "Meeting Space"],
    "availableCount": 5
  }
]
```

### Bookings

#### POST `/bookings` (Protected)
Create a new booking.

**Request:**
```json
{
  "hotelId": 1,
  "roomId": 1,
  "checkInDate": "2025-12-20",
  "checkOutDate": "2025-12-22",
  "roomQuantity": 1,
  "guestName": "John Doe",
  "guestEmail": "john@example.com",
  "guestPhone": "+1-555-1234",
  "specialRequests": "High floor preferred"
}
```

**Response:**
```json
{
  "id": 1,
  "bookingNumber": "BK123456789",
  "totalPrice": 300,
  "discount": -60,
  "finalPrice": 240,
  "message": "Booking created successfully"
}
```

#### GET `/bookings` (Protected)
Get user's bookings with optional status filter.

**Query Parameters:**
- `status` (optional) - Filter by status: confirmed, cancelled, completed

**Response:**
```json
[
  {
    "id": 1,
    "bookingNumber": "BK123456789",
    "hotelName": "Grand Business Plaza",
    "roomType": "Standard Room",
    "checkInDate": "2025-12-20",
    "checkOutDate": "2025-12-22",
    "finalPrice": 240,
    "bookingStatus": "confirmed"
  }
]
```

#### GET `/bookings/:id` (Protected)
Get specific booking details.

**Response:**
```json
{
  "id": 1,
  "bookingNumber": "BK123456789",
  "hotelName": "Grand Business Plaza",
  "address": "123 Business St",
  "city": "New York",
  "roomType": "Standard Room",
  "checkInDate": "2025-12-20",
  "checkOutDate": "2025-12-22",
  "guestName": "John Doe",
  "guestEmail": "john@example.com",
  "finalPrice": 240,
  "bookingStatus": "confirmed"
}
```

#### PUT `/bookings/:id/cancel` (Protected)
Cancel a booking.

**Response:**
```json
{
  "message": "Booking cancelled successfully"
}
```

### Admin Dashboard

#### GET `/admin/dashboard` (Protected - Admin Only)
Get dashboard statistics.

**Response:**
```json
{
  "totalBookings": 150,
  "totalUsers": 75,
  "totalHotels": 25,
  "totalRevenue": 45000,
  "pendingBookings": 12
}
```

#### GET `/admin/bookings/list` (Protected - Admin Only)
Get all bookings with filters.

**Query Parameters:**
- `status` (optional)
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "bookingNumber": "BK123456789",
      "hotelName": "Grand Business Plaza",
      "userEmail": "john@example.com",
      "checkInDate": "2025-12-20",
      "bookingStatus": "confirmed"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50
  }
}
```

#### GET `/admin/hotels/stats` (Protected - Admin Only)
Get statistics for each hotel.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Grand Business Plaza",
    "city": "New York",
    "totalBookings": 45,
    "totalRevenue": 15000,
    "totalRooms": 250
  }
]
```

#### GET `/admin/users/stats` (Protected - Admin Only)
Get user statistics by date.

**Response:**
```json
[
  {
    "date": "2025-12-15",
    "newUsers": 5,
    "bookingsMade": 10,
    "revenue": 2500
  }
]
```

## Demo Credentials

**Admin Account:**
- Email: `admin@corp-hotel.com`
- Password: `admin@123`

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing required fields"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid credentials"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied"
}
```

### 404 Not Found
```json
{
  "error": "Hotel not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error"
}
```

## Color Coding System

- **Primary Blue:** #1e3a8a - Main branding
- **Secondary Teal:** #0891b2 - Secondary actions
- **Accent Gold:** #f59e0b - Highlights and CTAs
- **Success Green:** #10b981 - Confirmations
- **Warning Orange:** #f97316 - Warnings
- **Error Red:** #ef4444 - Errors
