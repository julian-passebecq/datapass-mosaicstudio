"""Generate tiny, synthetic QA fixtures. DuckDB is only a test dependency here."""
from pathlib import Path
import duckdb
root = Path(__file__).resolve().parents[1] / 'tests' / 'fixtures'
root.mkdir(parents=True, exist_ok=True)
(root / 'sample.csv').write_text('id,region,amount\n1,North,10\n2,South,20\n3,North,30\n', encoding='utf-8')
target = root / 'sample.parquet'
if target.exists():
    target.unlink()  # This one generated fixture is owned by this script.
con = duckdb.connect()
con.execute("CREATE TABLE sample AS SELECT * FROM (VALUES (1, 'North', 10), (2, 'South', 20), (3, 'North', 30)) AS t(id, region, amount)")
sql_path = str(target).replace("'", "''")
con.execute(f"COPY sample TO '{sql_path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
con.close()
print(f'Generated synthetic CSV and Parquet fixtures with DuckDB {duckdb.__version__}')
