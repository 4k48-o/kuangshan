import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { apiClient } from '../api/client';

export const MetalBalance: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const data = await apiClient.getReports();
        setReports(data);
      } catch (err: any) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">加载中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">错误: {error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">金属平衡表</h1>
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10"></th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">日期/班次</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">原矿湿量 (吨)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">水分 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">原矿干量 (吨)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">铅精矿干量 (吨)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">铜铅锌回收率 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">银回收率 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">产率 (%)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">富集比</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {reports.map((report) => {
                const isExpanded = expandedRow === report.id;
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

                return (
                  <React.Fragment key={report.id}>
                    <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleRow(report.id)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {format(new Date(report.shiftDate), 'MM-dd')} {report.shiftType}
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium text-right">
                        {Number(mb?.pbRecovery).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium text-right">
                        {Number(mb?.agRecovery).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium text-right">
                        {Number(mb?.concentrateYield).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium text-right">
                        {enrichment.toFixed(2)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="text-sm">
                            <h4 className="font-semibold mb-2 text-slate-700">详细平衡表 (Sheet 2)</h4>
                            <table className="min-w-full divide-y divide-slate-300 border border-slate-200">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-slate-500 border border-slate-200">种别</th>
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
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(raw?.pbGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(raw?.znGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(raw?.agGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{rawPbMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{rawZnMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{rawAgMetal.toFixed(4)}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 font-medium border border-slate-200">铅精矿</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(conc?.pbGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(conc?.znGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(conc?.agGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{concPbMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{concZnMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{concAgMetal.toFixed(4)}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 font-medium border border-slate-200">尾矿</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(tail?.pbGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(tail?.znGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{Number(tail?.agGrade).toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{tailPbMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{tailZnMetal.toFixed(3)}</td>
                                  <td className="px-3 py-2 text-right border border-slate-200">{tailAgMetal.toFixed(4)}</td>
                                </tr>
                              </tbody>
                            </table>
                            {/* Recovery and Fineness Note */}
                            <div className="mt-2 text-right text-xs text-slate-600">
                                <span className="font-semibold">尾矿细度:</span> {Number(tail?.fineness || 0).toFixed(2)}%
                            </div>
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
      </div>
    </div>
  );
};
