import pandas as pd

file_path = '/Users/laoyang/code/ai/kuangshan_new/完成生产日报表2025.06.28.xlsx'

try:
    # Load the sheet without header to treat everything as data
    df = pd.read_excel(file_path, sheet_name='基础数据', header=None)
    
    print("Searching for '乙班' in '基础数据' sheet...")
    
    # Find coordinates of '乙班'
    matches = []
    for r_idx, row in df.iterrows():
        for c_idx, value in enumerate(row):
            if str(value).strip() == '乙班':
                matches.append((r_idx, c_idx))
    
    if not matches:
        print("Could not find '乙班' in the sheet.")
    else:
        for r, c in matches:
            print(f"\nFound '乙班' at Row {r}, Column {c}")
            
            # Print the surrounding context (e.g., 10 rows down, covering the user's data points)
            # User mentioned: 原矿, 铅精, 尾矿, 运转时间, 处理量, 水分
            
            print(f"Context (Rows {r} to {r+15}):")
            # Select relevant columns: The column with '乙班' and maybe the previous column (labels) and next columns (data)
            # Based on previous head(), labels seem to be in Col 0 (or similar), and data in subsequent cols.
            # If '乙班' is a header, data might be below it.
            
            # Let's print a slice of the dataframe around the match
            start_row = r
            end_row = min(r + 15, df.shape[0])
            start_col = max(0, c - 2)
            end_col = min(c + 5, df.shape[1])
            
            subset = df.iloc[start_row:end_row, start_col:end_col]
            print(subset.to_string())

except Exception as e:
    print(f"Error: {e}")
