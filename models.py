from dataclasses import dataclass
from typing import Optional

@dataclass
class OreMetrics:
    """Represents ore quality metrics for a specific stage (e.g., Raw Ore, Concentrate)."""
    pb_grade: Optional[float] = None  # 铅 (%)
    zn_grade: Optional[float] = None  # 锌 (%)
    ag_grade: Optional[float] = None  # 银 (g/T)

@dataclass
class ShiftProductionData:
    """Represents the production data for a single shift (e.g., 乙班)."""
    shift_name: str
    
    # Quality Metrics (左侧数据)
    raw_ore: OreMetrics           # 原矿
    lead_concentrate: OreMetrics  # 铅精
    tailings: OreMetrics          # 尾矿
    
    # Operational Metrics (右侧数据)
    run_time_hours: float         # 运转时间 (小时)
    processing_volume_tons: float # 处理量 (吨)
    moisture_content: float       # 水分 (%)
    
    @property
    def processing_rate_per_hour(self) -> float:
        """Calculates processing rate (tons/hour)."""
        if self.run_time_hours > 0:
            return round(self.processing_volume_tons / self.run_time_hours, 2)
        return 0.0

    def __repr__(self):
        return (
            f"Shift: {self.shift_name}\n"
            f"  [Raw Ore]  Pb: {self.raw_ore.pb_grade}%, Ag: {self.raw_ore.ag_grade}g/T\n"
            f"  [Lead Con] Pb: {self.lead_concentrate.pb_grade}%, Ag: {self.lead_concentrate.ag_grade}g/T\n"
            f"  [Tailings] Pb: {self.tailings.pb_grade}%, Ag: {self.tailings.ag_grade}g/T\n"
            f"  [Ops]      Time: {self.run_time_hours}h, Vol: {self.processing_volume_tons}t, "
            f"Rate: {self.processing_rate_per_hour}t/h, H2O: {self.moisture_content}%"
        )

# Example usage based on user's data
if __name__ == "__main__":
    # Create data for 乙班 based on the provided values
    shift_b = ShiftProductionData(
        shift_name="乙班",
        raw_ore=OreMetrics(pb_grade=3.75, ag_grade=161),
        lead_concentrate=OreMetrics(pb_grade=65.27, ag_grade=3352),
        tailings=OreMetrics(pb_grade=0.13, ag_grade=8),
        run_time_hours=8.0,
        processing_volume_tons=128.0,
        moisture_content=3.0
    )
    
    print("Created Data Structure Instance:")
    print("-" * 30)
    print(shift_b)
