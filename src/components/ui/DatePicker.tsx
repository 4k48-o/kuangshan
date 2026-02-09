
import React, { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, isValid, parse } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-day-picker/dist/style.css';

interface DatePickerProps {
  date: Date | null | undefined;
  onChange: (date: Date | null) => void;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({ date, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (selected: Date | undefined) => {
    onChange(selected || null);
    setIsOpen(false);
  };

  const displayDate = date && isValid(date) ? date : null;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none min-w-[140px]"
      >
        <CalendarIcon className="w-4 h-4 mr-2 text-slate-500" />
        <span className="text-sm text-slate-700 font-medium">
          {displayDate ? format(displayDate, 'yyyy-MM-dd') : '选择日期'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-2">
          <style>{`
            .rdp { --rdp-cell-size: 32px; --rdp-accent-color: #2563eb; --rdp-background-color: #e0e7ff; margin: 0; }
            .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { background-color: #f1f5f9; }
            .rdp-day_selected { background-color: var(--rdp-accent-color); color: white; }
            .rdp-day_today { font-weight: bold; color: var(--rdp-accent-color); }
          `}</style>
          <DayPicker
            mode="single"
            selected={displayDate || undefined}
            onSelect={handleSelect}
            locale={zhCN}
            showOutsideDays
            components={{
                Chevron: ({ orientation, className }: { orientation?: 'up' | 'down' | 'left' | 'right'; className?: string }) =>
                  orientation === 'right' ? <ChevronRight className={className ?? 'w-4 h-4'} /> : <ChevronLeft className={className ?? 'w-4 h-4'} />,
            }}
          />
        </div>
      )}
    </div>
  );
};
