import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';

const router = Router();

// Search hotels with advanced filters
router.get('/', async (req: AuthRequest, res) => {
    try {
        const {
            city,
            state,
            country,
            pincode,
            minPrice,
            maxPrice,
            minStars,
            maxStars,
            guests,
            sortBy = 'rating',
            page = 1,
            limit = 12
        } = req.query;

        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.max(1, Math.min(50, Number(limit) || 12));
        const offset = (pageNum - 1) * limitNum;

        // Base query
        let query = `
            SELECT hd.Id, hd.HotelName, hd.City, hd.State, hd.Country, hd.Pincode, hd.Address, hd.StarCategory,
                   hd.ContactEmail, hd.ContactNumber, hd.CreatedAt,
                   (SELECT COUNT(*) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as roomTypeCount,
                   (SELECT MIN(rt.BasePrice) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as minPrice,
                   (SELECT MAX(rt.BasePrice) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as maxPrice,
                   (SELECT MIN(rt.CorporatePrice) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE AND rt.CorporatePrice IS NOT NULL) as minCorpPrice,
                   (SELECT MAX(rt.Capacity) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as maxCapacity,
                   (SELECT GROUP_CONCAT(DISTINCT rt.Name SEPARATOR ', ') FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as roomTypeNames
            FROM HotelDetails hd
            JOIN users u ON hd.userId = u.id
            WHERE u.isProfileCompleted = TRUE
        `;
        const params: any[] = [];

        // Location filters
        if (city && city !== '') {
            query += ' AND hd.City LIKE ?';
            params.push(`%${city}%`);
        }
        if (state && state !== '') {
            query += ' AND hd.State LIKE ?';
            params.push(`%${state}%`);
        }
        if (country && country !== '') {
            query += ' AND hd.Country LIKE ?';
            params.push(`%${country}%`);
        }
        if (pincode && pincode !== '') {
            query += ' AND hd.Pincode LIKE ?';
            params.push(`%${pincode}%`);
        }

        // Star rating filter
        if (minStars) {
            query += ' AND hd.StarCategory >= ?';
            params.push(Number(minStars));
        }
        if (maxStars) {
            query += ' AND hd.StarCategory <= ?';
            params.push(Number(maxStars));
        }

        // HAVING clause blocks - use validated numbers to prevent SQL injection
        const havingParts: string[] = ['roomTypeCount > 0'];

        // Price filter (on room types) - validate as finite numbers
        if (minPrice) {
            const minPriceNum = Number(minPrice);
            if (Number.isFinite(minPriceNum) && minPriceNum >= 0) {
                havingParts.push(`minPrice >= ${minPriceNum}`);
            }
        }
        if (maxPrice) {
            const maxPriceNum = Number(maxPrice);
            if (Number.isFinite(maxPriceNum) && maxPriceNum >= 0) {
                havingParts.push(`minPrice <= ${maxPriceNum}`);
            }
        }

        // Capacity filter - validate as finite integer
        if (guests) {
            const guestsNum = Math.floor(Number(guests));
            if (Number.isFinite(guestsNum) && guestsNum > 0) {
                havingParts.push(`maxCapacity >= ${guestsNum}`);
            }
        }

        query += ` HAVING ${havingParts.join(' AND ')}`;

        // Sorting - use whitelist pattern to prevent injection
        const sortOptions: Record<string, string> = {
            'rating': 'hd.StarCategory DESC, hd.HotelName',
            'price-low': 'minPrice ASC, hd.StarCategory DESC',
            'price-high': 'minPrice DESC, hd.StarCategory DESC',
            'name': 'hd.HotelName ASC'
        };
        const orderBy = sortOptions[sortBy as string] || sortOptions['rating'];
        // Ensure limitNum and offset are validated integers
        const safeLimitNum = Math.max(1, Math.min(50, Math.floor(limitNum)));
        const safeOffset = Math.max(0, Math.floor(offset));
        query += ` ORDER BY ${orderBy} LIMIT ${safeLimitNum} OFFSET ${safeOffset}`;

        const hotels = await executeQuery(query, params);

        // Count query for pagination
        let countQuery = `
            SELECT COUNT(*) as total FROM (
                SELECT hd.Id,
                       (SELECT COUNT(*) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as roomTypeCount,
                       (SELECT MIN(rt.BasePrice) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as minPrice,
                       (SELECT MAX(rt.Capacity) FROM room_types rt WHERE rt.HotelDetails_Id = hd.Id AND rt.IsActive = TRUE) as maxCapacity
                FROM HotelDetails hd
                JOIN users u ON hd.userId = u.id
                WHERE u.isProfileCompleted = TRUE
        `;
        const countParams: any[] = [];

        if (city && city !== '') {
            countQuery += ' AND hd.City LIKE ?';
            countParams.push(`%${city}%`);
        }
        if (state && state !== '') {
            countQuery += ' AND hd.State LIKE ?';
            countParams.push(`%${state}%`);
        }
        if (country && country !== '') {
            countQuery += ' AND hd.Country LIKE ?';
            countParams.push(`%${country}%`);
        }
        if (pincode && pincode !== '') {
            countQuery += ' AND hd.Pincode LIKE ?';
            countParams.push(`%${pincode}%`);
        }
        if (minStars) {
            countQuery += ' AND hd.StarCategory >= ?';
            countParams.push(Number(minStars));
        }
        if (maxStars) {
            countQuery += ' AND hd.StarCategory <= ?';
            countParams.push(Number(maxStars));
        }

        countQuery += ` HAVING ${havingParts.join(' AND ')}) as filtered`;

        const countResult = await executeQuery(countQuery, countParams) as any[];

        // Get available cities
        const cities = await executeQuery(
            `SELECT DISTINCT City FROM HotelDetails WHERE City IS NOT NULL AND City != '' ORDER BY City`
        );

        res.json({
            data: hotels,
            cities: cities,
            pagination: {
                total: countResult[0]?.total || 0,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil((countResult[0]?.total || 0) / limitNum)
            },
            filters: {
                city, state, country, pincode, minPrice, maxPrice, minStars, maxStars, guests, sortBy
            }
        });
    } catch (error) {
        console.error('[BROWSE_HOTELS] Error:', error);
        res.status(500).json({ error: 'Failed to fetch hotels' });
    }
});

