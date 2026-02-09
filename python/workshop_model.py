from dataclasses import dataclass, field
from typing import Optional

@dataclass
class MetalContent:
    """Represents the calculated metal content."""
    pb_ton: float = 0.0      # 铅金属量 (吨)
    zn_ton: float = 0.0      # 锌金属量 (吨)
    ag_kg: float = 0.0       # 银金属量 (千克)

@dataclass
class ProcessStream:
    """Represents a stream (Raw Ore, Concentrate, Tailings) with its metrics."""
    wet_weight_ton: float = 0.0    # 湿量 (吨)
    moisture_pct: float = 0.0      # 水份 (%)
    
    # Grades (品位)
    pb_grade_pct: float = 0.0      # 铅 (%)
    zn_grade_pct: float = 0.0      # 锌 (%)
    ag_grade_gpt: float = 0.0      # 银 (g/t)
    
    # Calculated Fields
    dry_weight_ton: float = 0.0    # 干量 (吨)
    metal_content: MetalContent = field(default_factory=MetalContent)
    
    def calculate_metrics(self):
        """Calculates dry weight and metal content based on inputs."""
        # 1. Calculate Dry Weight: 干量 = 湿量 * (1 - 水份/100)
        self.dry_weight_ton = self.wet_weight_ton * (1 - self.moisture_pct / 100.0)
        
        # 2. Calculate Metal Content
        # Pb (Ton) = Dry Weight * Pb(%) / 100
        self.metal_content.pb_ton = self.dry_weight_ton * (self.pb_grade_pct / 100.0)
        
        # Zn (Ton) = Dry Weight * Zn(%) / 100
        self.metal_content.zn_ton = self.dry_weight_ton * (self.zn_grade_pct / 100.0)
        
        # Ag (Kg) = Dry Weight * Ag(g/t) / 1000
        self.metal_content.ag_kg = self.dry_weight_ton * self.ag_grade_gpt / 1000.0

@dataclass
class PerformanceMetrics:
    """Represents calculated performance indicators."""
    yield_pct: float = 0.0         # 产率 (%)
    recovery_pb_pct: float = 0.0   # 铅回收率 (%)
    recovery_zn_pct: float = 0.0   # 锌回收率 (%)
    recovery_ag_pct: float = 0.0   # 银回收率 (%)
    enrichment_ratio_pb: float = 0.0 # 铅富集比

