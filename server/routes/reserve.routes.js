import { Router } from 'express';
import * as controller from '../controllers/reserve.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const reserveRoutes = Router();

reserveRoutes.post('/reserve', asyncHandler(controller.save));
reserveRoutes.post('/reserve/options', asyncHandler(controller.options));
