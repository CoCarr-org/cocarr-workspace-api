const svc = require('../services/recruitmentService');

// Who is acting, for the stage-history trail. The identity id is the stable
// principal; uid is the fallback for a caller that reached us without the gateway.
const actorOf = (req) => ({ byUserId: req.actor?.identityId || req.actor?.uid || null });

module.exports = {
  list: async (req, res, next) => { try { res.json(await svc.list(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { res.json(await svc.getDetail(req.params.id)); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { res.status(201).json(await svc.create(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await svc.update(req.params.id, req.body)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await svc.remove(req.params.id)); } catch (e) { next(e); } },

  advanceStage: async (req, res, next) => {
    try {
      res.json(await svc.advanceStage(req.params.id, req.body.stage, {
        ...actorOf(req), note: req.body.note || null,
      }));
    } catch (e) { next(e); }
  },
  hire: async (req, res, next) => {
    try {
      res.status(201).json(await svc.hire(req.params.id, {
        ...actorOf(req), dateOfJoining: req.body?.dateOfJoining || null,
      }));
    } catch (e) { next(e); }
  },

  history: async (req, res, next) => { try { res.json(await svc.getHistory(req.params.id)); } catch (e) { next(e); } },

  // Interview rounds (candidate-scoped).
  listInterviews: async (req, res, next) => { try { res.json(await svc.listInterviews(req.params.id)); } catch (e) { next(e); } },
  addInterview: async (req, res, next) => {
    try { res.status(201).json(await svc.addInterview(req.params.id, req.body, actorOf(req))); } catch (e) { next(e); }
  },
  updateInterview: async (req, res, next) => {
    try { res.json(await svc.updateInterview(req.params.id, req.params.roundId, req.body)); } catch (e) { next(e); }
  },
  removeInterview: async (req, res, next) => {
    try { res.json(await svc.removeInterview(req.params.id, req.params.roundId)); } catch (e) { next(e); }
  },

  // Offers list + create (candidate-scoped). Offer-level actions live on offerRouter.
  listOffers: async (req, res, next) => { try { res.json(await svc.listOffers(req.params.id)); } catch (e) { next(e); } },
};
