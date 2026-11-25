import { Router } from 'express';
import * as controller from '../controllers/reserve.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';
import { optionalSession, requireSession } from '../middlewares/session.middleware.js';

export const reserveRoutes = Router();

reserveRoutes.post('/reserve', requireSession, asyncHandler(controller.save));
reserveRoutes.post('/reserve/options', optionalSession, asyncHandler(controller.options));
