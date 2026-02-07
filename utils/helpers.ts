import jwt from 'jsonwebtoken';
import { executeQuery } from '../database/connection.ts';

export const generateToken = (user: { id: number; email: string; role: string; identityType?: 'Hotel' | 'Corporate' | null }) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set');
  }
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, identityType: user.identityType || null },
    jwtSecret,
    { expiresIn: '1d' }
  );
};

export const generateBookingNumber = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `BK${timestamp}${random}`;
};

export const calculateTotalPrice = (pricePerNight: number, nights: number): number => {
  return pricePerNight * nights;
};

/**
 * Get HotelDetails Id for a given User Id
 */
export const getHotelDetailsId = async (userId: number): Promise<number | null> => {
  try {
    const rows = await executeQuery(
      'SELECT Id FROM HotelDetails WHERE userId = ?',
      [userId]
    ) as any[];
    return rows.length > 0 ? rows[0].Id : null;
  } catch {
    return null;
  }
};

/**
 * Get CorporateDetails Id for a given User Id
 */
export const getCorporateDetailsId = async (userId: number): Promise<number | null> => {
  try {
    const rows = await executeQuery(
      'SELECT Id FROM CorporateDetails WHERE userId = ?',
      [userId]
    ) as any[];
    return rows.length > 0 ? rows[0].Id : null;
  } catch {
    return null;
  }
};

