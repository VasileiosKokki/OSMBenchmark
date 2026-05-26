import subprocess
import glob
import os
import time

CREATEDB = "createdb"
DROPDB = "dropdb"
PSQL = "psql"
OSM2PGSQL = "osm2pgsql"
DB_USER = "postgres"
DB_PASSWORD = "postgres"
DB_NAME = "osm_db"

os.environ["PGPASSWORD"] = DB_PASSWORD

start_time = time.time()
# 1️⃣ Drop existing database
try:
    subprocess.run([DROPDB, "-U", DB_USER, "--if-exists", DB_NAME], check=True)
    print(f"✅ Dropped database '{DB_NAME}'")
except subprocess.CalledProcessError:
    print(f"⚠️ Could not drop '{DB_NAME}', continuing...")

# 2️⃣ Create fresh database
subprocess.run([CREATEDB, "-U", DB_USER, DB_NAME], check=True)
print(f"✅ Created database '{DB_NAME}'")

# 3️⃣ Enable PostGIS and hstore
subprocess.run([PSQL, "-U", DB_USER, "-d", DB_NAME, "-c", "CREATE EXTENSION IF NOT EXISTS postgis;"], check=True)
subprocess.run([PSQL, "-U", DB_USER, "-d", DB_NAME, "-c", "CREATE EXTENSION IF NOT EXISTS hstore;"], check=True)
print("✅ Extensions enabled")

# 4️⃣ Import OSM files
osm_files = glob.glob(os.path.join("..", "greece-*.osm.pbf"))
if not osm_files:
    print("❌ No OSM files found!")
else:
    print("✅ Found OSM files:", osm_files)
    for f in osm_files:
        print(f"⏳ Importing {f} ...")
        subprocess.run([
            OSM2PGSQL,
            "-U", DB_USER,
            "-d", DB_NAME,
            "--slim",
            "--hstore-all",
            "--drop",
            f
        ], check=True)
        print(f"✅ Imported {f}")

print("✅ Done!")
end_time = time.time()
total_time = end_time - start_time

print(f"Total execution time: {total_time:.2f} seconds")

result = subprocess.run(
    [PSQL, "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c",
     "SELECT pg_size_pretty(pg_database_size(current_database()));"],
    check=True, capture_output=True, text=True
)
print(f"💾 Database size: {result.stdout.strip()}")