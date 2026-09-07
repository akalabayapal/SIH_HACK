import mysql.connector
from pathlib import Path

DB_NAME = "hckdb"

conn = mysql.connector.connect(
    host="localhost",
    user="root",
    password=""
)

cursor = conn.cursor()

# Create database
cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
cursor.execute(f"USE `{DB_NAME}`")

# Read schema
schema_path = Path(__file__).parent / "hckdb.sql"

with open(schema_path, "r", encoding="utf-8") as f:
    schema = f.read()

# Execute each SQL statement
for statement in schema.split(";"):
    statement = statement.strip()

    if statement:
        cursor.execute(statement)

conn.commit()

cursor.close()
conn.close()

print("Database schema created successfully.")