// Get hotel details with room types and availability info
router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { checkIn, checkOut } = req.query;

        // Get hotel details
        const hotels = await executeQuery(
            `SELECT hd.*, u.email as ownerEmail,
                    (SELECT COUNT(*) FROM bookings b WHERE b.HotelDetails_Id = hd.Id AND b.BookingStatus = 'completed') as totalBookings,
                    (SELECT AVG(hd2.StarCategory) FROM HotelDetails hd2 WHERE hd2.City = hd.City) as avgCityRating
             FROM HotelDetails hd
             JOIN users u ON hd.userId = u.id
             WHERE hd.Id = ?`,
            [id]
        ) as any[];

        if (hotels.length === 0) {
            return res.status(404).json({ error: 'Hotel not found' });
        }

        // Get room types for this hotel
        let roomTypesQuery = `
            SELECT rt.*
            FROM room_types rt
            WHERE rt.HotelDetails_Id = ? AND rt.IsActive = TRUE
            ORDER BY rt.BasePrice
        `;
        const roomTypes = await executeQuery(roomTypesQuery, [id]) as any[];

        // If dates provided, calculate available rooms in a single batch query (fixes N+1)
        if (checkIn && checkOut && roomTypes.length > 0) {
            // Note: Since this schema doesn't have a rooms table for individual room instances,
            // we just set availableRooms based on capacity. In a full implementation,
            // this would query actual room inventory.
            roomTypes.forEach(rt => {
                rt.availableRooms = rt.Capacity || 10; // Default availability
            });
        } else {
            roomTypes.forEach(rt => rt.availableRooms = rt.Capacity || 10);
        }

        res.json({
            hotel: hotels[0],
            roomTypes
        });
    } catch (error) {
        console.error('[BROWSE_HOTELS] Detail error:', error);
        res.status(500).json({ error: 'Failed to fetch hotel details' });
    }
});

// Get available room types
router.get('/:id/available-rooms', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { checkIn, checkOut, roomTypeId } = req.query;

        if (!checkIn || !checkOut) {
            return res.status(400).json({ error: 'Check-in and check-out dates are required' });
        }

        let query = `
            SELECT rt.Id as id, rt.Name as name, rt.Description as description,
                   rt.Capacity as capacity, rt.BasePrice as basePrice, 
                   rt.CorporatePrice as corporatePrice, rt.Amenities as amenities,
                   -- We return availableRooms as just a placeholder or capacity since we do request based
                   10 as availableRooms 
            FROM room_types rt
            WHERE rt.HotelDetails_Id = ? 
            AND rt.IsActive = TRUE
        `;
        const params: any[] = [id];

        if (roomTypeId) {
            query += ' AND rt.Id = ?';
            params.push(roomTypeId);
        }

        query += ' ORDER BY rt.BasePrice';

        const roomTypes = await executeQuery(query, params);

        res.json(roomTypes);
    } catch (error) {
        console.error('[BROWSE_HOTELS] Available rooms error:', error);
        res.status(500).json({ error: 'Failed to fetch available rooms' });
    }
});

// Get search suggestions (cities)
router.get('/search/cities', async (_req: AuthRequest, res) => {
    try {
        const cities = await executeQuery(
            `SELECT DISTINCT City, COUNT(*) as hotelCount
             FROM HotelDetails 
             WHERE City IS NOT NULL AND City != ''
             GROUP BY City
             ORDER BY hotelCount DESC, City`
        );
        res.json(cities);
    } catch (error) {
        console.error('[BROWSE_HOTELS] Cities error:', error);
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
});

// Get price range for filters
router.get('/search/price-range', async (_req: AuthRequest, res) => {
    try {
        const result = await executeQuery(`
            SELECT MIN(rt.BasePrice) as minPrice, MAX(rt.BasePrice) as maxPrice
            FROM room_types rt
            WHERE rt.IsActive = TRUE
        `) as any[];
        res.json(result[0] || { minPrice: 0, maxPrice: 1000 });
    } catch (error) {
        console.error('[BROWSE_HOTELS] Price range error:', error);
        res.status(500).json({ error: 'Failed to fetch price range' });
    }
});

export default router;
