const svc = require('../services/jobPostingService');

module.exports = {
  list: async (req, res, next) => { try { res.json(await svc.list(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { res.json(await svc.getById(req.params.id)); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { res.status(201).json(await svc.create(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await svc.update(req.params.id, req.body)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await svc.remove(req.params.id)); } catch (e) { next(e); } },
  setStatus: async (req, res, next) => { try { res.json(await svc.setStatus(req.params.id, req.body.status)); } catch (e) { next(e); } },
  submitForApproval: async (req, res, next) => { try { res.json(await svc.submitForApproval(req.params.id)); } catch (e) { next(e); } },
  approve: async (req, res, next) => { try { res.json(await svc.approve(req.params.id)); } catch (e) { next(e); } },
  reject: async (req, res, next) => { try { res.json(await svc.rejectApproval(req.params.id, req.body.note)); } catch (e) { next(e); } },
};
