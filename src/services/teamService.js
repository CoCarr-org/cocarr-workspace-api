const { createCrudService } = require('./crudFactory');
const { Team } = require('../models');

module.exports = createCrudService({
  model: Team,
  entityType: 'Team',
  searchable: ['name'],
  allowed: ['name', 'departmentId', 'leadEmployeeId', 'description', 'isActive'],
});
