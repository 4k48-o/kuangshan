
import pandas as pd
import glob
import re
import requests
import os
import json

# API Endpoint
API_URL = "http://localhost:3000/api/reports"

# Shift Mapping
SHIFT_MAP = {
    "1": "早班",
    "2": "中班",
    "3": "晚班"
}

def parse_file(file_path):
    try:
        df = pd.read_excel(file_path, header=None)
        
        # 1. Parse Date and Shift from Row 1 (Index 1)
        # Content: "报告日期：   2025  年 8  月  19 日         （    2   班组）"
        header_text = str(df.iloc[1, 0])
        
        # Regex to extract date numbers and shift
        # Matches: 2025, 8, 19, 2
        match = re.search(r'(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日.*（\s*(\d+)\s*班组', header_text)
        
        if not match:
            print(f"Skipping {file_path}: Could not parse date/shift from '{header_text}'")
            return None
            
        year, month, day, shift_code = match.groups()
        
        # Format Date: YYYY-MM-DD
        shift_date = f"{year}-{int(month):02d}-{int(day):02d}"
        shift_type = SHIFT_MAP.get(shift_code, "早班") # Default to Morning if unknown
        
        # 2. Parse Grades
        # Row 4: Raw Ore (Index 4)
        # Row 5: Conc (Index 5)
        # Row 6: Tail (Index 6)
        # Cols: 1=Pb, 2=Zn, 3=Ag
        
        def get_val(row, col):
            val = df.iloc[row, col]
            try:
                return float(val)
            except:
                return 0.0

        raw_pb = get_val(4, 1)
        raw_zn = get_val(4, 2)
        raw_ag = get_val(4, 3)
        
        conc_pb = get_val(5, 1)
        conc_zn = get_val(5, 2)
        conc_ag = get_val(5, 3)
        
        tail_pb = get_val(6, 1)
        tail_zn = get_val(6, 2)
        tail_ag = get_val(6, 3)
        
        payload = {
            "shiftDate": shift_date,
            "shiftType": shift_type,
            "runTime": 8, # Default
            "rawOre": {
                "wetWeight": 0, # Missing in file
                "moisture": 0,  # Missing in file
                "pbGrade": raw_pb,
                "znGrade": raw_zn,
                "agGrade": raw_ag
            },
            "concentrate": {
                "pbGrade": conc_pb,
                "znGrade": conc_zn,
                "agGrade": conc_ag
            },
            "tailings": {
                "pbGrade": tail_pb,
                "znGrade": tail_zn,
                "agGrade": tail_ag,
                "fineness": 0
            }
        }
        
        return payload

    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
        return None

def main():
    _base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    folder = os.path.join(_base, "data", "excel", "CF鸿晟报表", "8月")
    files = sorted(glob.glob(os.path.join(folder, "*.xlsx")))
    
    print(f"Found {len(files)} files.")
    
    for file_path in files:
        if "~$" in file_path: continue # Skip temp files
        
        print(f"Processing {file_path}...")
        payload = parse_file(file_path)
        
        if payload:
            print(f"  Uploading {payload['shiftDate']} {payload['shiftType']}...")
            try:
                resp = requests.post(API_URL, json=payload)
                if resp.status_code in [200, 201]:
                    print("  Success!")
                else:
                    print(f"  Failed: {resp.status_code} - {resp.text}")
            except Exception as e:
                print(f"  Request Error: {e}")

if __name__ == "__main__":
    main()