@dataclass
class WorkshopShiftEntry:
    """Represents one row in the Workshop Table (e.g., 乙班)."""
    shift_name: str
    
    raw_ore: ProcessStream = field(default_factory=ProcessStream)
    concentrate: ProcessStream = field(default_factory=ProcessStream)
    # Tailings are often derived, but we can store them if measured
    tailings: Optional[ProcessStream] = None
    
    performance: PerformanceMetrics = field(default_factory=PerformanceMetrics)
    
    def calculate_performance(self):
        """Calculates Yield, Recovery Rates, and Enrichment Ratio."""
        # Ensure base metrics are calculated first
        self.raw_ore.calculate_metrics()
        self.concentrate.calculate_metrics()
        
        if self.raw_ore.dry_weight_ton > 0:
            # 1. Yield (产率) = (Conc Dry Wt / Raw Ore Dry Wt) * 100
            self.performance.yield_pct = (self.concentrate.dry_weight_ton / self.raw_ore.dry_weight_ton) * 100.0
            
            # 2. Recovery Rates (回收率) = (Conc Metal / Raw Ore Metal) * 100
            if self.raw_ore.metal_content.pb_ton > 0:
                self.performance.recovery_pb_pct = (self.concentrate.metal_content.pb_ton / self.raw_ore.metal_content.pb_ton) * 100.0
            
            if self.raw_ore.metal_content.zn_ton > 0:
                self.performance.recovery_zn_pct = (self.concentrate.metal_content.zn_ton / self.raw_ore.metal_content.zn_ton) * 100.0
                
            if self.raw_ore.metal_content.ag_kg > 0:
                self.performance.recovery_ag_pct = (self.concentrate.metal_content.ag_kg / self.raw_ore.metal_content.ag_kg) * 100.0
                
            # 3. Enrichment Ratio (富集比) = Conc Grade / Raw Ore Grade
            if self.raw_ore.pb_grade_pct > 0:
                self.performance.enrichment_ratio_pb = self.concentrate.pb_grade_pct / self.raw_ore.pb_grade_pct

    def __repr__(self):
        return (
            f"Shift: {self.shift_name}\n"
            f"--- Raw Ore ---\n"
            f"  Wet: {self.raw_ore.wet_weight_ton}t, Moisture: {self.raw_ore.moisture_pct}%, Dry: {self.raw_ore.dry_weight_ton:.4f}t\n"
            f"  Grades -> Pb: {self.raw_ore.pb_grade_pct}%, Ag: {self.raw_ore.ag_grade_gpt}g/t\n"
            f"  Metal  -> Pb: {self.raw_ore.metal_content.pb_ton:.4f}t, Ag: {self.raw_ore.metal_content.ag_kg:.4f}kg\n"
            f"--- Concentrate ---\n"
            f"  Dry: {self.concentrate.dry_weight_ton:.4f}t\n"
            f"  Grades -> Pb: {self.concentrate.pb_grade_pct}%, Ag: {self.concentrate.ag_grade_gpt}g/t\n"
            f"  Metal  -> Pb: {self.concentrate.metal_content.pb_ton:.4f}t, Ag: {self.concentrate.metal_content.ag_kg:.4f}kg\n"
            f"--- Performance ---\n"
            f"  Yield: {self.performance.yield_pct:.2f}%\n"
            f"  Recovery -> Pb: {self.performance.recovery_pb_pct:.2f}%, Ag: {self.performance.recovery_ag_pct:.2f}%\n"
            f"  Enrichment (Pb): {self.performance.enrichment_ratio_pb:.2f}"
        )

# Example verification with "乙班" data from Sheet 2
if __name__ == "__main__":
    print("Verifying '乙班' Calculation Model...")
    
    # 1. Setup Raw Ore Data (Row 7 in Sheet)
    # 乙班: Wet=128, Moisture=3, Pb=3.75, Ag=161
    raw = ProcessStream(
        wet_weight_ton=128.0,
        moisture_pct=3.0,
        pb_grade_pct=3.75,
        ag_grade_gpt=161.0
    )
    
    # 2. Setup Concentrate Data (Row 14 in Sheet)
    # 乙班: Dry=6.899896, Pb=65.27, Ag=3352
    # Note: For concentrate, we usually input Dry Weight directly or calculate it. 
    # Here we simulate the input as Dry Weight directly (setting Wet=Dry, Moisture=0 for simplicity, or just setting dry)
    conc = ProcessStream(
        pb_grade_pct=65.27,
        ag_grade_gpt=3352.0
    )
    # Manually setting dry weight as it seems to be a specific input or derived elsewhere in the sheet
    conc.dry_weight_ton = 6.899896 
    # We need to trigger metal calc manually if we bypass calculate_metrics's wet->dry logic, 
    # or just set wet=dry and moisture=0
    conc.wet_weight_ton = 6.899896
    conc.moisture_pct = 0.0
    
    # 3. Create Entry and Calculate
    entry = WorkshopShiftEntry(
        shift_name="乙班",
        raw_ore=raw,
        concentrate=conc
    )
    
    entry.calculate_performance()
    
    print(entry)
    
    print("\n--- Validation against Excel Values ---")
    print(f"Excel Raw Dry: 124.16   | Calc: {entry.raw_ore.dry_weight_ton:.2f}")
    print(f"Excel Raw Pb:  4.656    | Calc: {entry.raw_ore.metal_content.pb_ton:.4f}")
    print(f"Excel Raw Ag:  19.98976 | Calc: {entry.raw_ore.metal_content.ag_kg:.5f}")
    print(f"Excel Conc Pb: 4.503562 | Calc: {entry.concentrate.metal_content.pb_ton:.6f}")
    print(f"Excel Pb Rec:  96.73%   | Calc: {entry.performance.recovery_pb_pct:.2f}%")
