import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import * as riskService from '../services/risk.service.js';
import * as policyService from '../services/policy.service.js';
import type { CoverageLevel } from '@gigshield/shared';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /plans - get 3 plan quotes for current worker
router.get('/plans', async (req: AuthRequest, res: Response) => {
  try {
    const plans = await riskService.getPlans(req.workerId!);
    res.json({ plans });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST / - create policy
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { coverage_level, payment_upi } = req.body as {
      coverage_level: CoverageLevel;
      payment_upi: string;
    };

    if (!coverage_level || !payment_upi) {
      res.status(400).json({ error: 'coverage_level and payment_upi are required' });
      return;
    }

    if (!['basic', 'standard', 'premium'].includes(coverage_level)) {
      res.status(400).json({ error: 'Invalid coverage_level. Must be basic, standard, or premium' });
      return;
    }

    const policy = await policyService.create(req.workerId!, coverage_level, payment_upi);
    res.status(201).json({ policy });
  } catch (err: any) {
    const status = err.message.includes('already has an active') ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

// GET /current - get active policy
router.get('/current', async (req: AuthRequest, res: Response) => {
  try {
    const policy = await policyService.getActive(req.workerId!);
    res.json({ policy: policy || null });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /history - get policy history
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const policies = await policyService.getHistory(req.workerId!);
    res.json({ policies });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /:id/auto-renew - toggle auto-renewal
router.put('/:id/auto-renew', async (req: AuthRequest, res: Response) => {
  try {
    const policy = await policyService.toggleAutoRenew(req.params.id, req.workerId!);
    res.json({ policy });
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

export default router;
