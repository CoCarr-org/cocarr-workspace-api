const svc = require('../services/accessRequestService');

module.exports = {
  create: async (req, res, next) => {
    try {
      const { employeeId, target, reason } = req.body;
      res.status(201).json(await svc.create(employeeId, { target, reason }));
    } catch (e) { next(e); }
  },
  list: async (req, res, next) => { try { res.json(await svc.list(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { res.json(await svc.getById(req.params.id)); } catch (e) { next(e); } },
  // Retry the IAM grant for a request approved while IAM was unreachable.
  apply: async (req, res, next) => {
    try { res.json(await svc.apply(req.params.id, req.actor && req.actor.uid)); } catch (e) { next(e); }
  },
  decide: async (req, res, next) => {
    try {
      res.json(await svc.decide(req.params.id, {
        status: req.body.status, note: req.body.note, actorUid: req.actor && req.actor.uid,
      }));
    } catch (e) { next(e); }
  },
};
