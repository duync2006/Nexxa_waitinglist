import { Router } from 'express';
import * as controller from '../controllers/catalog.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const catalogRoutes = Router();

// POST như mọi API khác trong dự án, kể cả API chỉ đọc.
catalogRoutes.post('/catalog', asyncHandler(controller.get));
