const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { validateImage, verifyPhoto } = require('../utils/qgPhoto');
const { submitInspection } = require('../modules/auth/v1/models/qgModel');
process.env.JWT_SECRET = 'qg-photo-unit-test-secret';
const photo = { storage_key: 'qg/defects/1/test.png', url: 'https://example.com/test.png', file_name: 'test.png', content_type: 'image/png', file_size: 68 };
const receipt = () => ({ upload_token: jwt.sign({ photo, jobId: '1', userId: '2' }, process.env.JWT_SECRET, { audience: 'qg-photo', expiresIn: '1h' }) });
test('rejects unsupported, empty, oversized and disguised image uploads', () => {
  for (const [buffer, type] of [[Buffer.alloc(0), 'image/png'], [Buffer.alloc(10485761), 'image/png'], [Buffer.from('<svg/>'), 'image/svg+xml'], [Buffer.from('not an image'), 'image/jpeg']]) assert.throws(() => validateImage(buffer, type), { status: 400 });
  validateImage(Buffer.from('89504e470d0a1a0a', 'hex'), 'image/png');
});
test('only accepts signed receipts for the current job and inspector', () => {
  assert.deepEqual(verifyPhoto(receipt(), 1, 2), photo);
  for (const [input, job, user] of [[receipt(), 3, 2], [receipt(), 1, 3], [{ storage_key: photo.storage_key }, 1, 2], [{ prototype_key: 'fake' }, 1, 2], [{ upload_token: receipt().upload_token + 'x' }, 1, 2]]) assert.throws(() => verifyPhoto(input, job, user), { status: 400 });
});
const fakeDb = () => {
  const queries = [];
  const client = { release() {}, async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes('FOR UPDATE OF j')) return { rows: [{ id: 1, status: 'PENDING', eligible: true, task_type: 'FITMENT', masterlist_id: 42 }] };
    if (sql.includes('AS next')) return { rows: [{ next: 1 }] };
    if (sql.includes('INSERT INTO qg_inspection (')) return { rows: [{ id: 10 }] };
    if (sql.includes('SELECT name FROM qg_defect_issue')) return { rows: [{ name: 'Installation' }] };
    if (sql.includes("category = 'oe'")) return { rows: Number(values[0]) === 4 ? [{ name: 'Dashboard' }] : [] };
    if (sql.includes('FROM task_item')) return { rows: Number(values[0]) === 5 && values[1] === 42 && values[2] === 'FITMENT' ? [{ name: 'Camera' }] : [] };
    if (sql.includes('FROM qg_defect_option')) return { rows: [
      { id: 2, category: 'description', name: 'GAPPING' },
      { id: 3, category: 'area', name: 'None' }
    ] };
    if (sql.includes('INSERT INTO qg_inspection_defect')) return { rows: [{ id: 20 }] };
    return { rows: [] };
  } };
  return { queries, req: { app: { get: () => ({ connect: async () => client }) } } };
};
test('persists trusted S3 metadata and commits the inspection', async () => {
  const { req, queries } = fakeDb();
  await submitInspection(req, 1, { result: 'DEFECT', defects: [{ issue_id: 1, description_id: 2, area_id: 3, parts_type: 'OE', oe_id: 4, photos: [{ ...receipt(), url: 'https://untrusted.invalid' }] }] }, 2);
  const saved = queries.find(q => q.sql.includes('INSERT INTO qg_defect_photo'));
  assert.equal(saved.values[1], photo.storage_key);
  assert.equal(saved.values[2], photo.url);
  assert.equal(saved.values[6], false);
  const defect = queries.find(q => q.sql.includes('INSERT INTO qg_inspection_defect'));
  assert.deepEqual(defect.values.slice(4), [2, 3, 'Installation', 'GAPPING', 'None', 'OE', 4, null, 'Dashboard']);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});
test('invalid photo rolls back without completing the job', async () => {
  const { req, queries } = fakeDb();
  await assert.rejects(submitInspection(req, 1, { result: 'DEFECT', defects: [{ issue_id: 1, description_id: 2, area_id: 3, parts_type: 'OE', oe_id: 4, photos: [{ prototype_key: 'fake' }] }] }, 2), { status: 400 });
  assert.equal(queries.at(-1).sql, 'ROLLBACK');
  assert.equal(queries.some(q => q.sql.includes('UPDATE qg_job')), false);
});
test('a defect requires valid description and area selections', async () => {
  const { req, queries } = fakeDb();
  await assert.rejects(submitInspection(req, 1, { result: 'DEFECT', defects: [{ issue_id: 1, description_id: 2, area_id: 999, photos: [receipt()] }] }, 2), { status: 400 });
  assert.equal(queries.at(-1).sql, 'ROLLBACK');
  assert.equal(queries.some(q => q.sql.includes('INSERT INTO qg_inspection_defect')), false);
});

test('saves an accessory belonging to the job with its name snapshot', async () => {
  const { req, queries } = fakeDb();
  await submitInspection(req, 1, { result: 'DEFECT', defects: [{ issue_id: 1, description_id: 2, area_id: 3, parts_type: 'ACCESSORIES', accessory_id: 5, photos: [receipt()] }] }, 2);
  const saved = queries.find(q => q.sql.includes('INSERT INTO qg_inspection_defect'));
  assert.deepEqual(saved.values.slice(9), ['ACCESSORIES', null, 5, 'Camera']);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});
test('rejects missing, mixed, inactive OE and unrelated accessory selections', async () => {
  for (const selection of [{}, { parts_type: 'OTHER', accessory_id: 5 }, { parts_type: 'OE', oe_id: 999 }, { parts_type: 'OE', oe_id: 4, accessory_id: 5 }, { parts_type: 'ACCESSORIES', accessory_id: 999 }, { parts_type: 'ACCESSORIES', accessory_id: 5, oe_id: 4 }]) {
    const { req, queries } = fakeDb();
    await assert.rejects(submitInspection(req, 1, { result: 'DEFECT', defects: [{ issue_id: 1, description_id: 2, area_id: 3, ...selection, photos: [receipt()] }] }, 2), { status: 400 });
    assert.equal(queries.at(-1).sql, 'ROLLBACK');
    assert.equal(queries.some(q => q.sql.includes('INSERT INTO qg_inspection_defect')), false);
  }
});
