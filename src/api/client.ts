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

export interface AnalysisStats {
  totalProcessed: number;
  avgPbRecovery: number;
  avgAgRecovery: number;
  avgYield: number;
  totalReports: number;
}

export interface TrendData {
  date: string;
  rawPb: number;
  rawAg: number;
  concPb: number;
  concAg: number;
  tailPb: number;
  tailAg: number;
  pbRecovery: number;
  agRecovery: number;
  processedWeight: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';
const TOKEN_KEY = 'cf_mineral_token';

function getAuthHeaders(): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export const apiClient = {
  async getCaptcha(): Promise<{ captchaId: string; svg: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/captcha`);
    if (!response.ok) throw new Error('获取验证码失败');
    return response.json();
  },

  async login(username: string, password: string, captchaId: string, captchaValue: string) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, captchaId, captchaValue }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || '登录失败');
    }
    return response.json();
  },

  async logout() {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async createReport(data: ShiftReportInput) {
    const response = await fetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create report');
    }
    
    return response.json();
  },

  async getReports(
    page = 1,
    limit = 20,
    filters?: { startDate?: string; endDate?: string; shiftType?: string }
  ) {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('limit', String(limit));
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const st = filters?.shiftType?.trim();
    if (st) params.append('shiftType', st);
    const response = await fetch(`${API_BASE_URL}/reports?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch reports');
    }
    return response.json();
  },

  async getAnalysisStats(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await fetch(`${API_BASE_URL}/analysis/stats?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch analysis stats');
    return response.json();
  },

  async getAnalysisTrends(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await fetch(`${API_BASE_URL}/analysis/trends?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch analysis trends');
    return response.json();
  },

  async getAnalysisShifts(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await fetch(`${API_BASE_URL}/analysis/shifts?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch shift stats');
    return response.json();
  },

  async getDailyStats(date: string) {
    const response = await fetch(`${API_BASE_URL}/reports/daily-stats?date=${date}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch daily stats');
    return response.json();
  },

  async getMonthlyStats(year: number, month: number) {
    const response = await fetch(`${API_BASE_URL}/reports/monthly-stats?year=${year}&month=${month}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch monthly stats');
    return response.json();
  },

  async parseTestReport(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(`${API_BASE_URL}/parse-test-report`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!response.ok) {
      let errorMessage = '文件解析失败';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch {
        // 如果响应不是 JSON，使用状态码判断
        if (response.status === 401) {
          errorMessage = '未登录或登录已过期，请重新登录';
        } else if (response.status === 400) {
          errorMessage = '请上传有效的 Excel 文件';
        } else if (response.status === 413) {
          errorMessage = '文件过大，请上传小于 10MB 的文件';
        } else {
          errorMessage = `上传失败 (${response.status})`;
        }
      }
      throw new Error(errorMessage);
    }
    
    return response.json();
  }
};

export interface DailyReportStats {
    wet: number;
    dry: number;
    moisture: number;
    pbGrade: number;
    pbMetal: number;
    agGrade: number;
    agMetal: number;
}

export interface DailyReportData {
    day: { raw: DailyReportStats, conc: DailyReportStats, tail: DailyReportStats };
    month: { raw: DailyReportStats, conc: DailyReportStats, tail: DailyReportStats };
    year: { raw: DailyReportStats, conc: DailyReportStats, tail: DailyReportStats };
}

export interface MonthlyReportData {
    daily: { date: string; data: { raw: DailyReportStats, conc: DailyReportStats, tail: DailyReportStats } }[];
    total: { raw: DailyReportStats, conc: DailyReportStats, tail: DailyReportStats };
}

export interface ShiftStats {
  shiftType: string;
  pbRecovery: number;
  agRecovery: number;
  yield: number;
  avgProcessed: number;
  totalProcessed: number;
  count: number;
}
