import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Search, RotateCcw, Trash2, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { DatePicker } from '../components/ui/DatePicker';

const SHIFT_OPTIONS = [
  { value: '', label: '全部班组' },
  { value: '甲班', label: '甲班' },
  { value: '乙班', label: '乙班' },
  { value: '丙班', label: '丙班' },
];

export const MetalBalance: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; date: string; shift: string } | null>(null);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [shiftType, setShiftType] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{ startDate?: string; endDate?: string; shiftType: string }>({
    shiftType: '',
  });

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const filters = {
          startDate: appliedFilters.startDate || undefined,
          endDate: appliedFilters.endDate || undefined,
          shiftType: appliedFilters.shiftType || undefined,
        };
        const response = await apiClient.getReports(page, 20, filters);
        setReports(response.data);
        setTotalPages(response.meta.totalPages);
        setExpandedRows(new Set());
      } catch (err: any) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [page, appliedFilters]);

  const handleSearch = () => {
    setAppliedFilters({
      startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
      endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
      shiftType,
    });
    setPage(1);
  };

  const handleReset = () => {
    setStartDate(null);
    setEndDate(null);
    setShiftType('');
    setAppliedFilters({ shiftType: '' });
    setPage(1);
  };

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedRows(newSet);
  };

  const toggleAll = () => {
    if (expandedRows.size === reports.length) {
        setExpandedRows(new Set());
    } else {
        setExpandedRows(new Set(reports.map(r => r.id)));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await apiClient.deleteReport(id);
      // Refresh the list
      const filters = {
        startDate: appliedFilters.startDate || undefined,
        endDate: appliedFilters.endDate || undefined,
        shiftType: appliedFilters.shiftType || undefined,
      };
      // If current page has only 1 item and we're not on page 1, go to previous page
      const targetPage = reports.length === 1 && page > 1 ? page - 1 : page;
      const response = await apiClient.getReports(targetPage, 20, filters);
      setReports(response.data);
      setTotalPages(response.meta.totalPages);
      if (targetPage !== page) {
        setPage(targetPage);
      }
      setDeleteConfirm(null);
      setError(null);
      // Remove from expanded rows if it was expanded
      const newExpanded = new Set(expandedRows);
      newExpanded.delete(id);
      setExpandedRows(newExpanded);
    } catch (err: any) {
      setError(err.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && page === 1) return <div className="p-8 text-center text-slate-500">加载中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">错误: {error}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-slate-900">金属平衡表</h1>
        <button 
            onClick={toggleAll}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
            {expandedRows.size === reports.length ? '全部收起' : '全部展开'}
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
            <DatePicker date={startDate} onChange={setStartDate} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
            <DatePicker date={endDate} onChange={setEndDate} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">班组</label>
            <select
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-[100px]"
            >
              {SHIFT_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
          >
            <Search className="w-4 h-4 mr-1.5" />
            查询
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            重置
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10">
                    <button onClick={toggleAll} className="focus:outline-none">
                        {expandedRows.size === reports.length ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">日期/班次</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">处理量湿量 (吨)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">水分 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">原矿干量 (吨)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">铅精矿干量 (吨)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">铅精矿湿量 (吨)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">铅精矿水分 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">铜铅锌回收率 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">银回收率 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">产率 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">富集比</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-20">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {reports.map((report) => {
                const isExpanded = expandedRows.has(report.id);
                const mb = report.metalBalance;
                const raw = report.rawOreData;
                const conc = report.concentrateData;
                const tail = report.tailingsData;

                // Calculate Metrics on the fly for display
                const calcMetal = (weight: number, grade: number, unit: 'percent' | 'gt') => {
                    if (!weight || !grade) return 0;
                    return unit === 'percent' ? weight * (grade / 100) : (weight * grade) / 1000; // Tons vs Kg
                };

                const rawPbMetal = calcMetal(Number(mb?.dryWeightRaw), Number(raw?.pbGrade), 'percent');
                const concPbMetal = calcMetal(Number(mb?.dryWeightConcentrate), Number(conc?.pbGrade), 'percent');
                const tailPbMetal = rawPbMetal - concPbMetal;

                const rawZnMetal = calcMetal(Number(mb?.dryWeightRaw), Number(raw?.znGrade), 'percent');
                const concZnMetal = calcMetal(Number(mb?.dryWeightConcentrate), Number(conc?.znGrade), 'percent');
                const tailZnMetal = rawZnMetal - concZnMetal;

                const rawAgMetal = calcMetal(Number(mb?.dryWeightRaw), Number(raw?.agGrade), 'gt');
                const concAgMetal = calcMetal(Number(mb?.dryWeightConcentrate), Number(conc?.agGrade), 'gt');
                const tailAgMetal = rawAgMetal - concAgMetal;
                
                const enrichment = Number(conc?.pbGrade) / Number(raw?.pbGrade || 1);

                const dryConc = Number(mb?.dryWeightConcentrate);
                const moistureConc = Number(conc?.moisture ?? 0);
                const denom = 100 - moistureConc;
                const wetConc = denom > 0 && denom < 100 ? (dryConc / denom) * 100 : 0;

                // 判断银回收率，用于高亮显示
                // >98%: 红色背景，<90%: 黄色背景
                const agRecovery = Number(mb?.agRecovery || 0);
                const isHighAgRecovery = agRecovery > 98;
                const isLowAgRecovery = agRecovery < 90;
                
                let rowBgClass = 'hover:bg-slate-50';
                if (isHighAgRecovery) {
                  rowBgClass = 'bg-red-50 hover:bg-red-100';
                } else if (isLowAgRecovery) {
                  rowBgClass = 'bg-yellow-50 hover:bg-yellow-100';
                }

                return (
                  <React.Fragment key={report.id}>
                    <tr className={`cursor-pointer ${rowBgClass}`} onClick={() => toggleRow(report.id)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {format(new Date(report.shiftDate), 'yyyy-MM-dd')} {report.shiftType}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                        {Number(raw?.wetWeight).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                        {Number(raw?.moisture).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                        {Number(mb?.dryWeightRaw).toFixed(2)}
                      </td>
                       <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                        {Number(mb?.dryWeightConcentrate).toFixed(4)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                        {wetConc > 0 ? wetConc.toFixed(2) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                        {conc?.moisture != null ? Number(conc.moisture).toFixed(2) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium text-right">
                        {Number(mb?.pbRecovery).toFixed(2)}%
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                        isHighAgRecovery ? 'text-red-700 font-bold' : 
                        isLowAgRecovery ? 'text-yellow-700 font-bold' : 
                        'text-slate-900'
                      }`}>
                        {Number(mb?.agRecovery).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium text-right">
                        {Number(mb?.concentrateYield).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium text-right">
                        {enrichment.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({
                              id: report.id,
                              date: format(new Date(report.shiftDate), 'yyyy-MM-dd'),
                              shift: report.shiftType,
                            });
                          }}
                          disabled={deletingId === report.id}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="删除此条记录"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={isHighAgRecovery ? 'bg-red-50' : isLowAgRecovery ? 'bg-yellow-50' : 'bg-slate-50'}>
                        <td colSpan={13} className="px-6 py-4">
                          <div className="text-sm">
                            <h4 className="font-semibold mb-2 text-slate-700">详细平衡表 (Sheet 2)</h4>
                            <table className="min-w-full divide-y divide-slate-300 border border-slate-200">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-slate-500 border border-slate-200">种别</th>
                                  <th rowSpan={2} className="px-3 py-2 text-right text-xs font-medium text-slate-500 border border-slate-200">干量 (t)</th>
                                  <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-slate-500 border border-slate-200">分布率</th>
                                  <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-slate-500 border border-slate-200">金属量</th>
                                </tr>
                                <tr>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 border border-slate-200">铅 (%)</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 border border-slate-200">锌 (%)</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 border border-slate-200">银 (g/t)</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 border border-slate-200">铅 (T)</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 border border-slate-200">锌 (T)</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 border border-slate-200">银 (Kg)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 bg-white">
                                <tr>
                                  <td className="px-3 py-2 font-medium border border-slate-200">原矿</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(mb?.dryWeightRaw).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(raw?.pbGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(raw?.znGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(raw?.agGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{rawPbMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{rawZnMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{rawAgMetal.toFixed(4)}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 font-medium border border-slate-200">铅精矿</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(mb?.dryWeightConcentrate).toFixed(4)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(conc?.pbGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(conc?.znGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(conc?.agGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{concPbMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{concZnMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{concAgMetal.toFixed(4)}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 font-medium border border-slate-200">尾矿</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(mb?.dryWeightTailings).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(tail?.pbGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(tail?.znGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(tail?.agGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{tailPbMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{tailZnMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{tailAgMetal.toFixed(4)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              上一页
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              下一页
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-700">
                第 <span className="font-medium">{page}</span> 页，共 <span className="font-medium">{totalPages}</span> 页
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <span className="sr-only">上一页</span>
                  <ChevronDown className="h-5 w-5 rotate-90" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <span className="sr-only">下一页</span>
                  <ChevronRight className="h-5 w-5" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <AlertCircle className="w-6 h-6 text-red-600 mr-3" />
                <h3 className="text-lg font-semibold text-slate-900">确认删除</h3>
              </div>
              <p className="text-slate-600 mb-6">
                确定要删除 <span className="font-medium text-slate-900">{deleteConfirm.date} {deleteConfirm.shift}</span> 的记录吗？
                <br />
                <span className="text-sm text-slate-500">此操作不可恢复，将同时删除该记录的所有相关数据。</span>
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deletingId === deleteConfirm.id}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.id)}
                  disabled={deletingId === deleteConfirm.id}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 flex items-center"
                >
                  {deletingId === deleteConfirm.id ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      删除中...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      确认删除
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
