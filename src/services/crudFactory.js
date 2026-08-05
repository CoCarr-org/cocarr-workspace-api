const { Op } = require('sequelize');
const { CustomError } = require('../middlewares/error');

// Plain CRUD over one table with paginated + searchable list. Ported from
// cocarr-core-api (activity-log dependency dropped — workspace attribution is
// handled per-service where it matters). `allowed` is a write whitelist, so a
// client can't set id/timestamps.
function createCrudService({ model, entityType, searchable = [], defaultSort = '-createdAt', allowed = [] }) {
  const pick = (body) => {
    const out = {};
    allowed.forEach((f) => { if (body[f] !== undefined) out[f] = body[f]; });
    return out;
  };

  async function list({ search, sort, offset = 0, limit = 25, filters = {} } = {}) {
    const where = { ...filters };
    if (search && searchable.length) {
      where[Op.or] = searchable.map((col) => ({ [col]: { [Op.like]: `%${search}%` } }));
    }
    const sortStr = sort || defaultSort;
    const dir = sortStr.startsWith('-') ? 'DESC' : 'ASC';
    const field = sortStr.replace(/^-/, '');
    const data = await model.findAll({
      where,
      order: [[field, dir]],
      offset: parseInt(offset, 10) || 0,
      limit: parseInt(limit, 10) || 25,
    });
    const totalCount = await model.count({ where });
    return { data, totalCount };
  }

  async function getById(id) {
    const row = await model.findByPk(id);
    if (!row) throw new CustomError(`${entityType} not found`, 404, 'NOT_FOUND');
    return row;
  }

  async function create(body) {
    return model.create(pick(body));
  }

  async function update(id, body) {
    const row = await getById(id);
    await row.update(pick(body));
    return row;
  }

  async function remove(id) {
    const row = await getById(id);
    await row.destroy();
    return { success: true };
  }

  return { list, getById, create, update, remove };
}

module.exports = { createCrudService };
