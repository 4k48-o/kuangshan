import os
import pandas as pd

_base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
file_path = os.path.join(_base, "data", "excel", "日报样本", "完成生产日报表2025.06.28.xlsx")

try:
    xl = pd.ExcelFile(file_path)
    sheet_names = xl.sheet_names
    
    # Check if we have enough sheets
    if len(sheet_names) < 2:
        print("Error: Less than 2 sheets found.")
    else:
        target_sheet = sheet_names[1] # Sheet 2 (index 1)
        print(f"Target Sheet (Index 1): {target_sheet}")
        
        print(f"\n{'='*50}")
        print(f"Analyzing Sheet: {target_sheet}")
        print(f"{'='*50}")
        
        # Parse without header first to see layout
        df = xl.parse(target_sheet, header=None)
        
        print(f"Dimensions: {df.shape}")
        
        # Print first 20 rows to understand headers and data structure
        print("\nFirst 20 rows:")
        print(df.head(20).to_string())

except Exception as e:
    print(f"Error: {e}")
