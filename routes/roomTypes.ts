import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';

const router = Router();

// Middleware to check if user is a Hotel
const hotelOnlyMiddleware = (req: AuthRequest, res: any, next: any) => {
    if (req.user?.identityType !== 'Hotel') {
        return res.status(403).json({ error: 'Access denied. Hotel users only.' });
    }
    next();
};

// Helper: Get HotelDetails_Id for current user
const getHotelDetailsId = async (userId: number): Promise<number | null> => {
    const result = await executeQuery(
        'SELECT Id FROM HotelDetails WHERE userId = ?',
        [userId]
    ) as any[];
    return result.length > 0 ? result[0].Id : null;
};

// Get all room types for current hotel
router.get('/', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const hotelId = await getHotelDetailsId(req.user!.id);

        if (!hotelId) {
            return res.status(404).json({ error: 'Hotel profile not found. Please complete your profile first.' });
        }

        const roomTypes = await executeQuery(
            `SELECT * FROM room_types WHERE HotelDetails_Id = ? ORDER BY Name`,
            [hotelId]
        );

        res.json(roomTypes);
    } catch (error) {
        console.error('[ROOM_TYPES] Get room types error:', error);
        res.status(500).json({ error: 'Failed to fetch room types' });
    }
});

// Get single room type
router.get('/:id', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const hotelId = await getHotelDetailsId(req.user!.id);
        const { id } = req.params;

        if (!hotelId) {
            return res.status(404).json({ error: 'Hotel profile not found' });
        }

        const roomTypes = await executeQuery(
            `SELECT * FROM room_types WHERE Id = ? AND HotelDetails_Id = ?`,
            [id, hotelId]
        ) as any[];

        if (roomTypes.length === 0) {
            return res.status(404).json({ error: 'Room type not found' });
        }

        res.json(roomTypes[0]);
    } catch (error) {
        console.error('[ROOM_TYPES] Get room type error:', error);
        res.status(500).json({ error: 'Failed to fetch room type' });
    }
});

// Create new room type
router.post('/', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const hotelId = await getHotelDetailsId(req.user!.id);
        const { name, description, capacity, basePrice, corporatePrice, amenities } = req.body;

        if (!hotelId) {
            return res.status(404).json({ error: 'Hotel profile not found. Please complete your profile first.' });
        }

        if (!name || !capacity || !basePrice) {
            return res.status(400).json({ error: 'Name, capacity, and base price are required' });
        }

        const result = await executeQuery(
            `INSERT INTO room_types (HotelDetails_Id, Name, Description, Capacity, BasePrice, CorporatePrice, Amenities, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
                hotelId,
                name,
                description || '',
                parseInt(capacity),
                parseFloat(basePrice),
                corporatePrice ? parseFloat(corporatePrice) : null,
                amenities ? JSON.stringify(amenities) : null
            ]
        ) as any;

        console.log('[ROOM_TYPES] Created room type:', name, 'for hotel:', hotelId);

        res.status(201).json({
            message: 'Room type created successfully',
            id: result.insertId
        });
    } catch (error) {
        console.error('[ROOM_TYPES] Create room type error:', error);
        res.status(500).json({ error: 'Failed to create room type' });
    }
});

// Update room type
router.put('/:id', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const hotelId = await getHotelDetailsId(req.user!.id);
        const { id } = req.params;
        const { name, description, capacity, basePrice, corporatePrice, amenities, isActive } = req.body;

        if (!hotelId) {
            return res.status(404).json({ error: 'Hotel profile not found' });
        }

        // Verify ownership
        const existing = await executeQuery(
            'SELECT Id FROM room_types WHERE Id = ? AND HotelDetails_Id = ?',
            [id, hotelId]
        ) as any[];

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Room type not found or unauthorized' });
        }

        await executeQuery(
            `UPDATE room_types SET
                Name = COALESCE(?, Name),
                Description = COALESCE(?, Description),
                Capacity = COALESCE(?, Capacity),
                BasePrice = COALESCE(?, BasePrice),
                CorporatePrice = COALESCE(?, CorporatePrice),
                Amenities = COALESCE(?, Amenities),
                IsActive = COALESCE(?, IsActive)
             WHERE Id = ?`,
            [
                name || null,
                description || null,
                capacity ? parseInt(capacity) : null,
                basePrice ? parseFloat(basePrice) : null,
                corporatePrice ? parseFloat(corporatePrice) : null,
                amenities ? JSON.stringify(amenities) : null,
                isActive !== undefined ? isActive : null,
                id
            ]
        );

        console.log('[ROOM_TYPES] Updated room type:', id);

        res.json({ message: 'Room type updated successfully' });
    } catch (error) {
        console.error('[ROOM_TYPES] Update room type error:', error);
        res.status(500).json({ error: 'Failed to update room type' });
    }
});

// Delete room type
router.delete('/:id', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const hotelId = await getHotelDetailsId(req.user!.id);
        const { id } = req.params;

        if (!hotelId) {
            return res.status(404).json({ error: 'Hotel profile not found' });
        }

        const result = await executeQuery(
            'DELETE FROM room_types WHERE Id = ? AND HotelDetails_Id = ?',
            [id, hotelId]
        ) as any;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room type not found or unauthorized' });
        }

        console.log('[ROOM_TYPES] Deleted room type:', id);

        res.json({ message: 'Room type deleted successfully' });
    } catch (error) {
        console.error('[ROOM_TYPES] Delete room type error:', error);
        res.status(500).json({ error: 'Failed to delete room type' });
    }
});

export default router;
