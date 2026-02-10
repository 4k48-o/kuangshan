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

  async deleteReport(id: string) {
    const response = await fetch(`${API_BASE_URL}/reports/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '删除失败');
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

  async getMetalBalanceSummary(startDate?: string, endDate?: string, groupBy?: 'day' | 'tenDay' | 'month', shiftType?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (groupBy) params.append('groupBy', groupBy);
    if (shiftType) params.append('shiftType', shiftType);
    const response = await fetch(`${API_BASE_URL}/analysis/metal-balance/summary?${params.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('获取金属平衡汇总失败');
    return response.json();
  },

  async getMetalBalanceTrends(startDate?: string, endDate?: string, shiftType?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (shiftType) params.append('shiftType', shiftType);
    const response = await fetch(`${API_BASE_URL}/analysis/metal-balance/trends?${params.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('获取金属平衡趋势失败');
    return response.json();
  },

  async getMetalBalanceShifts(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const response = await fetch(`${API_BASE_URL}/analysis/metal-balance/shifts?${params.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('获取金属平衡班次对比失败');
    return response.json();
  },

  async getMetalBalanceDistribution(startDate?: string, endDate?: string, groupBy?: 'day' | 'month') {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (groupBy) params.append('groupBy', groupBy);
    const response = await fetch(`${API_BASE_URL}/analysis/metal-balance/distribution?${params.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('获取金属分布失败');
    return response.json();
  },

  async getMetalBalanceStability(startDate?: string, endDate?: string, targetPb?: number, targetAg?: number) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (targetPb != null) params.append('targetPb', String(targetPb));
    if (targetAg != null) params.append('targetAg', String(targetAg));
    const response = await fetch(`${API_BASE_URL}/analysis/metal-balance/stability?${params.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('获取稳定性数据失败');
    return response.json();
  },

  async getMetalBalancePeriodCompare(baseDate?: string, period?: 'month' | 'year', compareType?: 'month_over_month' | 'year_over_year') {
    const params = new URLSearchParams();
    if (baseDate) params.append('baseDate', baseDate);
    if (period) params.append('period', period);
    if (compareType) params.append('compareType', compareType);
    const response = await fetch(`${API_BASE_URL}/analysis/metal-balance/period-compare?${params.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('获取同比环比失败');
    return response.json();
  },

  async downloadMetalBalanceExport(startDate: string, endDate: string, groupBy?: 'day' | 'tenDay' | 'month') {
    const params = new URLSearchParams({ startDate, endDate });
    if (groupBy) params.append('groupBy', groupBy);
    const response = await fetch(`${API_BASE_URL}/analysis/metal-balance/export?${params.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('导出失败');
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition');
    const match = disposition?.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1] : `metal_balance_${startDate}_${endDate}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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

  async getYearlyStats(year: number) {
    const response = await fetch(`${API_BASE_URL}/reports/yearly-stats?year=${year}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch yearly stats');
    return response.json();
  },

  async uploadWeighingExcel(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/weighing/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || '上传失败');
    }
    return response.json();
  },

  async getWeighingRecords(params: { date?: string; startDate?: string; endDate?: string; vehicleNo?: string; page?: number; limit?: number }) {
    const search = new URLSearchParams();
    if (params.date) search.append('date', params.date);
    if (params.startDate) search.append('startDate', params.startDate);
    if (params.endDate) search.append('endDate', params.endDate);
    if (params.vehicleNo) search.append('vehicleNo', params.vehicleNo);
    if (params.page != null) search.append('page', String(params.page));
    if (params.limit != null) search.append('limit', String(params.limit));
    const response = await fetch(`${API_BASE_URL}/weighing/records?${search.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('查询称重记录失败');
    return response.json();
  },

  async deleteWeighingRecords(params: { all?: boolean; date?: string; startDate?: string; endDate?: string }) {
    const search = new URLSearchParams();
    if (params.all) search.append('all', '1');
    if (params.date) search.append('date', params.date);
    if (params.startDate) search.append('startDate', params.startDate);
    if (params.endDate) search.append('endDate', params.endDate);
    const response = await fetch(`${API_BASE_URL}/weighing/records?${search.toString()}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any).error || '删除失败');
    }
    return response.json();
  },

  async getWeighingSummary(params?: {
    startDate?: string;
    endDate?: string;
    vehicleNo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: { date: string; grossWeight: number; tareWeight: number; netWeight: number; count: number }[]; total: number; page: number; pageSize: number }> {
    const search = new URLSearchParams();
    if (params?.startDate) search.append('startDate', params.startDate);
    if (params?.endDate) search.append('endDate', params.endDate);
    if (params?.vehicleNo) search.append('vehicleNo', params.vehicleNo);
    if (params?.page != null) search.append('page', String(params.page));
    if (params?.pageSize != null) search.append('pageSize', String(params.pageSize));
    const response = await fetch(`${API_BASE_URL}/weighing/records/summary?${search.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      let msg = '查询称重汇总失败';
      try {
        const body = await response.json();
        if (response.status === 401) msg = body.error || '未登录或登录已过期';
        else if (body?.error) msg = body.error;
      } catch (_) {}
      throw new Error(msg);
    }
    return response.json();
  },

  async getWeighingMonthlyReport(params: { year: number; month: number }): Promise<{
    year: number;
    month: number;
    startDate: string;
    endDate: string;
    data: { vehicleNo: string; count: number; grossWeight: number; tareWeight: number; netWeight: number }[];
  }> {
    const search = new URLSearchParams();
    search.append('year', String(params.year));
    search.append('month', String(params.month));
    const response = await fetch(`${API_BASE_URL}/weighing/monthly-report?${search.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '查询称重月报失败');
    }
    return response.json();
  },

  // 客户表 CRUD
  async getCustomers(): Promise<{ id: string; name: string; contact: string; phone: string; code: string; createdAt: string; updatedAt: string }[]> {
    const response = await fetch(`${API_BASE_URL}/customers`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '查询客户列表失败');
    }
    return response.json();
  },

  async createCustomer(data: { name: string; contact?: string; phone?: string; code: string }) {
    const response = await fetch(`${API_BASE_URL}/customers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '新增客户失败');
    }
    return response.json();
  },

  async updateCustomer(id: string, data: { name: string; contact?: string; phone?: string; code: string }) {
    const response = await fetch(`${API_BASE_URL}/customers/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '更新客户失败');
    }
    return response.json();
  },

  async deleteCustomer(id: string) {
    const response = await fetch(`${API_BASE_URL}/customers/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '删除客户失败');
    }
    return response.json();
  },

  // 精矿销售 - 出厂化验单
  async uploadSalesAssay(file: File): Promise<{ success: boolean; id: string; reportDate: string; productName: string; customerName: string; vehicleCount: number; detailCount: number; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/sales-assay/upload`, { method: 'POST', headers, body: formData });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '上传失败');
    }
    return response.json();
  },

  async getSalesAssayReports(params?: {
    startDate?: string;
    endDate?: string;
    customerId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    list: Array<{
      id: string;
      reportDate: string;
      productName: string;
      customerName: string;
      vehicleCount: number;
      sourceFile: string;
      createdAt: string;
      wetWeightSum: number;
      moistureAvg: number;
      dryWeightSum: number;
      pbGradeAvg: number;
      znGradeAvg: number;
      cuGradeAvg: number;
      agGptAvg: number;
      pbMetalSum: number;
      znMetalSum: number;
      cuMetalSum: number;
      agKgSum: number;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const search = new URLSearchParams();
    if (params?.startDate) search.append('startDate', params.startDate);
    if (params?.endDate) search.append('endDate', params.endDate);
    if (params?.customerId) search.append('customerId', params.customerId);
    if (params?.page != null) search.append('page', String(params.page));
    if (params?.pageSize != null) search.append('pageSize', String(params.pageSize));
    const response = await fetch(`${API_BASE_URL}/sales-assay/reports?${search.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '查询列表失败');
    }
    return response.json();
  },

  async getSalesAssayReport(id: string): Promise<{
    id: string;
    reportDate: string;
    productName: string;
    customerName: string;
    vehicleCount: number;
    sourceFile: string;
    createdAt: string;
    details: Array<{
      id: string;
      seqNo: string | null;
      vehicleNo: string | null;
      customerCode: string | null;
      customerId: string | null;
      customer?: { id: string; name: string; code: string } | null;
      wetWeight: number | null;
      moisture: number | null;
      dryWeight: number | null;
      pbGrade: number | null;
      znGrade: number | null;
      cuGrade: number | null;
      agGpt: number | null;
      pbMetal: number | null;
      znMetal: number | null;
      cuMetal: number | null;
      agKg: number | null;
    }>;
  }> {
    const response = await fetch(`${API_BASE_URL}/sales-assay/reports/${id}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '查询详情失败');
    }
    return response.json();
  },

  async deleteSalesAssayReport(id: string) {
    const response = await fetch(`${API_BASE_URL}/sales-assay/reports/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '删除失败');
    }
    return response.json();
  },

  async getSalesAssayAnalysis(params?: { startDate?: string; endDate?: string }): Promise<{
    byTime: Array<{ period: string; reportCount: number; vehicleCount: number; dryWeightSum: number; pbMetalSum: number; znMetalSum: number; cuMetalSum: number; agKgSum: number }>;
    byCustomer: Array<{ customerId: string | null; customerName: string; customerCode: string; reportCount: number; vehicleCount: number; dryWeightSum: number; pbMetalSum: number; znMetalSum: number; cuMetalSum: number; agKgSum: number }>;
  }> {
    const search = new URLSearchParams();
    if (params?.startDate) search.append('startDate', params.startDate);
    if (params?.endDate) search.append('endDate', params.endDate);
    const response = await fetch(`${API_BASE_URL}/sales-assay/analysis?${search.toString()}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any)?.error || '查询销售分析失败');
    }
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

