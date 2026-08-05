// Generic controller that adapts a crud service to Express handlers, so the
// plain-CRUD modules (departments, designations, teams, access requests) don't
// each need a bespoke controller.
function makeCrudController(service) {
  return {
    list: async (req, res, next) => {
      try {
        const { search, sort, offset, limit } = req.query;
        const result = await service.list({ search, sort, offset, limit });
        res.json(result);
      } catch (e) { next(e); }
    },
    get: async (req, res, next) => {
      try { res.json(await service.getById(req.params.id)); } catch (e) { next(e); }
    },
    create: async (req, res, next) => {
      try { res.status(201).json(await service.create(req.body)); } catch (e) { next(e); }
    },
    update: async (req, res, next) => {
      try { res.json(await service.update(req.params.id, req.body)); } catch (e) { next(e); }
    },
    remove: async (req, res, next) => {
      try { res.json(await service.remove(req.params.id)); } catch (e) { next(e); }
    },
  };
}

module.exports = { makeCrudController };
