import { Router } from 'express';
import * as controller from '../controllers/waitlist.controller.js';
import { getStats } from '../controllers/stats.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const waitlistRoutes = Router();

// Toàn bộ API dùng POST. Riêng /r/:code vẫn là GET vì đó là link người dùng bấm
// trong trình duyệt, không phải API — xem referral.routes.js.
waitlistRoutes.post('/stats', asyncHandler(getStats));
waitlistRoutes.post('/waitlist/check', asyncHandler(controller.check));
waitlistRoutes.post('/waitlist/request-otp', asyncHandler(controller.requestOtp));
waitlistRoutes.post('/waitlist/verify', asyncHandler(controller.verify));
