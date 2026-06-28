import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

// Helper map for English to Devanagari digits
export const toDevanagariDigits = (num: number | string): string => {
  const devanagariMap: { [key: string]: string } = {
    "0": "०", "1": "१", "2": "२", "3": "३", "4": "४",
    "5": "५", "6": "६", "7": "७", "8": "८", "9": "९"
  };
  return String(num).split("").map(char => devanagariMap[char] || char).join("");
};

// Helper map to convert back from Devanagari digits to English
export const fromDevanagariDigits = (str: string): string => {
  const englishMap: { [key: string]: string } = {
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9"
  };
  return String(str).split("").map(char => englishMap[char] || char).join("");
};

// Nepali months
const NEPALI_MONTHS = [
  "वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"
];

const WEEKDAYS = ["आइत", "सोम", "मङ्गल", "बुध", "बिही", "शुक्र", "शनि"];

// Start dates of BS years in AD (Year: [AD_Year, AD_Month_0_indexed, AD_Day])
const bsStartAD: { [key: number]: [number, number, number] } = {
  2077: [2020, 3, 13], // April 13, 2020
  2078: [2021, 3, 14], // April 14, 2021
  2079: [2022, 3, 14], // April 14, 2022
  2080: [2023, 3, 14], // April 14, 2023
  2081: [2024, 3, 13], // April 13, 2024
  2082: [2025, 3, 14], // April 14, 2025
  2083: [2026, 3, 14], // April 14, 2026
  2084: [2027, 3, 14], // April 14, 2027
  2085: [2028, 3, 13], // April 13, 2028
};

// Days in Nepali months for 2077 - 2085
const nepaliMonthsDays: { [year: number]: number[] } = {
  2077: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 30],
  2078: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 32, 31, 31, 30, 30, 30, 29, 30, 29, 30],
  2082: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 30, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2085: [31, 32, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
};

