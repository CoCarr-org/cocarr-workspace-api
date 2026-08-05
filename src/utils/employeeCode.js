const db = require('../configs/db');
const Counter = require('../models/counter');

// Employee identity is EMP-000001, NOT the Firebase UID (charter rule). The
// Firebase UID is stored separately on the employee row. Codes are allocated
// from a dedicated counter row under a row lock so two concurrent onboardings
// can never mint the same code.
const PREFIX = 'EMP-';
const WIDTH = 6;

async function nextEmployeeCode() {
  return db.transaction(async (t) => {
    const [row] = await Counter.findOrCreate({
      where: { key: 'employee' },
      defaults: { value: 0 },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const next = row.value + 1;
    await row.update({ value: next }, { transaction: t });
    return `${PREFIX}${String(next).padStart(WIDTH, '0')}`;
  });
}

module.exports = { nextEmployeeCode };
