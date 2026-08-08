const svc = require('../services/offerService');

const actorOf = (req) => ({ byUserId: req.actor?.identityId || req.actor?.uid || null });

module.exports = {
  // Candidate-scoped (mounted under /candidates/:id/offers).
  create: async (req, res, next) => {
    try { res.status(201).json(await svc.create(req.params.id, req.body, actorOf(req))); } catch (e) { next(e); }
  },

  // Offer-level (mounted under /offers/:offerId).
  get: async (req, res, next) => { try { res.json(await svc.getById(req.params.offerId)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await svc.update(req.params.offerId, req.body)); } catch (e) { next(e); } },
  send: async (req, res, next) => { try { res.json(await svc.send(req.params.offerId, actorOf(req))); } catch (e) { next(e); } },
  respond: async (req, res, next) => {
    try {
      res.json(await svc.respond(req.params.offerId, {
        decision: req.body.decision,
        note: req.body.note || null,
        channel: 'hr_recorded',
        by: actorOf(req).byUserId,
      }));
    } catch (e) { next(e); }
  },
  withdraw: async (req, res, next) => { try { res.json(await svc.withdraw(req.params.offerId, actorOf(req))); } catch (e) { next(e); } },
  uploadLetter: async (req, res, next) => {
    try { res.json(await svc.attachLetter(req.params.offerId, req.body.letter)); } catch (e) { next(e); }
  },

  // Streams the private offer-letter to an authorised recruiter, inline, never
  // cached — same discipline as the résumé route.
  letter: async (req, res, next) => {
    try {
      const { object } = await svc.letterStream(req.params.offerId);
      res.setHeader('Content-Type', object.ContentType || 'application/pdf');
      if (object.ContentLength) res.setHeader('Content-Length', object.ContentLength);
      res.setHeader('Content-Disposition', 'inline; filename="offer-letter"');
      res.setHeader('Cache-Control', 'private, no-store');
      object.Body.pipe(res);
    } catch (e) { next(e); }
  },
};
