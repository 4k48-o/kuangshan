import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X } from 'lucide-react';
import { apiClient } from '../api/client';

type FileResult = {
  fileName: string;
  success: boolean;
  message?: string;
  count?: number;
  error?: string;
};

export const WeighingUpload: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    const allowed = list.filter((f) => {
      const ext = (f.name || '').toLowerCase();
      return ext.endsWith('.xls') || ext.endsWith('.xlsx');
    });
    setFiles((prev) => [...prev, ...allowed]);
    setResults([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResults([]);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setResults([{ fileName: '', success: false, error: '请先选择 Excel 文件' }]);
      return;
    }
    setUploading(true);
    const list: FileResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const res = await apiClient.uploadWeighingExcel(file);
        list.push({
          fileName: file.name,
          success: true,
          message: res.message,
          count: res.count,
        });
      } catch (err: any) {
        list.push({
          fileName: file.name,
          success: false,
          error: err?.message || '上传失败',
        });
      }
    }
    setResults(list);
    setFiles([]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">称重数据上传</h1>
      <p className="text-slate-600 mb-6">可一次选择多个 Excel 文件批量导入。表格需包含表头：车号、上传时间、毛重、皮重、净重。表格中填写千克(kg)，系统按吨(t)展示。</p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          multiple
          onChange={handleSelect}
          className="hidden"
        />
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-slate-50 transition-colors"
        >
          <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <p className="text-slate-600 mb-1">点击选择或拖拽 Excel 文件到此处（可多选）</p>
          <p className="text-sm text-slate-400">支持 .xls、.xlsx，可一次选多个文件</p>
        </div>

        {files.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">已选 {files.length} 个文件：</p>
            <ul className="space-y-1.5 max-h-40 overflow-y-auto">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-slate-50 text-sm">
                  <span className="truncate text-slate-800">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded shrink-0"
                    title="移除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? `上传中 (${files.length} 个文件)...` : `导入 ${files.length > 0 ? files.length : 0} 个文件`}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                  r.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
              >
                {r.success ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                <span className="flex-1 min-w-0">
                  {r.fileName && <span className="font-medium">{r.fileName}</span>}
                  {r.success && r.message && <span> — {r.message}</span>}
                  {!r.success && r.error && <span> — {r.error}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
