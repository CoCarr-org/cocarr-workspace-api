const svc = require('../services/onboardingService');

module.exports = {
  get: async (req, res, next) => { try { res.json(await svc.get(req.params.id)); } catch (e) { next(e); } },
  advance: async (req, res, next) => { try { res.json(await svc.advance(req.params.id, req.body.stage)); } catch (e) { next(e); } },
  approve: async (req, res, next) => {
    try { res.json(await svc.approve(req.params.id, { dateOfJoining: req.body.dateOfJoining })); } catch (e) { next(e); }
  },
};
