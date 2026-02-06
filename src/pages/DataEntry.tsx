import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { Save, AlertCircle } from 'lucide-react';
import { apiClient, ShiftReportInput } from '../api/client';

export const DataEntry: React.FC = () => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ShiftReportInput>({
    defaultValues: {
      shiftDate: format(new Date(), 'yyyy-MM-dd'),
      shiftType: '早班',
      runTime: 8,
      rawOre: {
        wetWeight: 128,
        moisture: 3,
        pbGrade: 4.07,
        znGrade: 0,
        agGrade: 230
      },
      concentrate: {
        pbGrade: 66.04,
        znGrade: 0,
        agGrade: 3380
      },
      tailings: {
        pbGrade: 0.09,
        znGrade: 0,
        agGrade: 4
      }
    }
  });
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (data: ShiftReportInput) => {
    setLoading(true);
    setSubmitError(null);
    setSuccess(false);

    try {
      // Convert string inputs to numbers
      const processedData: ShiftReportInput = {
        ...data,
        rawOre: {
          wetWeight: Number(data.rawOre.wetWeight),
          moisture: Number(data.rawOre.moisture),
          pbGrade: Number(data.rawOre.pbGrade),
          znGrade: Number(data.rawOre.znGrade),
          agGrade: Number(data.rawOre.agGrade),
        },
        concentrate: {
          wetWeight: Number(data.concentrate.wetWeight),
          moisture: Number(data.concentrate.moisture),
          pbGrade: Number(data.concentrate.pbGrade),
          znGrade: Number(data.concentrate.znGrade),
          agGrade: Number(data.concentrate.agGrade),
        },
        tailings: data.tailings ? {
          wetWeight: Number(data.tailings.wetWeight || 0),
          moisture: Number(data.tailings.moisture || 0),
          pbGrade: Number(data.tailings.pbGrade),
          znGrade: Number(data.tailings.znGrade),
          agGrade: Number(data.tailings.agGrade),
        } : undefined
      };

      await apiClient.createReport(processedData);
      setSuccess(true);
      reset();
    } catch (err: any) {
      setSubmitError(err.message || '保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const InputGroup = ({ prefix, registerName, showFineness }: { prefix: string, registerName: string, showFineness?: boolean }) => (
    <div className={`grid grid-cols-1 ${showFineness ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-4`}>
      {showFineness && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">细度 (%)</label>
          <input
            type="number"
            step="0.01"
            {...register(`${prefix}.fineness` as any)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">铅品位 (%)</label>
        <input
          type="number"
          step="0.0001"
          {...register(`${prefix}.pbGrade` as any)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.0000"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">锌品位 (%)</label>
        <input
          type="number"
          step="0.0001"
          {...register(`${prefix}.znGrade` as any)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.0000"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">银品位 (g/t)</label>
        <input
          type="number"
          step="0.0001"
          {...register(`${prefix}.agGrade` as any)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0.0000"
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">生产数据录入</h1>
        <p className="text-slate-500">请输入当班的生产统计数据</p>
      </div>

      {submitError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center text-red-700">
          <AlertCircle className="w-5 h-5 mr-2" />
          {submitError}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md flex items-center text-green-700">
          <Save className="w-5 h-5 mr-2" />
          保存成功！
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">班次信息</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
              <input
                type="date"
                {...register('shiftDate', { required: true })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">班次</label>
              <select
                {...register('shiftType', { required: true })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="早班">早班</option>
                <option value="中班">中班</option>
                <option value="晚班">晚班</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">作业时间 (小时)</label>
              <input
                type="number"
                step="0.1"
                {...register('runTime', { required: true, min: 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.0"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">原矿湿量 (吨)</label>
              <input
                type="number"
                step="0.01"
                {...register('rawOre.wetWeight', { required: true, min: 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">原矿水分 (%)</label>
              <input
                type="number"
                step="0.01"
                {...register('rawOre.moisture', { required: true, min: 0, max: 100 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">原矿数据</h2>
          <InputGroup prefix="rawOre" registerName="rawOre" />
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">精矿数据</h2>
          <InputGroup prefix="concentrate" registerName="concentrate" />
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-slate-100">尾矿数据</h2>
          <InputGroup prefix="tailings" registerName="tailings" />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? '保存中...' : (
              <>
                <Save className="w-5 h-5 mr-2" />
                保存并计算
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
