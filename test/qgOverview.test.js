const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getOverview, dateRange } = require('../modules/auth/v1/models/qgOverviewModel');

const request = (role) => {
  const queries = [];
  const db = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('WITH ignored_jobs AS')) return { rows: [] };
    if (sql.includes('AS defects_by_bay')) return { rows: [{ inspector_vehicle_types: [{ inspector_id: 7, inspector: 'Inspector One', v: 3, a: 2, j: 0 }], vehicle_types: [{ vehicle_type: 'V', completed: 3, approved: 2, defect: 1 }], defects_by_bay: [{ bay_id: 1, bay: 'Bay 1', completed: 3, defect: 1, defect_count: 2 }] }] };
    if (sql.includes('AS inspected')) return { rows: [
      { task_type: 'FITMENT', inspected: 120, approved: 112, defect: 8 },
      { task_type: 'HOIST', inspected: 80, approved: 76, defect: 4 }
    ] };
    if (sql.includes('AS pending')) return { rows: [
      { task_type: 'FITMENT', pending: 14 }, { task_type: 'HOIST', pending: 10 }
    ] };
    if (sql.includes('AS checked')) return { rows: [
      { task_type: 'FITMENT', checked: 90, approved: 84, defect: 6 },
      { task_type: 'HOIST', checked: 60, approved: 57, defect: 3 }
    ] };
    if (sql.includes('AS bucket')) return { rows: [{ bucket: '08:00', task_type: 'FITMENT', count: 12 }] };
    if (sql.includes('dimension.category')) return { rows: [
      { category: 'type', id: '5', name: 'Installation', count: 7 },
      { category: 'description', id: '11', name: 'Loose fitting', count: 6 },
      { category: 'area', id: '21', name: 'Front', count: 4 },
      { category: 'type', id: '2', name: 'Functional', count: 3 }
    ] };
    throw new Error('Unexpected SQL');
  } };
  return { req: { user: { role }, app: { get: () => db } }, queries };
};

test('overview combines task outcomes and defect issue counts', async () => {
  const { req, queries } = request('supervisor');
  const data = await getOverview(req, { date_from: '2026-09-28', date_to: '2026-09-28' });
  assert.equal(data.ca_available, true);
  assert.deepEqual(data.inspector_vehicle_types, [{ inspector_id: 7, inspector: 'Inspector One', v: 3, a: 2, j: 0 }]);
  assert.equal(data.vehicle_types[0].vehicle_type, 'V');
  assert.equal(data.defects_by_bay[0].defect_count, 2);
  const breakdown = queries.find(({ sql }) => sql.includes('AS defects_by_bay'));
  assert.deepEqual(breakdown.params, ['2026-09-28', '2026-09-28', null, '2026-09-28']);
  assert.match(breakdown.sql, /DISTINCT ON \(qg_job_id\)/);
  assert.match(breakdown.sql, /WHERE voided_at IS NULL/);
  assert.match(breakdown.sql, /LEFT JOIN bay/);
  assert.doesNotMatch(breakdown.sql, /LIMIT/);
  assert.match(breakdown.sql, /SELECT DISTINCT i.inspected_by AS inspector_id/);
  assert.match(breakdown.sql, /m.no AS vehicle_id/);
  assert.match(breakdown.sql, /FROM inspector_vehicles GROUP BY inspector_id, inspector/);
  assert.deepEqual(data.qg.map((row) => [row.inspected, row.approved, row.defect, row.pending]), [[120, 112, 8, 14], [80, 76, 4, 10]]);
  assert.deepEqual(data.ca.map((row) => [row.checked, row.approved, row.defect]), [[90, 84, 6], [60, 57, 3]]);
  assert.deepEqual(data.defect_issues, [
    { id: 5, issue: 'Installation', count: 7 },
    { id: 2, issue: 'Functional', count: 3 }
  ]);
  assert.deepEqual(data.defect_descriptions, [{ id: 11, name: 'Loose fitting', count: 6 }]);
  assert.deepEqual(data.defect_areas, [{ id: 21, name: 'Front', count: 4 }]);
  assert.equal(queries.filter(({ sql }) => sql.includes('ca_case')).length, 1);
  const qgQueries = queries.filter(({ sql }) => sql.includes('FROM first_result f'));
  assert.equal(qgQueries.length, 3);
  for (const { sql, params } of qgQueries) {
    assert.match(sql, /m\.cafi_date::date >= \$4::date/);
    assert.match(sql, /f\.inspected_at AT TIME ZONE 'UTC'/);
    assert.match(sql, /AT TIME ZONE 'Asia\/Kuala_Lumpur'\)::date/);
    assert.equal(params[3], '2026-09-28');
  }
});

test('CA reporting is withheld from other QG dashboard roles', async () => {
  const { req, queries } = request('admin');
  const data = await getOverview(req, { date_from: '2026-09-28' });
  assert.equal(data.ca_available, false);
  assert.equal(data.defect_issues.length, 2);
  assert.equal(queries.filter(({ sql }) => sql.includes('ca_case')).length, 0);
});

test('invalid reporting filters are rejected', () => {
  assert.throws(() => dateRange({ date_from: '2026-09-29', date_to: '2026-09-28' }), /valid date range/);
  assert.throws(() => dateRange({ task_type: 'OTHER' }), /valid work type/);
});
