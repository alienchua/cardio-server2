const test = require('node:test');
const assert = require('node:assert/strict');
const { getDashboard, listInspections, getInspectionExport } = require('../modules/auth/v1/models/qgModel');

const requestFor = (role, id, queries) => ({
  user: { role, id },
  app: { get: () => ({ query: async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes('COUNT(*)::int AS completed')) {
      return { rows: [{ pending: 2, completed: 1, approved: 1, defect: 0 }] };
    }
    return { rows: [] };
  } }) }
});

test('mobile dashboard counts and recent activity use the signed-in QG identity', async () => {
  const queries = [];
  await getDashboard(requestFor('qg', 17, queries), { date_from: '2026-09-24', date_to: '2026-09-24' });
  assert.deepEqual(queries[1].values, ['2026-09-24', '2026-09-24', 17, '2026-09-28']);
  assert.deepEqual(queries[2].values, ['2026-09-24', '2026-09-24', 17, '2026-09-28']);
  assert.deepEqual(queries[3].values, queries[2].values);
  assert.match(queries[3].sql, /i\.inspected_by = \$3::bigint/);
  assert.match(queries[3].sql, /i\.voided_at IS NULL/);
  assert.doesNotMatch(queries[3].sql, /LIMIT/);
  assert.match(queries[1].sql, /inspected_by = \$3::bigint/);
  assert.match(queries[1].sql, /m\.cafi_date::date >= \$4::date/);
  assert.match(queries[2].sql, /m\.cafi_date::date >= \$4::date/);
  assert.match(queries[2].sql, /i\.inspected_by = \$3::bigint/);
  assert.match(queries[2].sql, /i\.inspected_at AT TIME ZONE 'UTC'/);
  assert.match(queries[2].sql, /AT TIME ZONE 'Asia\/Kuala_Lumpur'\)::date/);
});

test('QG history is scoped while admin reporting keeps the team view', async () => {
  const qgQueries = [];
  await listInspections(requestFor('qg', 17, qgQueries), { result: 'DEFECT' });
  assert.deepEqual(qgQueries[0].values, ['2026-09-28', 17, 'DEFECT']);
  assert.match(qgQueries[0].sql, /m\.cafi_date::date >= \$1::date/);
  assert.match(qgQueries[0].sql, /i\.inspected_by = \$2::bigint/);
  assert.match(qgQueries[0].sql, /i\.inspected_at AT TIME ZONE 'UTC'/);

  const adminQueries = [];
  await listInspections(requestFor('admin', 1, adminQueries), { result: 'DEFECT' });
  assert.deepEqual(adminQueries[0].values, ['2026-09-28', 'DEFECT']);
  assert.doesNotMatch(adminQueries[0].sql, /i\.inspected_by =/);

  const dashboardQueries = [];
  await getDashboard(requestFor('admin', 1, dashboardQueries), { date_from: '2026-09-24', date_to: '2026-09-24' });
  assert.equal(dashboardQueries[1].values[2], null);
  assert.equal(dashboardQueries[2].values[2], null);
});

test('QG export includes all history, defect details, and pending tasks', async () => {
  const queries = [];
  const data = await getInspectionExport(requestFor('admin', 1, queries));
  assert.deepEqual(data, { inspections: [], defects: [], pending: [] });
  assert.deepEqual(queries[0].values, [null, '2026-09-28']);
  assert.deepEqual(queries[1].values, [null, '2026-09-28']);
  assert.doesNotMatch(queries[0].sql, /LIMIT\s+\d+\s*$|date_from|date_to/);
  assert.match(queries[0].sql, /AS installers/);
  assert.match(queries[0].sql, /AS items/);
  assert.match(queries[0].sql, /i\.inspected_at AT TIME ZONE 'UTC'/);
  assert.match(queries[1].sql, /AS defect_type/);
  assert.match(queries[1].sql, /AS photo_count/);
  assert.match(queries[0].sql, /m\.cafi_date::date >= \$2::date/);
  assert.match(queries[1].sql, /m\.cafi_date::date >= \$2::date/);
  assert.match(queries[2].sql, /WHERE j.status = 'PENDING'/);
  assert.deepEqual(queries[2].values, ['2026-09-28']);

  const qgQueries = [];
  await getInspectionExport(requestFor('qg', 17, qgQueries));
  assert.deepEqual(qgQueries[0].values, [17, '2026-09-28']);
  assert.deepEqual(qgQueries[1].values, [17, '2026-09-28']);
});


test('inspector vehicle counts preserve QG ownership and return only recorded inspectors', async () => {
  for (const [role, owner] of [['qg', 17], ['admin', null]]) {
    const queries = [];
    const req = requestFor(role, 17, queries);
    const originalDb = req.app.get();
    req.app.get = () => ({ query: async (sql, values) => {
      if (sql.includes('AS inspector_vehicle_types')) {
        queries.push({ sql, values });
        return { rows: [{ inspector_vehicle_types: [{ inspector_id: 17, inspector: 'QG One', v: 2, a: 0, j: 1 }] }] };
      }
      return originalDb.query(sql, values);
    } });
    const result = await getDashboard(req, { date_from: '2026-09-28', date_to: '2026-09-30' });
    assert.deepEqual(result.inspector_vehicle_types, [{ inspector_id: 17, inspector: 'QG One', v: 2, a: 0, j: 1 }]);
    const query = queries.find(({ sql }) => sql.includes('AS inspector_vehicle_types'));
    assert.deepEqual(query.values, ['2026-09-28', '2026-09-30', owner, '2026-09-28']);
    const inspectorSql = query.sql.split('inspector_vehicles AS (')[1];
    assert.match(inspectorSql, /SELECT DISTINCT i.inspected_by/);
    assert.match(inspectorSql, /i.inspected_by = \$3::bigint/);
    assert.match(inspectorSql, /i.voided_at IS NULL/);
  }
});
