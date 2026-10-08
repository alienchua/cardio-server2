const test = require('node:test');
const assert = require('node:assert/strict');
const { submitInspection } = require('../modules/auth/v1/models/qgModel');

function replay(saved) {
  const queries = [];
  let released = false;
  const client = {
    release() { released = true; },
    async query(sql) {
      queries.push(sql);
      if (sql.includes('FOR UPDATE OF j')) return { rows: [{ id: 1, eligible: true, status: saved.result }] };
      if (sql.includes('idempotency_key = $2')) return { rows: [saved] };
      if (['BEGIN', 'ROLLBACK'].includes(sql)) return { rows: [] };
      throw new Error('A retry must not write another inspection');
    }
  };
  return { req: { app: { get: () => ({ connect: async () => client }) } }, queries, released: () => released };
}

for (const result of ['APPROVED', 'DEFECT']) {
  test(`lost-response retry of ${result} returns the original inspection without writing`, async () => {
    const saved = { id: '10', qg_job_id: '1', result };
    const db = replay(saved);
    assert.deepEqual(await submitInspection(db.req, 1, { result, idempotency_key: 'retry' }, 7), saved);
    assert.equal(db.queries.at(-1), 'ROLLBACK');
    assert.equal(db.released(), true);
  });
  test(`retry cannot replace saved ${result} with the opposite result`, async () => {
    const db = replay({ id: '10', qg_job_id: '1', result });
    await assert.rejects(submitInspection(db.req, 1, {
      result: result === 'APPROVED' ? 'DEFECT' : 'APPROVED', idempotency_key: 'retry'
    }, 7), { status: 409 });
    assert.equal(db.queries.at(-1), 'ROLLBACK');
    assert.equal(db.released(), true);
  });
}

test('a key from another task is rejected even when its result matches', async () => {
  const db = replay({ id: '10', qg_job_id: '2', result: 'APPROVED' });
  await assert.rejects(submitInspection(db.req, 1, { result: 'APPROVED', idempotency_key: 'retry' }, 7), { status: 409 });
  assert.equal(db.queries.at(-1), 'ROLLBACK');
});
