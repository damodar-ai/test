import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';
import { generateBookingNumber, calculateTotalPrice, getHotelDetailsId, getCorporateDetailsId } from '../utils/helpers.ts';

const router = Router();

// Corporate: Create a new booking request (status: pending)
// Updated to take roomTypeId instead of roomId
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Only corporate users can create bookings
    if (req.user?.identityType !== 'Corporate') {
      return res.status(403).json({ error: 'Only corporate users can make bookings' });
    }

    const {
      hotelDetailsId,
      roomTypeId, // Changed from roomId
      checkInDate,
      checkOutDate,
      guestName,
      guestEmail,
      guestPhone,
      guestCount,
      roomCount,
      specialRequests
    } = req.body;

    if (!hotelDetailsId || !roomTypeId || !checkInDate || !checkOutDate || !guestName || !guestEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get room type info with pricing
    const roomTypeInfo = await executeQuery(
      `SELECT Id, Name, BasePrice, CorporatePrice
             FROM room_types
             WHERE Id = ? AND HotelDetails_Id = ? AND IsActive = TRUE`,
      [roomTypeId, hotelDetailsId]
    ) as any[];

    if (roomTypeInfo.length === 0) {
      return res.status(404).json({ error: 'Room type not found or not available' });
    }

    // NOTE: removed specific room availability check as we are now doing request based
    // Hotel will accept/deny based on their own availability management

    // Get corporate details
    const corporateId = await getCorporateDetailsId(req.user!.id);

    // Use corporate price if available, otherwise base price
    const pricePerNight = roomTypeInfo[0].CorporatePrice || roomTypeInfo[0].BasePrice;

    // Calculate total price
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    const numberOfRooms = roomCount || 1;
    const totalPrice = calculateTotalPrice(pricePerNight, nights) * numberOfRooms;

    // Create booking with 'pending' status
    const bookingNumber = generateBookingNumber();

    const result = await executeQuery(
      `INSERT INTO bookings 
             (BookingNumber, UserId, CorporateDetails_Id, HotelDetails_Id, RoomTypes_Id, 
              CheckInDate, CheckOutDate, GuestName, GuestEmail, GuestPhone, GuestCount, RoomQuantity,
              SpecialRequests, TotalPrice, BookingStatus)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        bookingNumber,
        req.user?.id,
        corporateId,
        hotelDetailsId,
        roomTypeId,
        checkInDate,
        checkOutDate,
        guestName,
        guestEmail,
        guestPhone || null,
        guestCount || 1,
        numberOfRooms,
        specialRequests || null,
        totalPrice
      ]
    ) as any;

    res.status(201).json({
      id: result.insertId,
      bookingNumber,
      totalPrice,
      nights,
      status: 'pending',
      message: 'Booking request submitted. Waiting for hotel approval.'
    });
  } catch (error) {
    console.error('Booking creation error');
    res.status(500).json({ error: 'Failed to create booking' });;
  }
});

// Corporate: Get user's bookings
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;

    let query = `
            SELECT b.*, 
                   hd.HotelName as hotelName, hd.City as hotelCity,
                   rt.Name as roomTypeName
            FROM bookings b
            JOIN HotelDetails hd ON b.HotelDetails_Id = hd.Id
            LEFT JOIN room_types rt ON b.RoomTypes_Id = rt.Id
            WHERE b.UserId = ?
        `;
    const values: any[] = [req.user?.id];

    if (status) {
      query += ' AND b.BookingStatus = ?';
      values.push(status);
    }

    query += ' ORDER BY b.CreatedAt DESC LIMIT 50';

    const bookings = await executeQuery(query, values);

    res.json(bookings);
  } catch (error) {
    console.error('[BOOKINGS] Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Hotel: Get bookings for their hotel
router.get('/hotel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.identityType !== 'Hotel') {
      return res.status(403).json({ error: 'Access denied. Hotel users only.' });
    }

    const hotelId = await getHotelDetailsId(req.user!.id);
    if (!hotelId) {
      return res.status(404).json({ error: 'Hotel profile not found' });
    }

    const { status } = req.query;

    let query = `
            SELECT b.*, 
                   cd.CompanyName as corporateName,
                   rt.Name as roomTypeName
            FROM bookings b
            LEFT JOIN CorporateDetails cd ON b.CorporateDetails_Id = cd.Id
            LEFT JOIN room_types rt ON b.RoomTypes_Id = rt.Id
            WHERE b.HotelDetails_Id = ?
        `;
    const values: any[] = [hotelId];

    if (status) {
      query += ' AND b.BookingStatus = ?';
      values.push(status);
    }

    query += ' ORDER BY b.CreatedAt DESC LIMIT 100';

    const bookings = await executeQuery(query, values);

    res.json(bookings);
  } catch (error) {
    console.error('[BOOKINGS] Get hotel bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get booking details
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const bookings = await executeQuery(
      `SELECT b.*, 
                    hd.HotelName as hotelName, hd.City as hotelCity, hd.Address as hotelAddress,
                    rt.Name as roomTypeName
             FROM bookings b
             JOIN HotelDetails hd ON b.HotelDetails_Id = hd.Id
             LEFT JOIN room_types rt ON b.RoomTypes_Id = rt.Id
             WHERE b.Id = ? AND b.UserId = ?`,
      [id, req.user?.id]
    ) as any[];

    if (bookings.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(bookings[0]);
  } catch (error) {
    console.error('[BOOKINGS] Get booking error:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// Hotel: Approve booking
router.put('/:id/approve', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.identityType !== 'Hotel') {
      return res.status(403).json({ error: 'Access denied. Hotel users only.' });
    }

    const hotelId = await getHotelDetailsId(req.user!.id);
    const { id } = req.params;

    // Verify booking belongs to this hotel and is pending
    const booking = await executeQuery(
      'SELECT Id, BookingStatus FROM bookings WHERE Id = ? AND HotelDetails_Id = ?',
      [id, hotelId]
    ) as any[];

    if (booking.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking[0].BookingStatus !== 'pending') {
      return res.status(400).json({ error: 'Only pending bookings can be approved' });
    }

    await executeQuery(
      'UPDATE bookings SET BookingStatus = ?, ApprovedAt = NOW() WHERE Id = ?',
      ['confirmed', id]
    );

    res.json({ message: 'Booking approved successfully' });
  } catch (error) {
    console.error('Approve booking error');
    res.status(500).json({ error: 'Failed to approve booking' });
  }
});

// Hotel: Reject booking
router.put('/:id/reject', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.identityType !== 'Hotel') {
      return res.status(403).json({ error: 'Access denied. Hotel users only.' });
    }

    const hotelId = await getHotelDetailsId(req.user!.id);
    const { id } = req.params;
    const { reason } = req.body;

    // Verify booking belongs to this hotel and is pending
    const booking = await executeQuery(
      'SELECT Id, BookingStatus FROM bookings WHERE Id = ? AND HotelDetails_Id = ?',
      [id, hotelId]
    ) as any[];

    if (booking.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking[0].BookingStatus !== 'pending') {
      return res.status(400).json({ error: 'Only pending bookings can be rejected' });
    }

    await executeQuery(
      'UPDATE bookings SET BookingStatus = ?, RejectionReason = ? WHERE Id = ?',
      ['rejected', reason || null, id]
    );

    res.json({ message: 'Booking rejected' });
  } catch (error) {
    console.error('Reject booking error');
    res.status(500).json({ error: 'Failed to reject booking' });
  }
});

// Corporate: Cancel booking
router.put('/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const booking = await executeQuery(
      'SELECT Id, BookingStatus FROM bookings WHERE Id = ? AND UserId = ?',
      [id, req.user?.id]
    ) as any[];

    if (booking.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!['pending', 'confirmed'].includes(booking[0].BookingStatus)) {
      return res.status(400).json({ error: 'This booking cannot be cancelled' });
    }

    await executeQuery(
      'UPDATE bookings SET BookingStatus = ? WHERE Id = ?',
      ['cancelled', id]
    );

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Cancel booking error');
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

export default router;
