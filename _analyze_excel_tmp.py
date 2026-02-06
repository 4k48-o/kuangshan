import pandas as pd

file_path = '/Users/laoyang/code/ai/kuangshan_new/完成生产日报表2025.06.28.xlsx'

def analyze_sheet(xl, sheet_name):
    print(f"\n{'='*50}")
    print(f"Sheet: {sheet_name}")
    print(f"{'='*50}")
    try:
        df = xl.parse(sheet_name)
        print(f"Dimensions: {df.shape}")
        print("Columns:", df.columns.tolist())
        print("\nFirst 10 rows:")
        # Use to_string for safe printing
        print(df.head(10).to_string())
    except Exception as e:
        print(f"Error reading sheet {sheet_name}: {e}")

try:
    xl = pd.ExcelFile(file_path)
    
    # Focus on likely key sheets based on names
    target_sheets = ['基础数据', '日报表', '生产简报']
    
    # Also print a full list of sheets again for reference
    print(f"All Sheets: {xl.sheet_names}")
    
    for sheet in target_sheets:
        if sheet in xl.sheet_names:
            analyze_sheet(xl, sheet)
        else:
            print(f"\nSheet '{sheet}' not found.")

except Exception as e:
    print(f"Critical error: {e}")
