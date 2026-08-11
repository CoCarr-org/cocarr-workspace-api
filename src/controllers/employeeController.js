const svc = require('../services/employeeService');

module.exports = {
  list: async (req, res, next) => {
    try { res.json(await svc.list(req.query)); } catch (e) { next(e); }
  },
  get: async (req, res, next) => {
    try { res.json(await svc.getDetail(req.params.id)); } catch (e) { next(e); }
  },
  create: async (req, res, next) => {
    try { res.status(201).json(await svc.create(req.body)); } catch (e) { next(e); }
  },
  update: async (req, res, next) => {
    try { res.json(await svc.update(req.params.id, req.body)); } catch (e) { next(e); }
  },
  setStatus: async (req, res, next) => {
    try { res.json(await svc.setStatus(req.params.id, req.body.status)); } catch (e) { next(e); }
  },
  reports: async (req, res, next) => {
    try { res.json(await svc.directReports(req.params.id)); } catch (e) { next(e); }
  },
  orgTree: async (req, res, next) => {
    try { res.json(await svc.orgTree(req.query.rootId || null)); } catch (e) { next(e); }
  },
  addDocument: async (req, res, next) => {
    try { res.status(201).json(await svc.addDocument(req.params.id, req.body)); } catch (e) { next(e); }
  },
  listDocuments: async (req, res, next) => {
    try { res.json(await svc.listDocuments(req.params.id)); } catch (e) { next(e); }
  },
  setDocumentStatus: async (req, res, next) => {
    try {
      res.json(await svc.setDocumentStatus(req.params.id, req.params.docId, req.body.status, req.body.note));
    } catch (e) { next(e); }
  },
};
