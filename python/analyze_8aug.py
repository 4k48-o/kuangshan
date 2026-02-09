
import pandas as pd
import os

_base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
file_path = os.path.join(_base, "data", "excel", "CF鸿晟报表", "8月", "8.22.3CF(鸿晟)选矿台班样化验单.xlsx")

try:
    df = pd.read_excel(file_path, header=None)
    print("Shape:", df.shape)
    print("Content:")
    print(df.head(20).to_string())
except Exception as e:
    print("Error:", e)
