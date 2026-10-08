const test = require('node:test');
const assert = require('node:assert/strict');
const { getInspectionDetail } = require('../modules/auth/v1/models/qgModel');
const { getSignedReadUrl } = require('../utils/s3Upload');

test('returns one inspection with ordered defects and their evidence', async () => {
  const queries = [];
  const req = { user: { id: 1, role: 'admin' }, app: { get: () => ({ query: async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes('FROM qg_inspection i')) return { rows: [{ id: 42, result: 'DEFECT', fitment_id: 'V-42', bay: 'F-06', installers: [{ id: 5, name: 'Amir' }], items: [{ id: 9, name: 'Door visor' }] }] };
    return { rows: [
      { id: 7, sequence_no: 1, issue: 'Scratch', remark: 'Left door', photo_id: 11, storage_key: 'qg/defects/1/a.jpg', file_name: 'a.jpg' },
      { id: 7, sequence_no: 1, issue: 'Scratch', remark: 'Left door', photo_id: 12, storage_key: 'qg/defects/1/b.jpg', file_name: 'b.jpg' },
      { id: 8, sequence_no: 2, issue: 'Loose installation', remark: null, photo_id: null }
    ] };
  } }) } };
  const detail = await getInspectionDetail(req, 42);
  assert.deepEqual(queries.map(({ values }) => values), [[42, null, '2026-09-28'], [42]]);
  assert.match(queries[0].sql, /i\.voided_at IS NULL/);
  assert.match(queries[0].sql, /m\.cafi_date::date >= \$3::date/);
  assert.match(queries[0].sql, /cs\.checkin_id = c\.no/);
  assert.equal(detail.id, 42);
  assert.equal(detail.installers[0].name, 'Amir');
  assert.equal(detail.items[0].name, 'Door visor');
  assert.equal(detail.defects.length, 2);
  assert.deepEqual(detail.defects.map((defect) => defect.photos.length), [2, 0]);
  assert.equal(detail.defects[0].photos[0].file_name, 'a.jpg');
});

test('does not expose a missing or voided inspection', async () => {
  const req = { app: { get: () => ({ query: async () => ({ rows: [] }) }) } };
  assert.equal(await getInspectionDetail(req, 42), null);
});

test('QG users cannot open another inspector’s detail or evidence', async () => {
  const queries = [];
  const req = { user: { id: 7, role: 'qg' }, app: { get: () => ({ query: async (sql, values) => {
    queries.push({ sql, values });
    return { rows: [] };
  } }) } };
  assert.equal(await getInspectionDetail(req, 42), null);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, [42, 7, '2026-09-28']);
  assert.match(queries[0].sql, /i\.inspected_by = \$2::bigint/);
});

test('generates an expiring signed link for private evidence', () => {
  const keys = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    AWS_REGION: 'ap-southeast-1', AWS_S3_BUCKET: 'private-evidence',
    AWS_ACCESS_KEY_ID: 'example-key', AWS_SECRET_ACCESS_KEY: 'example-secret'
  });
  delete process.env.AWS_SESSION_TOKEN;
  try {
    const url = new URL(getSignedReadUrl('qg/defects/1/photo.jpg'));
    assert.equal(url.hostname, 'private-evidence.s3.ap-southeast-1.amazonaws.com');
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
    assert.match(url.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);
  } finally {
    for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
  }
});
