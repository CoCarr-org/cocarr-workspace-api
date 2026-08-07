const svc = require('../services/careersService');

module.exports = {
  listJobs: async (req, res, next) => {
    try { res.json(await svc.listPublic()); } catch (e) { next(e); }
  },
  getJob: async (req, res, next) => {
    try { res.json(await svc.getPublic(req.params.idOrSlug)); } catch (e) { next(e); }
  },
  apply: async (req, res, next) => {
    try { res.status(201).json(await svc.apply(req.body)); } catch (e) { next(e); }
  },

  // Authenticated — streams a private CV to a recruiter.
  //
  // `inline` rather than `attachment`: a recruiter is reading the CV to decide
  // on it, and forcing a download of every applicant's file just to look means
  // a folder of PDFs to clean up afterwards. The filename is still set so a
  // deliberate save lands somewhere sensible.
  resume: async (req, res, next) => {
    try {
      const { object, candidate } = await svc.resumeStream(req.params.id);
      const name = [candidate.firstName, candidate.lastName].filter(Boolean).join('-') || 'resume';
      const ext = (candidate.resumeKey || '').split('.').pop();
      res.setHeader('Content-Type', object.ContentType || 'application/pdf');
      if (object.ContentLength) res.setHeader('Content-Length', object.ContentLength);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${name}${ext && ext.length <= 4 ? `.${ext}` : ''}"`,
      );
      // A CV is personal data. Never let a proxy or the browser keep a copy.
      res.setHeader('Cache-Control', 'private, no-store');
      object.Body.on('error', () => res.destroy());
      object.Body.pipe(res);
    } catch (e) { next(e); }
  },
};
