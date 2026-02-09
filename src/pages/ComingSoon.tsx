import React from 'react';
import { FileQuestion } from 'lucide-react';

export const ComingSoon: React.FC<{ title?: string }> = ({ title = '功能开发中' }) => (
  <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-500">
    <FileQuestion className="w-16 h-16 text-slate-300 mb-4" />
    <h2 className="text-xl font-semibold text-slate-600">{title}</h2>
    <p className="text-sm mt-2">敬请期待</p>
  </div>
);
