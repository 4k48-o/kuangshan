
import React, { useEffect, useState } from 'react';
import { apiClient, DailyReportData } from '../api/client';
import { format, addDays, subDays } from 'date-fns';
import { Calendar, Printer, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { DatePicker } from '../components/ui/DatePicker';

export const DailyReport: React.FC = () => {
  // Default to today. User can switch easily.
  const [date, setDate] = useState<Date>(new Date());
  const [data, setData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Manual Inputs State
  const [inputs, setInputs] = useState({
    monthPlanRaw: '',
    monthPlanConc: '',
    stockRaw: '',
    stockConc: '',
    salesConc: '',
    remarks: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await apiClient.getDailyStats(dateStr);
      setData(res);
    } catch (err) {
      console.error(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [date]);

  const handlePrevDay = () => setDate(d => subDays(d, 1));
  const handleNextDay = () => setDate(d => addDays(d, 1));

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="p-8 text-center">加载中...</div>;
  
  // Helper to render cell
  const Cell = ({ value, yellow = false, bold = false }: { value?: string | number, yellow?: boolean, bold?: boolean }) => (
    <td className={`border border-black px-2 py-1 text-center text-sm ${yellow ? 'bg-yellow-200' : ''} ${bold ? 'font-bold' : ''}`}>
      {value}
    </td>
  );

  const InputCell = ({ field, placeholder }: { field: keyof typeof inputs, placeholder?: string }) => (
    <td className="border border-black px-1 py-1 text-center">
      <input 
        value={inputs[field]}
        onChange={e => setInputs({...inputs, [field]: e.target.value})}
        className="w-full h-full text-center bg-transparent focus:outline-none"
        placeholder={placeholder}
      />
    </td>
  );

  return (
    <div className="p-6 bg-slate-50 min-h-screen print:bg-white print:p-0">
      <div className="max-w-[210mm] mx-auto bg-white p-8 shadow-lg print:shadow-none print:p-4">
        
        {/* Controls (Hidden on Print) */}
        <div className="mb-6 flex justify-between items-center print:hidden bg-slate-100 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-700">报表日期:</span>
            <button onClick={handlePrevDay} className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <DatePicker date={date} onChange={setDate} />
            <button onClick={handleNextDay} className="p-1 hover:bg-white rounded border border-transparent hover:border-slate-300">
                <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
            <button 
              onClick={fetchData}
              className="ml-2 px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center font-medium"
            >
              <Calendar className="w-4 h-4 mr-2" /> 查询
            </button>
          </div>
          <button 
            onClick={handlePrint}
            className="px-4 py-1.5 bg-slate-800 text-white rounded hover:bg-slate-900 flex items-center font-medium shadow-sm"
          >
            <Printer className="w-4 h-4 mr-2" /> 打印日报
          </button>
        </div>

        {/* Content Check */}
        {!data ? (
            <div className="p-8 text-center text-red-500 border border-dashed border-red-300 rounded bg-red-50">
                暂无 {format(date, 'yyyy-MM-dd')} 的生产数据，请尝试选择其他日期（如 2026-02-01）
            </div>
        ) : (
            <>
            {/* Report Header */}
            <div className="text-center mb-6">
            <h1 className="text-2xl font-serif font-bold mb-2">选矿厂生产综合统计日报表</h1>
            <div className="text-red-600 font-medium mb-4">{format(date, 'yyyy年MM月dd日')}</div>
            
            <div className="flex justify-between text-sm font-medium">
                <div>填报单位: 选矿厂</div>
                <div>填报时间: {format(new Date(), 'yyyy年MM月dd日')}</div>
            </div>
            </div>

            {/* Main Table */}
            <table className="w-full border-collapse border border-black">
            <thead>
                <tr className="bg-gray-100">
                <th className="border border-black px-2 py-1 w-12">序号</th>
                <th className="border border-black px-2 py-1 w-32">名 称</th>
                <th className="border border-black px-2 py-1 w-16">单位</th>
                <th className="border border-black px-2 py-1">月计划</th>
                <th className="border border-black px-2 py-1">本日累计</th>
                <th className="border border-black px-2 py-1">本月累计</th>
                <th className="border border-black px-2 py-1">本年累计</th>
                <th className="border border-black px-2 py-1 w-20">备注</th>
                </tr>
            </thead>
            <tbody>
                {/* 1. Input Ore */}
                <tr>
                <Cell value="1" />
                <Cell value="入厂矿石" bold />
                <Cell value="吨" />
                <InputCell field="monthPlanRaw" />
                <td className="border border-black bg-gray-50"></td>
                <td className="border border-black bg-gray-50"></td>
                <td className="border border-black bg-yellow-200"></td>
                <td className="border border-black"></td>
                </tr>

                {/* 2. Stock Raw */}
                <tr>
                <Cell value="2" />
                <Cell value="库存原矿量" bold />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black bg-yellow-200">
                    <input value={inputs.stockRaw} onChange={e=>setInputs({...inputs, stockRaw: e.target.value})} className="w-full bg-transparent text-center"/>
                </td>
                <td className="border border-black"></td>
                </tr>

                {/* 3. Raw Ore Processed */}
                <tr>
                <Cell value="3" />
                <Cell value="入选原矿" bold />
                <td colSpan={6} className="border border-black bg-gray-100"></td>
                </tr>
                {/* 3.1 Wet/Dry/Moisture */}
                <tr>
                <Cell value="3.1" />
                <Cell value="湿重" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.raw.wet.toFixed(2)} />
                <Cell value={data?.month.raw.wet.toFixed(2)} />
                <Cell value={data?.year.raw.wet.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="干重" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.raw.dry.toFixed(2)} />
                <Cell value={data?.month.raw.dry.toFixed(2)} />
                <Cell value={data?.year.raw.dry.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="水分" />
                <Cell value="%" />
                <td className="border border-black"></td>
                <Cell value={data?.day.raw.moisture.toFixed(2)} yellow />
                <Cell value={data?.month.raw.moisture.toFixed(2)} yellow />
                <Cell value={data?.year.raw.moisture.toFixed(2)} yellow />
                <td className="border border-black"></td>
                </tr>
                
                {/* 3.2 Pb */}
                <tr>
                <Cell value="3.2" />
                <Cell value="铅品位" />
                <Cell value="%" />
                <td className="border border-black"></td>
                <Cell value={data?.day.raw.pbGrade.toFixed(2)} />
                <Cell value={data?.month.raw.pbGrade.toFixed(2)} />
                <Cell value={data?.year.raw.pbGrade.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="铅金属量" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.raw.pbMetal.toFixed(3)} />
                <Cell value={data?.month.raw.pbMetal.toFixed(3)} />
                <Cell value={data?.year.raw.pbMetal.toFixed(3)} />
                <td className="border border-black"></td>
                </tr>

                {/* 3.3 Ag */}
                <tr>
                <Cell value="3.3" />
                <Cell value="银品位" />
                <Cell value="克/吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.raw.agGrade.toFixed(2)} />
                <Cell value={data?.month.raw.agGrade.toFixed(2)} />
                <Cell value={data?.year.raw.agGrade.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="银金属量" />
                <Cell value="公斤" />
                <td className="border border-black"></td>
                <Cell value={data?.day.raw.agMetal.toFixed(4)} />
                <Cell value={data?.month.raw.agMetal.toFixed(4)} />
                <Cell value={data?.year.raw.agMetal.toFixed(4)} />
                <td className="border border-black"></td>
                </tr>

                {/* 4. Products */}
                <tr>
                <Cell value="4" />
                <Cell value="产出产品" bold />
                <td colSpan={6} className="border border-black bg-gray-100"></td>
                </tr>
                <tr>
                <Cell value="4.1" />
                <Cell value="铅精矿" bold />
                <td colSpan={6} className="border border-black bg-gray-50"></td>
                </tr>
                
                {/* 4.1.1 Wet/Dry/Moisture */}
                <tr>
                <Cell value="4.1.1" />
                <Cell value="湿重" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.conc.wet.toFixed(2)} />
                <Cell value={data?.month.conc.wet.toFixed(2)} />
                <Cell value={data?.year.conc.wet.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="干重" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.conc.dry.toFixed(2)} />
                <Cell value={data?.month.conc.dry.toFixed(2)} />
                <Cell value={data?.year.conc.dry.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="水分" />
                <Cell value="%" />
                <td className="border border-black"></td>
                <Cell value={data?.day.conc.moisture.toFixed(2)} yellow />
                <Cell value={data?.month.conc.moisture.toFixed(2)} yellow />
                <Cell value={data?.year.conc.moisture.toFixed(2)} yellow />
                <td className="border border-black"></td>
                </tr>

                {/* 4.1.2 Pb */}
                <tr>
                <Cell value="4.1.2" />
                <Cell value="铅品位" />
                <Cell value="%" />
                <td className="border border-black"></td>
                <Cell value={data?.day.conc.pbGrade.toFixed(2)} />
                <Cell value={data?.month.conc.pbGrade.toFixed(2)} />
                <Cell value={data?.year.conc.pbGrade.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="铅金属量" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.conc.pbMetal.toFixed(3)} />
                <Cell value={data?.month.conc.pbMetal.toFixed(3)} />
                <Cell value={data?.year.conc.pbMetal.toFixed(3)} />
                <td className="border border-black"></td>
                </tr>

                {/* 4.1.3 Ag */}
                <tr>
                <Cell value="4.1.3" />
                <Cell value="银品位" />
                <Cell value="克/吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.conc.agGrade.toFixed(2)} />
                <Cell value={data?.month.conc.agGrade.toFixed(2)} />
                <Cell value={data?.year.conc.agGrade.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="银金属量" />
                <Cell value="公斤" />
                <td className="border border-black"></td>
                <Cell value={data?.day.conc.agMetal.toFixed(4)} />
                <Cell value={data?.month.conc.agMetal.toFixed(4)} />
                <Cell value={data?.year.conc.agMetal.toFixed(4)} />
                <td className="border border-black"></td>
                </tr>

                {/* 5. Tailings */}
                <tr>
                <Cell value="5" />
                <Cell value="尾矿" bold />
                <td colSpan={6} className="border border-black bg-gray-50"></td>
                </tr>
                <tr>
                <Cell value="5.1" />
                <Cell value="干重" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.tail.dry.toFixed(2)} />
                <Cell value={data?.month.tail.dry.toFixed(2)} />
                <Cell value={data?.year.tail.dry.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="5.2" />
                <Cell value="铅品位" />
                <Cell value="%" />
                <td className="border border-black"></td>
                <Cell value={data?.day.tail.pbGrade.toFixed(2)} />
                <Cell value={data?.month.tail.pbGrade.toFixed(2)} />
                <Cell value={data?.year.tail.pbGrade.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="铅金属量" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.tail.pbMetal.toFixed(3)} />
                <Cell value={data?.month.tail.pbMetal.toFixed(3)} />
                <Cell value={data?.year.tail.pbMetal.toFixed(3)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="5.3" />
                <Cell value="银品位" />
                <Cell value="克/吨" />
                <td className="border border-black"></td>
                <Cell value={data?.day.tail.agGrade.toFixed(2)} />
                <Cell value={data?.month.tail.agGrade.toFixed(2)} />
                <Cell value={data?.year.tail.agGrade.toFixed(2)} />
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="" />
                <Cell value="银金属量" />
                <Cell value="公斤" />
                <td className="border border-black"></td>
                <Cell value={data?.day.tail.agMetal.toFixed(4)} />
                <Cell value={data?.month.tail.agMetal.toFixed(4)} />
                <Cell value={data?.year.tail.agMetal.toFixed(4)} />
                <td className="border border-black"></td>
                </tr>

                {/* 6. Sales */}
                <tr>
                <Cell value="6" />
                <Cell value="精矿销售" bold />
                <td colSpan={6} className="border border-black bg-gray-50"></td>
                </tr>
                <tr>
                <Cell value="6.1" />
                <Cell value="销售铅精(湿重)" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <InputCell field="salesConc" />
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                </tr>

                {/* 7. Stock Conc */}
                <tr>
                <Cell value="7" />
                <Cell value="库存精矿量" bold />
                <td colSpan={6} className="border border-black bg-gray-50"></td>
                </tr>
                <tr>
                <Cell value="7.1" />
                <Cell value="精矿(湿重)" />
                <Cell value="吨" />
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black bg-yellow-200">
                    <input value={inputs.stockConc} onChange={e=>setInputs({...inputs, stockConc: e.target.value})} className="w-full bg-transparent text-center"/>
                </td>
                <td className="border border-black"></td>
                </tr>

                {/* 8. Production Status */}
                <tr>
                <Cell value="8" />
                <Cell value="当日生产状况" bold />
                <td colSpan={6} className="border border-black bg-gray-50"></td>
                </tr>
                <tr>
                <Cell value="8.1" />
                <Cell value="生产设备状况" />
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                </tr>
                <tr>
                <Cell value="8.2" />
                <Cell value="生产状况" />
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black"></td>
                <td className="border border-black bg-yellow-200"></td>
                <td className="border border-black"></td>
                </tr>

                {/* 9. Others */}
                <tr>
                <Cell value="9" />
                <Cell value="其它" bold />
                <td colSpan={6} className="border border-black">
                    <input value={inputs.remarks} onChange={e=>setInputs({...inputs, remarks: e.target.value})} className="w-full bg-transparent"/>
                </td>
                </tr>

            </tbody>
            </table>
            </>
        )}
      </div>
    </div>
  );
};