export interface YearlyReportData {
    monthly: { month: number; monthLabel: string; data: { raw: DailyReportStats; conc: DailyReportStats; tail: DailyReportStats } }[];
    total: { raw: DailyReportStats; conc: DailyReportStats; tail: DailyReportStats };
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

export interface MetalBalanceSummaryItem {
  period: string;
  date: string;
  dryWeightRaw: number;
  dryWeightConcentrate: number;
  dryWeightTailings: number;
  pbRecovery: number;
  agRecovery: number;
  znRecovery: number;
  concentrateYield: number;
  count: number;
  pbMetalRaw?: number;
  pbMetalConc?: number;
  agMetalRaw?: number;
  agMetalConc?: number;
  znMetalRaw?: number;
  znMetalConc?: number;
}

export interface MetalBalanceTrendItem {
  date: string;
  rawPb: number;
  rawAg: number;
  concPb: number;
  concAg: number;
  tailPb: number;
  tailAg: number;
  pbRecovery: number;
  agRecovery: number;
  znRecovery: number;
  processedWeight: number;
}

export interface MetalBalanceShiftStats {
  shiftType: string;
  pbRecovery: number;
  agRecovery: number;
  znRecovery: number;
  yield: number;
  avgProcessed: number;
  totalProcessed: number;
  count: number;
}

export interface MetalBalanceDistributionItem {
  period: string;
  pb: { raw: number; conc: number; tail: number; distConcPct: number; distTailPct: number };
  ag: { raw: number; conc: number; tail: number; distConcPct: number; distTailPct: number };
  zn: { raw: number; conc: number; tail: number; distConcPct: number; distTailPct: number };
}

export interface MetalBalanceStability {
  stdDevPb: number;
  stdDevAg: number;
  stdDevZn: number;
  passRatePb: number;
  passRateAg: number;
  passRateZn: number;
  dailyStats: { date: string; pbRecovery: number; agRecovery: number; znRecovery: number; passPb: boolean; passAg: boolean; passZn: boolean }[];
}

export interface MetalBalancePeriodCompare {
  current: { totalProcessed: number; avgPbRecovery: number; avgAgRecovery: number; avgZnRecovery: number; avgYield: number; count: number };
  previous: { totalProcessed: number; avgPbRecovery: number; avgAgRecovery: number; avgZnRecovery: number; avgYield: number; count: number };
  changes: { totalProcessedDelta: number; totalProcessedPct: number; avgPbRecoveryDelta: number; avgAgRecoveryDelta: number; avgZnRecoveryDelta: number; avgYieldDelta: number };
}