// Convert AD date "YYYY-MM-DD" to BS format string "YYYY/MM/DD"
export const adToBs = (dateStr: string): string => {
  if (!dateStr) return "";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const adDate = new Date(year, month - 1, day);

  let bsYear = 2083; // default fallback
  let found = false;

  for (let y = 2085; y >= 2077; y--) {
    const startParts = bsStartAD[y];
    if (!startParts) continue;
    const startDate = new Date(startParts[0], startParts[1], startParts[2]);
    if (adDate >= startDate) {
      bsYear = y;
      found = true;
      break;
    }
  }

  if (!found) {
    const diffYears = year - 2020;
    bsYear = 2077 + diffYears;
    return `${bsYear}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
  }

  const startParts = bsStartAD[bsYear];
  const startDate = new Date(startParts[0], startParts[1], startParts[2]);

  const diffTime = adDate.getTime() - startDate.getTime();
  let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // 0-indexed days elapsed

  const monthLengths = nepaliMonthsDays[bsYear] || [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30];
  let bsMonth = 1;
  let bsDay = 1;

  for (let m = 0; m < 12; m++) {
    const daysInMonth = monthLengths[m];
    if (diffDays < daysInMonth) {
      bsMonth = m + 1;
      bsDay = diffDays + 1;
      break;
    }
    diffDays -= daysInMonth;
  }

  return `${bsYear}/${bsMonth.toString().padStart(2, "0")}/${bsDay.toString().padStart(2, "0")}`;
};

// Convert BS date "YYYY/MM/DD" to AD format Date
export const bsToAd = (bsDateStr: string): Date | null => {
  if (!bsDateStr) return null;
  const parts = bsDateStr.replace(/-/g, "/").split("/");
  if (parts.length !== 3) return null;
  const bsYear = parseInt(parts[0], 10);
  const bsMonth = parseInt(parts[1], 10);
  const bsDay = parseInt(parts[2], 10);

  const startParts = bsStartAD[bsYear];
  if (!startParts) return null;

  const startDate = new Date(startParts[0], startParts[1], startParts[2]);
  const monthLengths = nepaliMonthsDays[bsYear] || [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30];

  let elapsedDays = 0;
  for (let m = 0; m < bsMonth - 1; m++) {
    elapsedDays += monthLengths[m];
  }
  elapsedDays += (bsDay - 1);

  return new Date(startDate.getTime() + elapsedDays * 24 * 60 * 60 * 1000);
};

interface NepaliDatePickerProps {
  value: string; // AD string like "2026-06-27" or "2026-06-27T04:58" or empty
  onChange: (adValue: string) => void; // Called with standard formatted AD string (YYYY-MM-DD)
  placeholder?: string;
  isEndDate?: boolean; // Determines if fallback time is start of day (00:00) or end of day (23:59)
}

export const NepaliDatePicker: React.FC<NepaliDatePickerProps> = ({
  value,
  onChange,
  placeholder = "YYYY/MM/DD",
  isEndDate = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial BS date from incoming AD value
  const adValueOnly = value ? value.split("T")[0] : "";
  const initialBS = adValueOnly ? adToBs(adValueOnly) : "";

  // Dynamic picker calendar view state (in BS values)
  const [viewYear, setViewYear] = useState<number>(2083);
  const [viewMonth, setViewMonth] = useState<number>(3); // 1-indexed (1 = Baisakh, 3 = Ashad)

  // Initialize view when popup opens or value changes
  useEffect(() => {
    if (initialBS) {
      const parts = initialBS.split("/");
      setViewYear(parseInt(parts[0], 10));
      setViewMonth(parseInt(parts[1], 10));
    } else {
      // Fallback to current year 2083
      setViewYear(2083);
      setViewMonth(3);
    }
  }, [initialBS, isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Format value to display in text box (in Devanagari digits!)
  const getDisplayText = () => {
    if (!initialBS) return "";
    return toDevanagariDigits(initialBS);
  };

  // Weekday offsets of the 1st of the currently displayed month
  const getFirstDayOfMonthWeekday = (): number => {
    const adFirstDay = bsToAd(`${viewYear}/${viewMonth}/1`);
    return adFirstDay ? adFirstDay.getDay() : 0;
  };

  // Length of the currently displayed month
  const getMonthLength = (): number => {
    const lengths = nepaliMonthsDays[viewYear] || [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30];
    return lengths[viewMonth - 1] || 30;
  };

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      if (viewYear > 2077) {
        setViewYear(viewYear - 1);
        setViewMonth(12);
      }
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      if (viewYear < 2085) {
        setViewYear(viewYear + 1);
        setViewMonth(1);
      }
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelectDay = (dayNum: number) => {
    const monthStr = viewMonth.toString().padStart(2, "0");
    const dayStr = dayNum.toString().padStart(2, "0");
    const bsSelected = `${viewYear}/${monthStr}/${dayStr}`;
    
    const adSelectedDate = bsToAd(bsSelected);
    if (adSelectedDate) {
      const yearStr = adSelectedDate.getFullYear();
      const mStr = (adSelectedDate.getMonth() + 1).toString().padStart(2, "0");
      const dStr = adSelectedDate.getDate().toString().padStart(2, "0");
      const timeSuffix = isEndDate ? "T23:59" : "T00:00";
      onChange(`${yearStr}-${mStr}-${dStr}${timeSuffix}`);
    }
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const today = new Date();
    const yearStr = today.getFullYear();
    const mStr = (today.getMonth() + 1).toString().padStart(2, "0");
    const dStr = today.getDate().toString().padStart(2, "0");
    const timeSuffix = isEndDate ? "T23:59" : "T00:00";
    onChange(`${yearStr}-${mStr}-${dStr}${timeSuffix}`);
    setIsOpen(false);
  };

  const handleReset = () => {
    onChange("");
    setIsOpen(false);
  };

  // Render month days grid
  const renderDaysGrid = () => {
    const firstDayWeekday = getFirstDayOfMonthWeekday();
    const totalDays = getMonthLength();
    const gridCells: React.ReactNode[] = [];

    // Empty cells for padding before the 1st day of the month
    for (let i = 0; i < firstDayWeekday; i++) {
      gridCells.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    // Days cells
    const currentSelectedParts = initialBS ? initialBS.split("/") : [];
    const isSameYearAndMonth = currentSelectedParts.length === 3 && 
      parseInt(currentSelectedParts[0], 10) === viewYear && 
      parseInt(currentSelectedParts[1], 10) === viewMonth;
    const selectedDayNum = isSameYearAndMonth ? parseInt(currentSelectedParts[2], 10) : -1;

    for (let day = 1; day <= totalDays; day++) {
      const isSelected = selectedDayNum === day;
      gridCells.push(
        <button
          key={`day-${day}`}
          type="button"
          onClick={() => handleSelectDay(day)}
          className={`h-8 w-8 text-xs font-semibold rounded-lg flex items-center justify-center transition-all cursor-pointer ${
            isSelected
              ? "bg-indigo-600 text-white font-extrabold ring-2 ring-indigo-300 ring-offset-1"
              : "text-slate-700 hover:bg-slate-100 hover:text-indigo-600 font-medium"
          }`}
        >
          {toDevanagariDigits(day)}
        </button>
      );
    }

    return gridCells;
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left w-[130px]">
      <div className="relative">
        <input
          type="text"
          value={getDisplayText()}
          onClick={() => setIsOpen(!isOpen)}
          readOnly
          placeholder={placeholder}
          className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer placeholder-slate-400 text-center tracking-wide"
        />
        <CalendarIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-slate-200 p-3.5 w-64 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-2.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {NEPALI_MONTHS[viewMonth - 1]}
              </span>
              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono">
                {viewYear}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            {WEEKDAYS.map(day => (
              <div key={day} className="h-5 flex items-center justify-center">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-1 justify-items-center mb-3">
            {renderDaysGrid()}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] font-bold">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
            >
              आज (Today)
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-red-500 hover:text-red-700 hover:underline cursor-pointer"
            >
              रद्द (Reset)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
