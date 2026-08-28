const ensureAndonVisibilitySettings = async (req) => {
  await req.app.get('pool').query(`
    CREATE TABLE IF NOT EXISTS andon_visibility_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      visible_bay_ids JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await req.app.get('pool').query(`
    INSERT INTO andon_visibility_settings (id, visible_bay_ids)
    VALUES (1, NULL)
    ON CONFLICT (id) DO NOTHING
  `);
};

const getAndonVisibleBayIds = async (req) => {
  await ensureAndonVisibilitySettings(req);
  const result = await req.app.get('pool').query(`
    SELECT visible_bay_ids, updated_at
    FROM andon_visibility_settings
    WHERE id = 1
  `);

  return result.rows[0] || { visible_bay_ids: null, updated_at: null };
};

const updateAndonVisibleBayIds = async (req, visibleBayIds) => {
  await ensureAndonVisibilitySettings(req);
  const result = await req.app.get('pool').query(`
    UPDATE andon_visibility_settings
    SET visible_bay_ids = $1::jsonb,
        updated_at = NOW()
    WHERE id = 1
    RETURNING visible_bay_ids, updated_at
  `, [visibleBayIds === null ? null : JSON.stringify(visibleBayIds)]);

  return result.rows[0];
};

module.exports = {
  getAndonVisibleBayIds,
  updateAndonVisibleBayIds
};
