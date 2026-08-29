import { Router } from 'express';

export function createOrderRouter(service) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ orders: service.listOrders() });
  });

  router.get('/revenue', (req, res) => {
    res.json({ revenue: service.totalRevenue() });
  });

  router.get('/:id', (req, res) => {
    const order = service.getOrder(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ order });
  });

  router.patch('/:id/status', (req, res) => {
    const result = service.updateStatus(req.params.id, req.body?.status);

    if (result.error === 'not_found') {
      res.status(404).json(result);
      return;
    }
    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}
