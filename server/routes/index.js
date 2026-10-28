import { Router } from 'express';
import { waitlistRoutes } from './waitlist.routes.js';
import { reserveRoutes } from './reserve.routes.js';
import { referralRoutes } from './referral.routes.js';

export const routes = Router();

// Hai nhóm route API nằm dưới /api; link mời ngắn nằm ở gốc
routes.use('/api', waitlistRoutes);
routes.use('/api', reserveRoutes);
routes.use(referralRoutes);
