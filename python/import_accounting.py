
import pandas as pd
import glob
import re
import requests
import os
import datetime

API_URL = "http://localhost:3000/api/reports"

# Shift Mapping: Col Index for (Pb, Ag, Label, Value)
# DataFrame is 0-indexed.
# 甲班: Cols 1, 2, 3, 4
# 乙班: Cols 5, 6, 7, 8
# 丙班: Cols 9, 10, 11, 12
SHIFTS = [
    {"name": "甲班", "col_start": 1},
    {"name": "乙班", "col_start": 5},
    {"name": "丙班", "col_start": 9}
]

def get_date_from_filename(filepath):
    filename = os.path.basename(filepath)
    parent_dir = os.path.basename(os.path.dirname(filepath))
    
    year = 2025 # Default
    if "2026" in parent_dir:
        year = 2026
    
    # Format: 核算表20060127.xlsx
    match_long = re.search(r'(\d{4})(\d{2})(\d{2})', filename)
    if match_long:
        # If filename has full date, check for 2006 vs 2026 typo
        y, m, d = match_long.groups()
        if y == "2006" and year == 2026:
            y = "2026"
        return f"{y}-{m}-{d}"
    
    # Format: 核算表8.19.xlsx or 6.28.xlsx or 9.01.xlsx
    match_short = re.search(r'(\d+)\.(\d+)', filename)
    if match_short:
        month, day = match_short.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
        
    return None

def parse_file(filepath):
    try:
        df = pd.read_excel(filepath, header=None)
        date_str = get_date_from_filename(filepath)
        
        if not date_str:
            print(f"Skipping {filepath}: Could not determine date.")
            return
            
        print(f"Processing {filepath} ({date_str})...")
        
        for shift in SHIFTS:
            col_pb = shift["col_start"]
            col_ag = shift["col_start"] + 1
            col_val = shift["col_start"] + 3
            
            # Helper to get value safely
            def get_cell(r, c):
                try:
                    val = df.iloc[r, c]
                    return float(val) if pd.notnull(val) else 0.0
                except:
                    return 0.0

            # Check if shift has data (e.g. Raw Pb > 0)
            # Row 4 is Raw Ore (Index 4)
            raw_pb = get_cell(4, col_pb)
            if raw_pb <= 0:
                continue # Skip empty shift
                
            raw_ag = get_cell(4, col_ag)
            run_time = get_cell(4, col_val)
            
            # Row 5: Conc
            conc_pb = get_cell(5, col_pb)
            conc_ag = get_cell(5, col_ag)
            wet_weight = get_cell(5, col_val) # Processing Vol
            
            # Row 6: Tail
            tail_pb = get_cell(6, col_pb)
            tail_ag = get_cell(6, col_ag)
            fineness = get_cell(6, col_val)
            
            # Row 7: Moisture
            moisture = get_cell(7, col_val)
            
            payload = {
                "shiftDate": date_str,
                "shiftType": shift["name"],
                "runTime": run_time,
                "rawOre": {
                    "wetWeight": wet_weight,
                    "moisture": moisture,
                    "pbGrade": raw_pb,
                    "znGrade": 0, # Not in sheet
                    "agGrade": raw_ag
                },
                "concentrate": {
                    "pbGrade": conc_pb,
                    "znGrade": 0,
                    "agGrade": conc_ag
                },
                "tailings": {
                    "pbGrade": tail_pb,
                    "znGrade": 0,
                    "agGrade": tail_ag,
                    "fineness": fineness
                }
            }
            
            print(f"  Uploading {shift['name']}...")
            try:
                resp = requests.post(API_URL, json=payload)
                if resp.status_code not in [200, 201]:
                     print(f"  Failed: {resp.status_code} - {resp.text}")
            except Exception as e:
                print(f"  Request Error: {e}")

    except Exception as e:
        print(f"Error parsing {filepath}: {e}")

def main():
    # 项目整理后 Excel 位于 data/excel/CF鸿晟报表
    _base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    root_dir = os.path.join(_base, "data", "excel", "CF鸿晟报表")
    # Recursively find xlsx files
    files = []
    for dirpath, _, filenames in os.walk(root_dir):
        for f in filenames:
            if f.endswith(".xlsx") and not f.startswith("~"):
                files.append(os.path.join(dirpath, f))
    
    files.sort()
    print(f"Found {len(files)} files.")
    
    for f in files:
        parse_file(f)

if __name__ == "__main__":
    main()
