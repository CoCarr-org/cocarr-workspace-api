const { createCrudService } = require('./crudFactory');
const { Department } = require('../models');

module.exports = createCrudService({
  model: Department,
  entityType: 'Department',
  searchable: ['name', 'code'],
  allowed: ['name', 'code', 'description', 'parentDepartmentId', 'headEmployeeId', 'isActive'],
});
