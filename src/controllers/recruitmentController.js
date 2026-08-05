const svc = require('../services/recruitmentService');

module.exports = {
  list: async (req, res, next) => { try { res.json(await svc.list(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { res.json(await svc.getById(req.params.id)); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { res.status(201).json(await svc.create(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await svc.update(req.params.id, req.body)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await svc.remove(req.params.id)); } catch (e) { next(e); } },
  advanceStage: async (req, res, next) => { try { res.json(await svc.advanceStage(req.params.id, req.body.stage)); } catch (e) { next(e); } },
  hire: async (req, res, next) => { try { res.status(201).json(await svc.hire(req.params.id)); } catch (e) { next(e); } },
};
