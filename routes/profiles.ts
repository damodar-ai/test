import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';
import { generateToken } from '../utils/helpers.ts';

const router = Router();

// Create or Update Hotel Profile
router.post('/hotel', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const {
            hotelName, city, state, country, pincode, address, contactNumber, contactEmail,
            supervisorName, supervisorEmail, supervisorContact, starCategory
        } = req.body;
        const userId = req.user?.id;

        console.log('[PROFILES] Creating/updating hotel profile for user:', userId);
        console.log('[PROFILES] Data:', { hotelName, city, state, country, contactNumber });

        if (!hotelName || !city || !contactNumber) {
            return res.status(400).json({ error: 'Hotel name, city, and contact number are required' });
        }

        // Check if profile already exists
        const existingProfile = await executeQuery(
            'SELECT Id FROM HotelDetails WHERE userId = ?',
            [userId]
        ) as any[];

        if (existingProfile.length > 0) {
            // Update existing profile
            console.log('[PROFILES] Updating existing hotel profile');
            await executeQuery(
                `UPDATE HotelDetails SET
                    HotelName = ?, City = ?, State = ?, Country = ?, Pincode = ?, Address = ?, ContactNumber = ?, ContactEmail = ?,
                    SupervisorName = ?, SupervisorEmail = ?, SupervisorContact = ?, StarCategory = ?
                WHERE userId = ?`,
                [
                    hotelName, city, state || '', country || '', pincode || '', address || '', contactNumber,
                    contactEmail || '', supervisorName || '', supervisorEmail || '', supervisorContact || '',
                    starCategory || null, userId
                ]
            );
        } else {
            // Insert new profile
            console.log('[PROFILES] Creating new hotel profile');
            await executeQuery(
                `INSERT INTO HotelDetails 
                (userId, HotelName, City, State, Country, Pincode, Address, ContactNumber, ContactEmail, SupervisorName, SupervisorEmail, SupervisorContact, StarCategory) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, hotelName, city, state || '', country || '', pincode || '', address || '', contactNumber,
                    contactEmail || '', supervisorName || '', supervisorEmail || '', supervisorContact || '',
                    starCategory || null
                ]
            );
        }

        // Mark Profile as Completed
        await executeQuery(
            'UPDATE users SET isProfileCompleted = TRUE WHERE id = ?',
            [userId]
        );

        // Generate new token with Hotel identityType
        const newToken = generateToken({
            id: userId!,
            email: req.user?.email!,
            role: req.user?.role!,
            identityType: 'Hotel'
        });

        console.log('[PROFILES] Hotel profile saved successfully');
        res.status(201).json({
            message: 'Hotel profile saved successfully',
            token: newToken
        });
    } catch (error) {
        console.error('[PROFILES] Create/update hotel profile error:', error);
        res.status(500).json({ error: 'Failed to save hotel profile' });
    }
});

// Create Corporate Profile
router.post('/corporate', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const {
            companyName, industryType, city, state, country, pincode, officeAddress,
            contactNumber, contactEmail,
            supervisorName, supervisorEmail, supervisorContact
        } = req.body;
        const userId = req.user?.id;

        if (!companyName || !industryType) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if profile already exists
        const existingProfile = await executeQuery(
            'SELECT Id FROM CorporateDetails WHERE userId = ?',
            [userId]
        ) as any[];

        if (existingProfile.length > 0) {
            // Update existing profile
            console.log('[PROFILES] Updating existing corporate profile');
            await executeQuery(
                `UPDATE CorporateDetails SET
                    CompanyName = ?, IndustryType = ?, City = ?, State = ?, Country = ?, Pincode = ?, OfficeAddress = ?,
                    ContactNumber = ?, ContactEmail = ?, SupervisorName = ?, SupervisorEmail = ?, SupervisorContact = ?
                WHERE userId = ?`,
                [
                    companyName, industryType, city || '', state || '', country || '', pincode || '', officeAddress || '',
                    contactNumber || '', contactEmail || '',
                    supervisorName || '', supervisorEmail || '', supervisorContact || '',
                    userId
                ]
            );
        } else {
            // Insert new profile
            console.log('[PROFILES] Creating new corporate profile');
            await executeQuery(
                `INSERT INTO CorporateDetails 
                (userId, CompanyName, IndustryType, City, State, Country, Pincode, OfficeAddress, ContactNumber, ContactEmail, SupervisorName, SupervisorEmail, SupervisorContact) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, companyName, industryType, city || '', state || '', country || '', pincode || '', officeAddress || '',
                    contactNumber || '', contactEmail || '',
                    supervisorName || '', supervisorEmail || '', supervisorContact || ''
                ]
            );
        }

        // 2. Mark Profile as Completed
        await executeQuery(
            'UPDATE users SET isProfileCompleted = TRUE WHERE id = ?',
            [userId]
        );

        // Generate new token with Corporate identityType
        const newToken = generateToken({
            id: userId!,
            email: req.user?.email!,
            role: req.user?.role!,
            identityType: 'Corporate'
        });

        res.status(201).json({
            message: 'Corporate profile created successfully',
            token: newToken
        });
    } catch (error) {
        console.error('Create corporate profile error:', error);
        res.status(500).json({ error: 'Failed to create corporate profile' });
    }
});


// Get Hotel Profile
router.get('/hotel/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.id;
        const profiles = (await executeQuery(
            'SELECT * FROM HotelDetails WHERE userId = ?',
            [userId]
        )) as any[];

        if (!profiles.length) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(profiles[0]);
    } catch (error) {
        console.error('Get hotel profile error:', error);
        res.status(500).json({ error: 'Failed to fetch hotel profile' });
    }
});

// Get Corporate Profile
router.get('/corporate/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.id;
        const profiles = (await executeQuery(
            'SELECT * FROM CorporateDetails WHERE userId = ?',
            [userId]
        )) as any[];

        if (!profiles.length) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(profiles[0]);
    } catch (error) {
        console.error('Get corporate profile error:', error);
        res.status(500).json({ error: 'Failed to fetch corporate profile' });
    }
});

export default router;
