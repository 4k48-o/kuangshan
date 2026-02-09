import mysql.connector
from mysql.connector import Error

def create_connection():
    connection = None
    try:
        connection = mysql.connector.connect(
            host='127.0.0.1',
            user='root',
            passwd='sj1qaz',
            connect_timeout=5
        )
        print("MySQL Database connection successful")
        return connection
    except Error as e:
        print(f"The error '{e}' occurred")
        return None

if __name__ == '__main__':
    connection = create_connection()
    if connection:
        cursor = connection.cursor()
        try:
            cursor.execute("CREATE DATABASE IF NOT EXISTS mineral_db")
            print("Database 'mineral_db' created or verified")
            
            cursor.execute("SHOW DATABASES")
            for db in cursor:
                print(db)
        except Error as e:
            print(f"Error: {e}")
        finally:
            cursor.close()
            connection.close()
