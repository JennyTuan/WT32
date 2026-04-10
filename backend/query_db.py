import sqlite3
import os

db_path = r"c:\CT-Prototype-backup\CT-Prototype\backend\app.db"

if not os.path.exists(db_path):
    print(f"Error: Database file not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print(f"{'ID':<4} | {'Name':<15} | {'ScanMode':<10} | {'is_4d':<6} | {'is_enhance':<10}")
print("-" * 60)

try:
    # 检查新增字段
    cursor.execute("SELECT id, name, scan_mode, is_4d, is_enhance FROM protocols LIMIT 20;")
    rows = cursor.fetchall()
    
    for row in rows:
        print(f"{row[0]:<4} | {row[1]:<15} | {row[2]:<10} | {str(row[3]):<6} | {str(row[4]):<10}")

except sqlite3.OperationalError as e:
    print(f"Query error (maybe columns missing?): {e}")

conn.close()
