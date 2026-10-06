import sqlite3
from config import setting

class SqliteHelper():
    def __init__(self):
        setting.load_config()

    def sqliteExecute(self,sql):
        conn = sqlite3.connect(setting.database_server_name)
        c = conn.cursor()
        row = c.execute(sql)
        conn.commit()
        conn.close()

        return row

    def sqliteQuery(self,sql):
        conn = sqlite3.connect(setting.database_server_name)
        cursor = conn.cursor()
        cursor.execute(sql)

        values = cursor.fetchall()
        return values