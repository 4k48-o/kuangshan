
import pandas as pd
import os

_base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
file_path = os.path.join(_base, "data", "excel", "CF鸿晟报表", "8月", "核算表8.19.xlsx")

try:
    # Read first sheet
    df = pd.read_excel(file_path, header=None)
    print(f"File: {file_path}")
    print("Shape:", df.shape)
    print("Content (First 30 rows):")
    print(df.head(30).to_string())
except Exception as e:
    print("Error:", e)
