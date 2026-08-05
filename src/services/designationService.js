const { createCrudService } = require('./crudFactory');
const { Designation } = require('../models');

module.exports = createCrudService({
  model: Designation,
  entityType: 'Designation',
  searchable: ['title'],
  defaultSort: 'level',
  allowed: ['title', 'level', 'description', 'isActive'],
});
