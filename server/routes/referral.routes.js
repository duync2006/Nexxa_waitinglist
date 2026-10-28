import { Router } from 'express';
import { redirectToSignup } from '../controllers/referral.controller.js';

export const referralRoutes = Router();

referralRoutes.get('/r/:code', redirectToSignup);
