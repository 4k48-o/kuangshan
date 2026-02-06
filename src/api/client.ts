export interface OreMetrics {
  wetWeight: number;
  moisture: number;
  fineness?: number;
  pbGrade: number;
  znGrade: number;
  agGrade: number;
}

export interface ShiftReportInput {
  shiftDate: string; // YYYY-MM-DD
  shiftType: string; // '早班' | '中班' | '晚班'
  runTime: number; // 作业时间
  rawOre: OreMetrics;
  concentrate: OreMetrics;
  tailings?: OreMetrics;
}

const API_BASE_URL = 'http://localhost:3000/api';

export const apiClient = {
  async createReport(data: ShiftReportInput) {
    const response = await fetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create report');
    }
    
    return response.json();
  },

  async getReports() {
    const response = await fetch(`${API_BASE_URL}/reports`);
    if (!response.ok) {
      throw new Error('Failed to fetch reports');
    }
    return response.json();
  }
};
