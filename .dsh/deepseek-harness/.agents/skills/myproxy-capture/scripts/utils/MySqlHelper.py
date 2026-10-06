import mysql.connector
import os
from config import setting
from mysql.connector import Error


class MySqlHelper:
    def __init__(self, host=None, user=None, password=None, database=None):
        system_config = setting.load_config()
        if host is None:
            host=system_config.get('mysql','Msql_hostname')
        if user is None:
            user=system_config.get('mysql','Msql_username')
        if password is None:
            password=system_config.get('mysql','Msql_password')
        if database is None:
            database=system_config.get('mysql','Msql_database')

        self.host = host
        self.user = user
        self.password = password
        self.database = database
        self.connection = None
        self.connect()


    def connect(self):
        """Establish a connection to the MySQL database."""
        try:
            self.connection = mysql.connector.connect(
                host=self.host,
                user=self.user,
                password=self.password,
                database=self.database
            )
            if self.connection.is_connected():
                print("Connected to MySQL database")
        except Error as e:
            print(f"Error: {e}")
            self.connection = None

    def disconnect(self):
        """Close the connection to the MySQL database."""
        if self.connection and self.connection.is_connected():
            self.connection.close()
            print("MySQL connection closed")

    def execute_query(self, query, params=None):
        """Execute a single query (e.g., INSERT, UPDATE, DELETE)."""
        if self.connection is None:
            print("No connection to MySQL database.")
            return None

        cursor = self.connection.cursor()
        try:
            cursor.execute(query, params)
            self.connection.commit()
            print("Query executed successfully")
        except Error as e:
            print(f"Error: {e}")
            self.connection.rollback()
        finally:
            cursor.close()

    def fetch_query(self, query, params=None):
        """Execute a SELECT query and fetch results."""
        if self.connection is None:
            print("No connection to MySQL database.")
            return None

        cursor = self.connection.cursor(dictionary=True)
        try:
            cursor.execute(query, params)
            result = cursor.fetchall()
            return result
        except Error as e:
            print(f"Error: {e}")
            return None
        finally:
            cursor.close()

    def insert(self, table, data):
        """Insert data into a specified table."""
        columns = ', '.join(data.keys())
        placeholders = ', '.join(['%s'] * len(data))
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
        values = tuple(data.values())
        self.execute_query(query, values)

    def update(self, table, data, where_clause, where_params):
        """Update data in a specified table."""
        set_clause = ', '.join([f"{col} = %s" for col in data.keys()])
        query = f"UPDATE {table} SET {set_clause} WHERE {where_clause}"
        values = tuple(data.values()) + tuple(where_params)
        self.execute_query(query, values)

    def delete(self, table, where_clause, where_params):
        """Delete data from a specified table."""
        query = f"DELETE FROM {table} WHERE {where_clause}"
        self.execute_query(query, where_params)

    def select(self, table, columns="*", where_clause=None, where_params=None):
        """Select data from a specified table."""
        query = f"SELECT {columns} FROM {table}"
        if where_clause:
            query += f" WHERE {where_clause}"
        return self.fetch_query(query, where_params)

    def __del__(self):
        """Destructor to ensure connection closure."""
        self.disconnect()
