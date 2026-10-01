/** Deterministic demonstration data, never presented as a client's real results. */
const extensionRepository=new URL('duckdb/extensions',new URL(import.meta.env.BASE_URL,location.href)).href.replaceAll("'","''");
export const seedSql=`
SET custom_extension_repository = '${extensionRepository}';
SET allow_community_extensions = false;
INSTALL json;
LOAD json;
INSTALL parquet;
LOAD parquet;
CREATE TABLE IF NOT EXISTS operations AS
SELECT i::INTEGER AS id,
  (1 + (i % 30))::INTEGER AS day,
  CASE (i % 4) WHEN 0 THEN 'North' WHEN 1 THEN 'South' WHEN 2 THEN 'Coast' ELSE 'Alpine' END AS region,
  CASE (i % 3) WHEN 0 THEN 'Wind' WHEN 1 THEN 'Solar' ELSE 'Hydro' END AS technology,
  round(25 + (i % 19) * 3.8 + sin(i * .45) * 12, 2) AS energy_mwh,
  round((25 + (i % 19) * 3.8 + sin(i * .45) * 12) * (64 + i % 12), 2) AS revenue_eur,
  round(91 + (i % 9) * .9, 1) AS availability_pct
FROM range(360) t(i);`;
