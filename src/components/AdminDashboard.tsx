import React, { useState, useEffect } from "react";
import { NepaliDatePicker } from "./NepaliDatePicker";
import { 
  UploadCloud, 
  LogOut, 
  Loader2, 
  Database, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Info,
  Layers,
  Users,
  KeyRound,
  Trash2,
  PlusCircle,
  ShieldCheck,
  UserPlus,
  Lock,
  Settings,
  Clock,
  Calendar,
  History,
  Search
} from "lucide-react";
import * as XLSX from "xlsx";

interface AdminDashboardProps {
  token: string;
  username: string;
  role: string;
  onLogout: () => void;
}

export default function AdminDashboard({ token, username, role, onLogout }: AdminDashboardProps) {
  const [stats, setStats] = useState({
    totalRecords: 0,
    totalUploadFiles: 0,
    availableLicenses: 0
  });
  const [loadingStats, setLoadingStats] = useState(false);

  // File upload states
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[][] | null>(null);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [startRow, setStartRow] = useState<number>(5);
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<{
    fileName: string;
    rowsIgnored: string;
    recordsRead: number;
    newRecordsAdded: number;
    duplicateSkipped: number;
    invalidRows: number;
  } | null>(null);
  const [error, setError] = useState("");

  // Core API Fetch Helper with Authorization
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        console.warn("Session expired or invalid, logging out...");
        onLogout();
      }
      return res;
    } catch (err) {
      console.error("API Fetch Error:", err);
      throw err;
    }
  };

  // State variables for showing duplicate records
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateModalUploadId, setDuplicateModalUploadId] = useState("");
  const [duplicateModalFileName, setDuplicateModalFileName] = useState("");
  const [duplicateRecords, setDuplicateRecords] = useState<any[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [duplicateError, setDuplicateError] = useState("");
  const [expandedDuplicateRow, setExpandedDuplicateRow] = useState<number | null>(null);

  const handleViewDuplicates = async (uploadId: string, fileName: string) => {
    setDuplicateModalUploadId(uploadId);
    setDuplicateModalFileName(fileName);
    setDuplicateModalOpen(true);
    setLoadingDuplicates(true);
    setDuplicateError("");
    setDuplicateRecords([]);
    setExpandedDuplicateRow(null);
    try {
      const res = await fetchWithAuth(`/api/admin/ledger/${uploadId}/duplicates`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateRecords(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setDuplicateError(errData.error || "Failed to fetch duplicate records");
      }
    } catch (err: any) {
      setDuplicateError(err.message || "An error occurred while fetching duplicate records");
    } finally {
      setLoadingDuplicates(false);
    }
  };

  // User Management State Variables
  const [activeTab, setActiveTab] = useState<"upload" | "users" | "my_password" | "audit">("upload");
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");

  // Audit Logs State Variables
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState("");

  // Create User form state
  const [newUsername, setNewUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("staff");
  const [creatingUser, setCreatingUser] = useState(false);

  // Change Password state (for other users - by super admin)
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingPassword, setEditingPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // My Password form state (for self password change)
  const [myCurrentPassword, setMyCurrentPassword] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [changingMyPassword, setChangingMyPassword] = useState(false);

  // Database Management and Recovery states
  const [uploadMode, setUploadMode] = useState<"append" | "fresh_reload">("append");
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState("");
  const [syncError, setSyncError] = useState("");

  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetError, setResetError] = useState("");
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState("");

  const [recovering, setRecovering] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState("");
  const [recoveryError, setRecoveryError] = useState("");

  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");

  // License List States for the beautiful grid preview
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loadingLicenses, setLoadingLicenses] = useState(false);
  const [licensesSearchTerm, setLicensesSearchTerm] = useState("");
  const [licensesLimit, setLicensesLimit] = useState(100);

  // Top-level menu view state ("database" | "search")
  const [adminViewMode, setAdminViewMode] = useState<"search" | "database">("database");

  // Admin Search Panel States
  const [adminSearchLicenseNo, setAdminSearchLicenseNo] = useState("");
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminSearchLoading, setAdminSearchLoading] = useState(false);
  const [adminSearchResult, setAdminSearchResult] = useState<{
    searched: boolean;
    available: boolean;
    record?: any;
    message?: string;
  } | null>(null);

  // Active view of the spreadsheet panel ("records" | "lots")
  const [activeView, setActiveView] = useState<"records" | "lots">("lots");

  // Lots state (ledgers)
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [lotsSearchTerm, setLotsSearchTerm] = useState("");

  const loadLedgers = async () => {
    setLoadingLedgers(true);
    try {
      const res = await fetchWithAuth("/api/admin/ledger");
      if (res.ok) {
        const data = await res.json();
        setLedgers(data);
      }
    } catch (err) {
      console.error("Error loading ledgers:", err);
    } finally {
      setLoadingLedgers(false);
    }
  };

  const getLotOrdinalString = (n: number) => {
    const val = n <= 0 ? 1 : n;
    const j = val % 10;
    const k = val % 100;
    if (j === 1 && k !== 11) {
      return `${val}st-LOT`;
    }
    if (j === 2 && k !== 12) {
      return `${val}nd-LOT`;
    }
    if (j === 3 && k !== 13) {
      return `${val}rd-LOT`;
    }
    return `${val}th-LOT`;
  };

  // Convert Gregorian date (e.g. "2026-06-26") to beautiful Nepalese Bikram Sambat (B.S.) date
  const convertToNepaliBS = (dateStr: string): string => {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    const adDate = new Date(year, month - 1, day);
    
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

    // Find active BS year
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
    
    let diffTime = adDate.getTime() - startDate.getTime();
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

  const loadLicenses = async (searchVal = "", limitVal = 100) => {
    setLoadingLicenses(true);
    try {
      let url = `/api/admin/licenses?limitCount=${limitVal}`;
      if (searchVal.trim()) {
        url += `&search=${encodeURIComponent(searchVal.trim())}`;
      }
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        setLicenses(data);
      }
    } catch (err) {
      console.error("Error loading licenses:", err);
    } finally {
      setLoadingLicenses(false);
    }
  };

  // Load User List (Super User only)
  const loadUsers = async () => {
    if (role !== "super_user") return;
    setLoadingUsers(true);
    setUserError("");
    setUserSuccess("");
    try {
      const res = await fetchWithAuth("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        const data = await res.json();
        setUserError(data.error || "प्रयोगकर्ता सूची लोड गर्न असफल भयो।");
      }
    } catch (err) {
      console.error("Error loading users:", err);
      setUserError("सर्भरसँग जडान हुन सकेन।");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users" && role === "super_user") {
      loadUsers();
    }
  }, [activeTab]);

  // Load Security Audit Logs (Super User only)
  const loadAuditLogs = async () => {
    if (role !== "super_user") return;
    setLoadingAudit(true);
    setAuditError("");
    try {
      const res = await fetchWithAuth("/api/admin/audit-logs");
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      } else {
        const data = await res.json();
        setAuditError(data.error || "सुरक्षा अडिट लगहरू लोड गर्न असफल भयो।");
      }
    } catch (err) {
      console.error("Error loading audit logs:", err);
      setAuditError("सर्भरसँग जडान हुन सकेन।");
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === "audit" && role === "super_user") {
      loadAuditLogs();
    }
  }, [activeTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserPassword.trim() || !newUserRole) {
      setUserError("सबै क्षेत्रहरू आवश्यक छन्।");
      return;
    }

    setCreatingUser(true);
    setUserError("");
    setUserSuccess("");

    try {
      const res = await fetchWithAuth("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newUserPassword,
          role: newUserRole
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUserSuccess(data.message || "नयाँ प्रयोगकर्ता थपियो!");
        setNewUsername("");
        setNewUserPassword("");
        setNewUserRole("staff");
        loadUsers(); // Refresh list
      } else {
        setUserError(data.error || "प्रयोगकर्ता सिर्जना असफल भयो।");
      }
    } catch (err) {
      console.error("Error creating user:", err);
      setUserError("सिर्जना गर्दा त्रुटि देखा पर्यो।");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userToDelete: string) => {
    if (!window.confirm(`के तपाईं निश्चित रूपमा प्रयोगकर्ता ${userToDelete} लाई हटाउन चाहनुहुन्छ?`)) {
      return;
    }

    setUserError("");
    setUserSuccess("");

    try {
      const res = await fetchWithAuth("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: userToDelete })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUserSuccess(data.message || "प्रयोगकर्ता हटाइयो!");
        loadUsers(); // Refresh list
      } else {
        setUserError(data.error || "हटाउन असफल भयो।");
      }
    } catch (err) {
      console.error("Error deleting user:", err);
      setUserError("हटाउँदा त्रुटि देखा पर्यो।");
    }
  };

  const handleChangeUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editingPassword.trim()) {
      setUserError("नयाँ पासवर्ड प्रविष्ट गर्नुहोस्।");
      return;
    }

    setUpdatingPassword(true);
    setUserError("");
    setUserSuccess("");

    try {
      const res = await fetchWithAuth("/api/admin/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: editingUser,
          newPassword: editingPassword
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUserSuccess(data.message || "पासवर्ड सफलतापूर्वक परिवर्तन गरियो।");
        setEditingUser(null);
        setEditingPassword("");
      } else {
        setUserError(data.error || "पासवर्ड परिवर्तन असफल भयो।");
      }
    } catch (err) {
      console.error("Error updating user password:", err);
      setUserError("पासवर्ड परिवर्तन गर्दा त्रुटि देखा पर्यो।");
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myCurrentPassword.trim()) {
      setUserError("कृपया हालको पासवर्ड प्रविष्ट गर्नुहोस्।");
      return;
    }
    if (!myNewPassword.trim()) {
      setUserError("कृपया नयाँ पासवर्ड प्रविष्ट गर्नुहोस्।");
      return;
    }

    setChangingMyPassword(true);
    setUserError("");
    setUserSuccess("");

    try {
      const res = await fetchWithAuth("/api/admin/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          currentPassword: myCurrentPassword,
          newPassword: myNewPassword
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUserSuccess(data.message || "तपाईंको पासवर्ड सफलतापूर्वक परिवर्तन गरियो।");
        setMyCurrentPassword("");
        setMyNewPassword("");
      } else {
        setUserError(data.error || "पासवर्ड परिवर्तन असफल भयो।");
      }
    } catch (err) {
      console.error("Error changing my password:", err);
      setUserError("पासवर्ड परिवर्तन गर्दा त्रुटि देखा पर्यो।");
    } finally {
      setChangingMyPassword(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetchWithAuth("/api/admin/dashboard");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Error loading stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleAdminSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSearchLicenseNo.trim()) return;

    setAdminSearchLoading(true);
    setAdminSearchQuery(adminSearchLicenseNo);
    try {
      const res = await fetch(`/api/search?licenseNo=${encodeURIComponent(adminSearchLicenseNo.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setAdminSearchResult({
          searched: true,
          available: data.available,
          record: data.record,
          message: data.message,
        });
      } else {
        setAdminSearchResult({
          searched: true,
          available: false,
          message: data.error || "खोज गर्दा त्रुटि देखा पर्यो।",
        });
      }
    } catch (err) {
      console.error(err);
      setAdminSearchResult({
        searched: true,
        available: false,
        message: "सर्भरसँग जडान हुन सकेन। कृपया इन्टरनेट जाँच गरी पुनः प्रयास गर्नुहोस्।",
      });
    } finally {
      setAdminSearchLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadLicenses("", 100);
    loadLedgers();
  }, []);

  const handleSyncReconcile = async () => {
    setSyncing(true);
    setSyncSuccess("");
    setSyncError("");
    try {
      const res = await fetchWithAuth("/api/admin/sync-reconcile", {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncSuccess(data.message || "डेटाबेस र तथ्याङ्क सफलतापूर्वक सिंक गरियो!");
        if (data.stats) {
          setStats(data.stats);
        }
        loadLicenses("", 100);
        loadLedgers();
      } else {
        setSyncError(data.error || "सिंक प्रक्रिया असफल भयो।");
      }
    } catch (err) {
      console.error(err);
      setSyncError("सिंक गर्दा नेटवर्कमा समस्या देखा पर्यो।");
    } finally {
      setSyncing(false);
    }
  };

  const handleResetDatabase = async () => {
    if (resetConfirmationText.toUpperCase() !== "RESET") {
      setResetError("कृपया पुष्टि गर्न 'RESET' टाइप गर्नुहोस्।");
      return;
    }

    setResetting(true);
    setResetSuccess("");
    setResetError("");

    try {
      const res = await fetchWithAuth("/api/admin/reset-database", {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetSuccess(data.message || "डाटाबेस र अपलोड इतिहास सफलतापूर्वक खाली गरियो!");
        setUploadSummary(null); // Clear any visual summary of previous imports
        if (data.stats) {
          setStats(data.stats);
        } else {
          setStats({
            totalRecords: 0,
            totalUploadFiles: 0,
            availableLicenses: 0,
            lastUploadDate: "N/A"
          });
        }
        loadLicenses("", 100);
        loadLedgers();
        setResetConfirmationText("");
        setTimeout(() => {
          setIsResetModalOpen(false);
          setResetSuccess("");
        }, 2000);
      } else {
        setResetError(data.error || "डाटाबेस रिसेट प्रक्रिया असफल भयो।");
      }
    } catch (err) {
      console.error(err);
      setResetError("डेटाबेस रिसेट गर्दा नेटवर्कमा समस्या देखा पर्यो।");
    } finally {
      setResetting(false);
    }
  };

  const handleRecoverData = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fromDateTime || !toDateTime) {
      setRecoveryError("कृपया सुरु र अन्तिम मिति र समय छनौट गर्नुहोस्।");
      return;
    }
    setRecovering(true);
    setRecoverySuccess("");
    setRecoveryError("");
    try {
      const res = await fetchWithAuth("/api/admin/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDateTime: new Date(fromDateTime).toISOString(),
          toDateTime: new Date(toDateTime).toISOString()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecoverySuccess(data.message || "डाटा सफलतापूर्वक ब्याकअपबाट रिकभर गरियो!");
        loadStats(); // reload numbers
        loadLicenses("", 100);
        loadLedgers();
        setFromDateTime("");
        setToDateTime("");
      } else {
        setRecoveryError(data.error || "डाटा रिकभरी असफल भयो।");
      }
    } catch (err) {
      console.error(err);
      setRecoveryError("रिकभरी गर्दा नेटवर्कमा समस्या देखा पर्यो।");
    } finally {
      setRecovering(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError("");
    setUploadSummary(null);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Parse as raw array of arrays to handle custom title rows
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        setParsedData(rawRows);
        
        // Robust auto-detection of the starting row using cell-matching scores across the first 25 rows
        let bestRowIndex = -1;
        let maxScore = 0;
        for (let i = 0; i < Math.min(25, rawRows.length); i++) {
          const row = rawRows[i];
          if (Array.isArray(row) && row.length > 0) {
            let score = 0;
            const joined = row.map(v => String(v || "").toUpperCase()).join(" ");
            
            if (/\b(SN|S\.N\.|S\.NO|S_N|क्र\.सं\.|क्र\.सं|क्र सं)\b/i.test(joined)) score += 1;
            if (joined.includes("FULL NAME") || joined.includes("APPLICANT NAME") || joined.includes("FULLNAME") || joined.includes("आवेदक") || joined.includes("NAME") || joined.includes("F/H NAME")) score += 1.5;
            if (joined.includes("LICENSE") || joined.includes("LICENCE") || joined.includes("लाइसेन्स")) score += 1.5;
            if (joined.includes("CATEGORY") || joined.includes("CAT") || joined.includes("CLASS") || joined.includes("वर्ग")) score += 1;
            if (joined.includes("VISIT") || joined.includes("DATE") || joined.includes("मिति") || joined.includes("DAY")) score += 1;

            if (score > maxScore) {
              maxScore = score;
              bestRowIndex = i;
            }
          }
        }

        let detectedStartRow = 5; // Fallback default
        if (bestRowIndex !== -1 && maxScore >= 1.5) {
          detectedStartRow = bestRowIndex + 2; // Data starts at header index + 2 (1-based index)
        }
        setStartRow(detectedStartRow);
      } catch (err) {
        console.error("FileReader parsing error:", err);
        setError("फाइल पार्स गर्न असफल भयो। कृपया मान्य एक्सेल (.xlsx) वा CSV फाइल अपलोड गर्नुहोस्।");
        setFile(null);
        setParsedData(null);
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  // Re-calculate preview when startRow changes
  useEffect(() => {
    if (parsedData && parsedData.length > 0) {
      const headerIdx = startRow - 2 >= 0 ? startRow - 2 : 0;
      const firstDataIdx = startRow - 1 >= 0 ? startRow - 1 : 0;
      
      const preview = [];
      if (parsedData[headerIdx]) preview.push(parsedData[headerIdx]);
      const dat = parsedData.slice(firstDataIdx, firstDataIdx + 6);
      dat.forEach(r => preview.push(r));
      
      setPreviewRows(preview);
    }
  }, [startRow, parsedData]);

  const handleUploadSubmit = async () => {
    if (!file || !parsedData) return;

    setUploading(true);
    setError("");
    setUploadSummary(null);

    try {
      const response = await fetchWithAuth("/api/admin/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.name.endsWith(".csv") ? "CSV" : "Excel",
          records: parsedData,
          startRow: startRow,
          uploadMode: uploadMode
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setUploadSummary(data.summary);
        loadStats(); // trigger dashboard refresh
        loadLicenses("", 100);
        loadLedgers();
        // Clear files
        setFile(null);
        setParsedData(null);
        setPreviewRows([]);
      } else {
        setError(data.error || "अपलोड गर्न असफल भयो। डेटा ढाँचा जाँच गर्नुहोस्।");
      }
    } catch (err) {
      console.error(err);
      setError("डेटा अपलोड गर्दा त्रुटि देखा पर्यो।");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-900" id="admin-dashboard-root">
      {/* Government-style Admin Header */}
      <header className="bg-slate-900 text-white py-4 px-6 shadow-md flex flex-col sm:flex-row justify-between items-center gap-4 border-b-4 border-red-600">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-gray-700">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/2/23/Emblem_of_Nepal.svg" 
              alt="Gov Logo" 
              className="w-7 h-7 object-contain" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-wide text-white uppercase">TMO ITAHARI - ADMIN PORTAL</h1>
            <p className="text-xs text-slate-400">सवारी चालक अनुमति पत्र, ईटहरी, सुनसरी</p>
          </div>
        </div>

        {/* User profile & actions */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs block text-slate-400">Logged in as:</span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">{username}</span>
          </div>
          
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow"
            id="admin-logout-btn"
          >
            <LogOut className="w-3.5 h-3.5" />
            LOGOUT (बाहिरिने)
          </button>
        </div>
      </header>

      {/* Sub-header Menu Bar */}
      <div className="bg-slate-100 border-b border-slate-200 py-2.5 px-4 sm:px-8 flex justify-start items-center" id="admin-sub-menu-bar">
        <div className="max-w-5xl w-full mx-auto flex gap-3">
          <button
            onClick={() => setAdminViewMode("search")}
            className={`px-5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              adminViewMode === "search"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
            id="admin-menu-search-btn"
          >
            SEARCH
          </button>
          <button
            onClick={() => setAdminViewMode("database")}
            className={`px-5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              adminViewMode === "database"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
            id="admin-menu-database-btn"
          >
            DATABASE
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-grow max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {adminViewMode === "database" ? (
          <>
            {/* Row of stats and title */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2">
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              लाइसेन्स रेकर्ड अपलोड र व्यवस्थापन (Records Upload Center)
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              एक्सेल वा सी.एस.भी. फाइलबाट नयाँ प्रिन्ट भएका लाइसेन्सहरूको लट (Lot) डेटा सजिलै आयात गर्नुहोस्।
            </p>
          </div>

          <button
            onClick={loadStats}
            disabled={loadingStats}
            className="flex items-center gap-2 text-xs bg-white text-gray-700 hover:bg-gray-50 px-3.5 py-2 rounded-lg border border-gray-200 shadow-sm transition-all font-bold cursor-pointer"
            id="refresh-stats-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? "animate-spin" : ""}`} />
            REFRESH STATS
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => {
              setActiveTab("upload");
              setUserError("");
              setUserSuccess("");
            }}
            className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "upload"
                ? "border-red-600 text-red-600 font-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            डेटा अपलोड (Data Upload)
          </button>

          {role === "super_user" && (
            <button
              onClick={() => {
                setActiveTab("users");
                setUserError("");
                setUserSuccess("");
              }}
              className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === "users"
                  ? "border-red-600 text-red-600 font-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="w-4 h-4" />
              प्रयोगकर्ता व्यवस्थापन (User Management)
            </button>
          )}

          {role === "super_user" && (
            <button
              onClick={() => {
                setActiveTab("audit");
                setUserError("");
                setUserSuccess("");
              }}
              className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === "audit"
                  ? "border-red-600 text-red-600 font-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              सुरक्षा अडिट लगहरू (Security Logs)
            </button>
          )}

          <button
            onClick={() => {
              setActiveTab("my_password");
              setUserError("");
              setUserSuccess("");
            }}
            className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "my_password"
                ? "border-red-600 text-red-600 font-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            मेरो पासवर्ड (My Password)
          </button>
        </div>

        {activeTab === "upload" && (
          <>
            {/* Simple Stats Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="stats-summary-row">
              {/* Card 1: Total Records */}
              <button
                onClick={() => setActiveView("records")}
                className={`text-left p-5 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                  activeView === "records"
                    ? "bg-indigo-50/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20"
                    : "bg-white border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md"
                }`}
              >
                <div>
                  <span className="text-xs text-gray-500 font-bold block uppercase tracking-wider">कुल लाइसेन्स रेकर्डहरू (Total Records)</span>
                  <strong className="text-2xl sm:text-3xl font-black text-indigo-900 font-mono mt-1 block">
                    {stats.totalRecords.toLocaleString()}
                  </strong>
                  <span className="text-[10px] text-indigo-600 font-semibold mt-1 block">
                    {activeView === "records" ? "● तालिकामा देखाइएको छ" : "तालिकामा हेर्न क्लिक गर्नुहोस्"}
                  </span>
                </div>
                <div className={`p-3 rounded-lg transition-colors ${activeView === "records" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"}`}>
                  <Database className="w-6 h-6" />
                </div>
              </button>

              {/* Card 2: Total Lots */}
              <button
                onClick={() => {
                  setActiveView("lots");
                  loadLedgers();
                  setTimeout(() => {
                    const el = document.getElementById("live-lots-spreadsheet-container");
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }, 120);
                }}
                className={`text-left p-5 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between outline-none focus:ring-2 focus:ring-amber-500/30 ${
                  activeView === "lots"
                    ? "bg-amber-50/40 border-amber-500 shadow-md ring-2 ring-amber-500/20"
                    : "bg-white border-gray-200 shadow-sm hover:border-amber-300 hover:shadow-md"
                }`}
              >
                <div>
                  <span className="text-xs text-gray-500 font-bold block uppercase tracking-wider">कुल अपलोड लटहरू (Total Lots)</span>
                  <strong className="text-2xl sm:text-3xl font-black text-amber-900 font-mono mt-1 block">
                    {stats.totalUploadFiles}
                  </strong>
                  <span className="text-[10px] text-amber-600 font-semibold mt-1 block">
                    {activeView === "lots" ? "● तालिकामा देखाइएको छ" : "तालिकामा हेर्न क्लिक गर्नुहोस्"}
                  </span>
                </div>
                <div className={`p-3 rounded-lg transition-colors ${activeView === "lots" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-600"}`}>
                  <Layers className="w-6 h-6" />
                </div>
              </button>

              {/* Card 3: Available Cards */}
              <button
                onClick={() => setActiveView("records")}
                className={`text-left p-5 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                  activeView === "records"
                    ? "bg-emerald-50/40 border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-white border-gray-200 shadow-sm hover:border-emerald-300 hover:shadow-md"
                }`}
              >
                <div>
                  <span className="text-xs text-gray-500 font-bold block uppercase tracking-wider">कार्यालयमा उपलब्ध कार्डहरू (Available Cards)</span>
                  <strong className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono mt-1 block">
                    {stats.availableLicenses.toLocaleString()}
                  </strong>
                  <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">
                    {activeView === "records" ? "● तालिकामा देखाइएको छ" : "तालिकामा हेर्न क्लिक गर्नुहोस्"}
                  </span>
                </div>
                <div className={`p-3 rounded-lg transition-colors ${activeView === "records" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-600"}`}>
                  <CheckCircle className="w-6 h-6" />
                </div>
              </button>
            </div>

            {/* Switchable Table Worksheet Container */}
            {activeView === "records" ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4 mt-6" id="live-records-spreadsheet-container">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-100 gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-indigo-600 animate-pulse" />
                      लाइसेन्स रेकर्ड विवरण तालिका (Live License Database Worksheet)
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">
                      डाटाबेसमा कुल <span className="text-indigo-600 font-bold font-mono">{stats.totalRecords}</span> रेकर्डहरू उपलब्ध छन्। सुपर युजर र स्टाफहरूले यहाँबाट सबै रेकर्ड हेर्न र खोजी गर्न सक्नुहुन्छ।
                    </p>
                  </div>
                  
                  {/* Live Search & Refresh controls */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="लाइसेन्स नम्बर मात्र खोज्नुहोस्..."
                        value={licensesSearchTerm}
                        onChange={(e) => {
                          setLicensesSearchTerm(e.target.value);
                          loadLicenses(e.target.value, licensesLimit);
                        }}
                        className="w-56 pl-8 pr-8 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      {licensesSearchTerm && (
                        <button 
                          onClick={() => {
                            setLicensesSearchTerm("");
                            loadLicenses("", licensesLimit);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    
                    <select
                      value={licensesLimit}
                      onChange={(e) => {
                        const lim = Number(e.target.value);
                        setLicensesLimit(lim);
                        loadLicenses(licensesSearchTerm, lim);
                      }}
                      className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 bg-white"
                    >
                      <option value={20}>२० रेकर्ड (20 rows)</option>
                      <option value={50}>५० रेकर्ड (50 rows)</option>
                      <option value={100}>१०० रेकर्ड (100 rows)</option>
                      <option value={500}>५०० रेकर्ड (500 rows)</option>
                    </select>

                    <button
                      onClick={() => loadLicenses(licensesSearchTerm, licensesLimit)}
                      disabled={loadingLicenses}
                      className="p-1.5 border border-gray-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 text-gray-700"
                      title="Refresh Table Data"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingLicenses ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                {loadingLicenses ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">रेकर्डहरू लोड हुँदैछ...</p>
                  </div>
                ) : licenses.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 border border-dashed border-gray-200 rounded-xl space-y-2">
                    <Database className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-xs text-gray-500 font-bold uppercase">कुनै लाइसेन्स रेकर्ड फेला परेन।</p>
                    <p className="text-[10px] text-gray-400">डाटाबेस खाली छ वा मिलान हुने कुनै रेकर्ड फेला परेन।</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-300 rounded-lg shadow-sm" id="excel-worksheet-wrapper">
                    <table className="w-full text-xs text-left text-slate-800 border-collapse">
                      <thead className="bg-[#D9E1F2] border-b-2 border-slate-400">
                        <tr>
                          <th className="p-2 border border-slate-300 text-center font-extrabold text-[#C00000] uppercase tracking-wider text-[11px] w-16">SN</th>
                          <th className="p-2 border border-slate-300 text-left font-extrabold text-[#C00000] uppercase tracking-wider text-[11px]">FULL NAME</th>
                          <th className="p-2 border border-slate-300 text-center font-extrabold text-[#C00000] uppercase tracking-wider text-[11px] w-36">LICENSE NO.</th>
                          <th className="p-2 border border-slate-300 text-center font-extrabold text-[#C00000] uppercase tracking-wider text-[11px] w-24">CATEGORY</th>
                          <th className="p-2 border border-slate-300 text-center font-extrabold text-[#C00000] uppercase tracking-wider text-[11px] w-40">VISIT DATE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {licenses.map((item, index) => {
                          const rowBgClass = index % 2 === 0 ? "bg-white" : "bg-[#F2F5F9]";
                          return (
                            <tr 
                              key={item.licenseNo} 
                              className={`${rowBgClass} hover:bg-[#E4ECF7] transition-colors`}
                            >
                              {/* SN */}
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold text-gray-500">
                                {index + 1}
                              </td>
                              {/* FULL NAME */}
                              <td className="p-2 border border-slate-200 text-left font-sans font-bold text-slate-800 uppercase text-[11px]">
                                {item.fullName || "-"}
                              </td>
                              {/* LICENSE NO. */}
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold text-indigo-700 tracking-wider text-[11px]">
                                {item.licenseNo || "-"}
                              </td>
                              {/* CATEGORY */}
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-600">
                                {item.category || "-"}
                              </td>
                              {/* VISIT DATE */}
                              <td className="p-2 border border-slate-200 text-center font-sans text-emerald-800 font-bold text-[11px]">
                                {item.officeVisitDay || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              /* Beautiful Live Lots Database Spreadsheet Grid */
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4 mt-6" id="live-lots-spreadsheet-container">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-100 gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase flex items-center gap-2">
                      <Layers className="w-5 h-5 text-amber-600 animate-pulse" />
                      अपलोड इतिहास लट तालिका (Uploaded Lot History Worksheet)
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">
                      कार्यालयमा आयात गरिएका कुल <span className="text-amber-600 font-bold font-mono">{getLotOrdinalString(stats.totalUploadFiles)}</span> लट फाइलहरू उपलब्ध छन्। यहाँबाट प्रत्येक लटको तथ्याङ्क र स्थिति हेर्न सक्नुहुन्छ।
                    </p>
                  </div>
                  
                  {/* Live Search & Refresh controls for Lots */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="फाइल नाम वा लट खोज्नुहोस्..."
                        value={lotsSearchTerm}
                        onChange={(e) => setLotsSearchTerm(e.target.value)}
                        className="w-56 pl-8 pr-8 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      {lotsSearchTerm && (
                        <button 
                          onClick={() => setLotsSearchTerm("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <button
                      onClick={loadLedgers}
                      disabled={loadingLedgers}
                      className="p-1.5 border border-gray-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 text-gray-700"
                      title="Refresh Table Data"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingLedgers ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                {loadingLedgers ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">लट विवरणहरू लोड हुँदैछ...</p>
                  </div>
                ) : ledgers.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 border border-dashed border-gray-200 rounded-xl space-y-2">
                    <Layers className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-xs text-gray-500 font-bold uppercase">कुनै लट फाइल फेला परेन।</p>
                    <p className="text-[10px] text-gray-400">अहिलेसम्म कुनै फाइल अपलोड गरिएको छैन वा मिलान हुने लट भेटिएन।</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-300 rounded-lg shadow-sm" id="lots-worksheet-wrapper">
                    <table className="w-full text-xs text-left text-slate-800 border-collapse">
                      <thead className="bg-[#FFF2CC] border-b-2 border-slate-400">
                        <tr>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-12">SN</th>
                          <th className="p-2.5 border border-slate-300 text-left font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px]">UPLOADED FILE NAME</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-24">FILE TYPE</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-32">LOT</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-44">DATE in Nepali calendar</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-40">No. Of. Previous Records</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-40">No. Of Recent Records</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-36">DUPLICATE FOUND</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-40">TOTAL RECORDS</th>
                          <th className="p-2.5 border border-slate-300 text-center font-extrabold text-[#7F6000] uppercase tracking-wider text-[11px] w-48">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {(() => {
                          const uploadIdToLotMap: { [key: string]: number } = {};
                          const sortedLedgers = [...ledgers].sort((a, b) => {
                            return (a.uploadId || "").localeCompare(b.uploadId || "");
                          });
                          sortedLedgers.forEach((item, idx) => {
                            uploadIdToLotMap[item.uploadId] = idx + 1;
                          });

                          // Chronologically pre-calculate cumulative database records before, during, and after each upload
                          let runningTotal = 0;
                          const computedLedgers = sortedLedgers.map((item) => {
                            const previousRecords = runningTotal;
                            const recentRecords = item.newRecords || 0;
                            runningTotal += recentRecords;
                            return {
                              ...item,
                              previousRecords,
                              recentRecords,
                              totalRecordsComputed: runningTotal
                            };
                          });

                          return computedLedgers
                            .filter(item => {
                              if (!lotsSearchTerm.trim()) return true;
                              const term = lotsSearchTerm.toLowerCase();
                              return (
                                (item.fileName && item.fileName.toLowerCase().includes(term)) ||
                                (item.uploadId && item.uploadId.toLowerCase().includes(term)) ||
                                (item.uploadedBy && item.uploadedBy.toLowerCase().includes(term)) ||
                                (item.uploadDate && item.uploadDate.toLowerCase().includes(term))
                              );
                            })
                            .map((item, index) => {
                              const rowBgClass = index % 2 === 0 ? "bg-white" : "bg-[#FFFDF6]";
                              const lotNumber = uploadIdToLotMap[item.uploadId] || (index + 1);
                              return (
                                <tr 
                                  key={item.uploadId} 
                                  className={`${rowBgClass} hover:bg-[#FFF9E6] transition-colors`}
                                >
                                  {/* SN */}
                                  <td className="p-2.5 border border-slate-200 text-center font-mono font-bold text-gray-500">
                                    {index + 1}
                                  </td>
                                  {/* UPLOADED FILE NAME */}
                                  <td className="p-2.5 border border-slate-200 text-left font-sans font-bold text-slate-800 uppercase tracking-wide">
                                    {item.fileName || "-"}
                                  </td>
                                  {/* FILE TYPE */}
                                  <td className="p-2.5 border border-slate-200 text-center font-bold">
                                    {(() => {
                                      const ext = (item.fileName || "").split('.').pop()?.toLowerCase();
                                      if (ext === "csv") {
                                        return <span className="text-orange-700 font-black tracking-wider uppercase text-xs font-mono">CSV</span>;
                                      }
                                      if (ext === "xlsx" || ext === "xls") {
                                        return <span className="text-emerald-700 font-black tracking-wider uppercase text-xs font-mono">EXCEL</span>;
                                      }
                                      return <span className="text-slate-700 font-black tracking-wider uppercase text-xs font-mono">{ext?.toUpperCase() || "-"}</span>;
                                    })()}
                                  </td>
                                  {/* LOT */}
                                  <td className="p-2.5 border border-slate-200 text-center font-mono font-extrabold text-amber-800 tracking-wider">
                                    {getLotOrdinalString(lotNumber)}
                                  </td>
                                  {/* DATE in Nepali calendar */}
                                  <td className="p-2.5 border border-slate-200 text-center font-sans text-slate-700 font-bold text-[11px]">
                                    {convertToNepaliBS(item.uploadDate)}
                                  </td>
                                  {/* NO. OF PREVIOUS RECORDS */}
                                  <td className="p-2.5 border border-slate-200 text-center font-mono font-extrabold text-blue-700 text-sm">
                                    {item.previousRecords.toLocaleString()}
                                  </td>
                                  {/* NO. OF RECENT RECORDS */}
                                  <td className="p-2.5 border border-slate-200 text-center font-mono font-extrabold text-emerald-700 text-sm">
                                    {item.recentRecords.toLocaleString()}
                                  </td>
                                  {/* DUPLICATE FOUND */}
                                  <td className="p-2.5 border border-slate-200 text-center font-mono font-bold">
                                    {item.duplicateSkipped && item.duplicateSkipped > 0 ? (
                                      <button
                                        onClick={() => handleViewDuplicates(item.uploadId, item.fileName)}
                                        className="text-red-600 hover:text-red-800 hover:underline font-extrabold cursor-pointer transition-all duration-150 text-sm"
                                        title="Click to view duplicates details"
                                      >
                                        {item.duplicateSkipped.toLocaleString()}
                                      </button>
                                    ) : (
                                      <span className="text-slate-500 font-bold text-sm">0</span>
                                    )}
                                  </td>
                                  {/* TOTAL RECORDS */}
                                  <td className="p-2.5 border border-slate-200 text-center font-mono font-extrabold text-indigo-900 text-sm">
                                    {item.totalRecordsComputed.toLocaleString()}
                                  </td>
                                  {/* STATUS */}
                                  <td className="p-2.5 border border-slate-200 text-center font-sans">
                                    {item.duplicateSkipped && item.duplicateSkipped > 0 ? (
                                      <div className="flex flex-col gap-1 items-center justify-center py-1">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                                          Successfully Processed
                                        </span>
                                        <button
                                          onClick={() => handleViewDuplicates(item.uploadId, item.fileName)}
                                          className="inline-flex items-center gap-1 text-[10px] font-black tracking-wider text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded hover:bg-rose-100 hover:text-rose-950 hover:border-rose-300 cursor-pointer transition-all duration-150 shadow-sm active:scale-95"
                                          title="Click to view detailed duplicate records"
                                        >
                                          Rejected {item.duplicateSkipped} Duplicates
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col gap-1 items-center justify-center py-1">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                                          Successfully Processed
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

        {role === "viewer" ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4 text-center mt-6" id="viewer-readonly-notice">
            <div className="mx-auto bg-amber-50 p-4 rounded-full border border-amber-100 flex items-center justify-center w-16 h-16 text-amber-500">
              <ShieldCheck className="w-8 h-8 animate-pulse" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase">
              अवलोकनकर्ता मोड (Viewer - Read Only Mode)
            </h3>
            <p className="text-xs text-gray-500 max-w-xl mx-auto leading-relaxed">
              तपाईं अहिले मात्र 'अवलोकनकर्ता' (Viewer - Read Only) मोडमा हुनुहुन्छ। नयाँ रेकर्ड अपलोड गर्न, रिसेट गर्न वा रिकभरी नियन्त्रण गर्न अनुमति छैन। विवरण अवलोकन गर्न र खोज गर्न माथिका कार्डहरू प्रयोग गर्न सक्नुहुन्छ।
            </p>
            <p className="text-xs text-amber-700 font-extrabold max-w-xl mx-auto leading-relaxed font-sans">
              You are currently in 'Viewer' mode. File uploads, database resets, and recovery controls are restricted. You can browse stats, lot lists, and query records.
            </p>
          </div>
        ) : (
          <>
            {/* Excel/CSV Lot Upload Wizard Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6" id="upload-wizard-container">
              <div className="space-y-1 pb-4 border-b border-gray-100">
                <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  फाइल अपलोड गर्नुहोस् (Select & Upload Lot File)
                </h3>
                <p className="text-xs text-gray-500">
                  एक्सेल (.xlsx) वा सी.एस.भी. (.csv) फाइल यहाँ राखेर डेटा आयात र प्रमाणीकरण गर्नुहोस्।
                </p>
              </div>



          {/* Settings and File Picker full-width */}
          <div className="w-full">
            {/* Drag & Drop Zone */}
            <div className="w-full relative">
              <div className="border-2 border-dashed border-gray-300 hover:border-indigo-500 rounded-xl p-6 text-center bg-slate-50 transition-all relative">
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  id="excel-csv-file-picker"
                />
                <div className="flex flex-col sm:flex-row items-center gap-4 text-left justify-center max-w-2xl mx-auto py-2">
                  <div className="flex-shrink-0 bg-indigo-50 p-4 rounded-full border border-indigo-100 flex items-center justify-center">
                    <UploadCloud className="w-10 h-10 text-indigo-500 animate-bounce" />
                  </div>
                  <div className="space-y-1.5 text-center sm:text-left">
                    <h4 className="font-bold text-xs sm:text-sm text-gray-700 leading-relaxed">सिस्टमले अपलोड गरिएको एक्सेल वा सी.एस.भी. फाइल स्क्यान गरी स्वतः उपयुक्त डेटा पङ्क्ति (Start Row) पहिचान गर्नेछ।</h4>
                    <p className="font-extrabold text-xs sm:text-sm text-indigo-900 leading-relaxed">अपलोड गर्ने फायलमा SN, FULL NAME, LICENSE NO., CATEGORY and VISIT DATE को लागि जम्मा ५ वटा कोलम मात्र प्रयोग गर्नु होला ।</p>
                    <p className="text-xs text-slate-900 font-black tracking-wider uppercase">Supports .XLS, .XLSX, .CSV</p>
                    {file && (
                      <div className="flex flex-wrap gap-2 mt-2 justify-center sm:justify-start">
                        <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs px-3 py-1.5 rounded-full border border-emerald-200 font-bold font-mono">
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          {file.name} ({(file.size / 1024).toFixed(1)} KB)
                        </div>
                        <div className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 text-xs px-3 py-1.5 rounded-full border border-indigo-200 font-bold">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                          अटो-डिटेक्टेड डेटा सुरु हुने पङ्क्ति (Start Row): Row {startRow} (स्वतः पहिचान गरिएको)
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Errors */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-2.5" id="upload-error">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-xs sm:text-sm font-bold">{error}</p>
            </div>
          )}

          {/* Upload Success Summary */}
          {uploadSummary && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-5 rounded-lg space-y-3" id="upload-summary-box">
              <h4 className="font-black text-sm sm:text-base text-emerald-800 flex items-center gap-1.5">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                फाइल सफलतापूर्वक आयात गरियो ! (Import Complete)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs sm:text-sm font-semibold">
                <div className="bg-white p-3 rounded border border-emerald-100 shadow-sm">
                  <span className="text-gray-500 block text-[10px] font-bold uppercase">फाइलको नाम (File Name)</span>
                  <strong className="text-slate-800 truncate block font-mono mt-0.5">{uploadSummary.fileName}</strong>
                </div>
                <div className="bg-white p-3 rounded border border-emerald-100 shadow-sm">
                  <span className="text-gray-500 block text-[10px] font-bold uppercase">कुल फेला परेका रेकर्डहरू</span>
                  <strong className="text-indigo-700 mt-0.5 block text-lg font-mono">{uploadSummary.recordsRead}</strong>
                </div>
                <div className="bg-white p-3 rounded border border-emerald-100 shadow-sm">
                  <span className="text-gray-500 block text-[10px] font-bold uppercase">नयाँ थपिएका (New Added)</span>
                  <strong className="text-emerald-700 mt-0.5 block text-lg font-mono">+{uploadSummary.newRecordsAdded}</strong>
                </div>
                <div className="bg-white p-3 rounded border border-emerald-100 shadow-sm">
                  <span className="text-gray-500 block text-[10px] font-bold uppercase">पहिले नै रहेका (Duplicates)</span>
                  <strong className="text-amber-600 mt-0.5 block text-lg font-mono">{uploadSummary.duplicateSkipped}</strong>
                </div>
                <div className="bg-white p-3 rounded border border-emerald-100 shadow-sm">
                  <span className="text-gray-500 block text-[10px] font-bold uppercase">अमान्य पङ्क्तिहरू (Invalid Rows)</span>
                  <strong className="text-red-600 mt-0.5 block text-lg font-mono">{uploadSummary.invalidRows}</strong>
                </div>
                <div className="bg-white p-3 rounded border border-emerald-100 shadow-sm">
                  <span className="text-gray-500 block text-[10px] font-bold uppercase">बेवास्ता गरिएका पङ्क्ति (Rows Ignored)</span>
                  <strong className="text-slate-600 mt-0.5 block text-lg font-mono">{uploadSummary.rowsIgnored}</strong>
                </div>
              </div>
            </div>
          )}

          {/* File Preview Table */}
          {previewRows.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-gray-100" id="preview-section">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                पङ्क्ति र कोलम प्रमाणीकरण पूर्वावलोकन (Import Preview Row {startRow} - {startRow + previewRows.length - 2}):
              </h4>
              <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                <table className="w-full text-xs text-left text-gray-700">
                  <thead className="bg-slate-100 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3 w-32">पङ्क्ति (Row)</th>
                      <th className="p-3 w-20">S.N.</th>
                      <th className="p-3">FULL NAME</th>
                      <th className="p-3 w-36">LICENSE NO.</th>
                      <th className="p-3 w-24">CATEGORY</th>
                      <th className="p-3 w-40">VISIT DATE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-sans">
                    {previewRows.map((row, idx) => {
                      const isHeaderRow = idx === 0;
                      const rowNum = isHeaderRow ? startRow - 1 : startRow + idx - 1;
                      const isFourCol = row && row.length <= 5;
                      const snVal = isFourCol ? (row[0] || "-") : (row[0] || row[1] || "-");
                      const nameVal = isFourCol ? (row[1] || "-") : (row[2] || "-");
                      const licenseVal = isFourCol ? (row[2] || "-") : (row[4] || "-");
                      const catVal = isFourCol ? (row.length >= 5 ? row[3] : "-") : (row[5] || "-");
                      const visitVal = isFourCol ? (row.length >= 5 ? row[4] : row[3]) : (row[8] || row[7] || "-");

                      return (
                        <tr key={idx} className={isHeaderRow ? "bg-amber-50 font-semibold" : "hover:bg-slate-50"}>
                          <td className="p-3 font-mono font-bold text-gray-400">
                            {isHeaderRow ? `Header (Row ${rowNum})` : `Data (Row ${rowNum})`}
                          </td>
                          <td className="p-3 font-mono">{snVal}</td>
                          <td className="p-3 font-bold truncate max-w-[200px]">{nameVal}</td>
                          <td className="p-3 font-mono font-bold text-indigo-700">{licenseVal}</td>
                          <td className="p-3 font-mono font-bold text-slate-700">{catVal}</td>
                          <td className="p-3 text-emerald-800 font-bold truncate max-w-[150px]">{visitVal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Submission Buttons */}
          {file && parsedData && (
            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
              <button
                onClick={() => {
                  setFile(null);
                  setParsedData(null);
                  setPreviewRows([]);
                  setError("");
                }}
                disabled={uploading}
                className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-bold text-gray-700 transition-all cursor-pointer"
                id="cancel-upload-btn"
              >
                रद्द गर्नुहोस् (Cancel)
              </button>
              <button
                onClick={handleUploadSubmit}
                disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
                id="submit-append-records-btn"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    प्रशोधन हुँदैछ... (Processing...)
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {uploadMode === "fresh_reload" ? "डाटाबेसमा नयाँ लोड गर्नुहोस् (FRESH RELOAD)" : "रेकर्डहरू थप्नुहोस् (APPEND RECORDS)"}
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Database Control and Recovery Hub */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6 mt-6" id="db-control-hub">
          <div className="space-y-1 pb-4 border-b border-gray-100">
            <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600 animate-pulse" />
              डाटाबेस व्यवस्थापन र रिकभरी नियन्त्रण केन्द्र (Database Control & Recovery)
            </h3>
            <p className="text-xs text-gray-500">
              लाइसेन्स रेकर्डहरू हराउन नदिन र सुरक्षाको लागि ४ आवश्यक एक्सन बटनहरू (4 instant database action tools)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Button 1: Sync Previous Loaded Data */}
            <div className="bg-slate-50 rounded-xl p-5 border border-gray-200 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5 uppercase tracking-wider inline-block">
                  Button 1: Live Database Alignment
                </span>
                <h4 className="font-extrabold text-sm text-slate-800 uppercase flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-600" />
                  पहिलेको डाटा सिंक र तथ्याङ्क मिलान
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  डेटाबेसमा भएका कुल रेकर्डहरू प्रत्यक्ष गणना गरी ड्यासबोर्ड र तथ्याङ्क तालीका दुरुस्त गराउँछ।
                </p>
              </div>

              {syncSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-[11px] font-semibold">
                  {syncSuccess}
                </div>
              )}
              {syncError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-[11px] font-semibold">
                  {syncError}
                </div>
              )}

              <button
                onClick={handleSyncReconcile}
                disabled={syncing}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    सिंक हुँदैछ...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    डाटा सिंक गर्नुहोस् (SYNC NOW)
                  </>
                )}
              </button>
            </div>

            {/* Buttons 2 & 3: Overwrite vs Append Modes */}
            <div className="bg-slate-50 rounded-xl p-5 border border-gray-200 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-0.5 uppercase tracking-wider inline-block">
                  Buttons 2 & 3: File Load Controls
                </span>
                <h4 className="font-extrabold text-sm text-slate-800 uppercase flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                  फाइल लोड गर्ने विधि सेटिङ (LOAD METHOD)
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  लाइसेन्स कार्ड लट अनुसार थप्न वा पुरानो पूरै डाटाबेस सफा गरि नयाँ फाइल राख्न छनौट गर्नुहोस्।
                </p>
                
                {/* Radio buttons for live selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    uploadMode === "append" 
                      ? "border-emerald-300 bg-emerald-50/50" 
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}>
                    <input 
                      type="radio" 
                      name="uploadMode" 
                      value="append" 
                      checked={uploadMode === "append"} 
                      onChange={() => setUploadMode("append")}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500" 
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">क्रमीक थप (Append lot-by-lot)</span>
                      <span className="text-[10px] text-gray-400 block font-normal leading-tight">लाइसेन्स थपिदै जान्छ। (Recommended)</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    uploadMode === "fresh_reload" 
                      ? "border-red-300 bg-red-50/50" 
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}>
                    <input 
                      type="radio" 
                      name="uploadMode" 
                      value="fresh_reload" 
                      checked={uploadMode === "fresh_reload"} 
                      onChange={() => {
                        if (window.confirm("चेतावनी: नयाँ सिट लोड गर्ने मोड छनौट गर्दा, अर्को फाइल अपलोड गर्दा पहिलेका सबै लाइसेन्स डेटा स्थायी रूपमा मेटिनेछन्। के तपाईं निश्चित हुनुहुन्छ?")) {
                          setUploadMode("fresh_reload");
                        }
                      }}
                      className="mt-0.5 text-red-600 focus:ring-red-500" 
                    />
                    <div>
                      <span className="text-xs font-bold text-red-800 block">सफा गरि लोड (Fresh Overwrite)</span>
                      <span className="text-[10px] text-gray-400 block font-normal leading-tight">पुरानो डाटाबेस पूरै मेटिन्छ।</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Instant action triggers to highlight the upload block above */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUploadMode("append");
                    const element = document.getElementById("excel-csv-file-picker");
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth" });
                      // Add highlight effect to file picker
                      const pickerBox = element.parentElement;
                      if (pickerBox) {
                        pickerBox.classList.add("ring-4", "ring-emerald-400");
                        setTimeout(() => pickerBox.classList.remove("ring-4", "ring-emerald-400"), 2000);
                      }
                    }
                  }}
                  className={`${role === "super_user" ? "w-1/2" : "w-full"} bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-[10px] sm:text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  नयाँ लट थप्नुहोस्
                </button>
                {role === "super_user" && (
                  <button
                    onClick={() => {
                      setIsResetModalOpen(true);
                      setResetConfirmationText("");
                      setResetError("");
                      setResetSuccess("");
                    }}
                    className="w-1/2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-[10px] sm:text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    डेटा रिसेट र नयाँ लोड
                  </button>
                )}
              </div>
            </div>

            {/* Button 4: Loss Prevention and Sudden Loss Date-Time Recovery Tool */}
            {role === "super_user" && (
              <div className="bg-slate-50 rounded-xl p-5 border border-gray-200 md:col-span-2 space-y-4 shadow-sm hover:shadow-md transition-all">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded px-2 py-0.5 uppercase tracking-wider inline-block">
                  Button 4: Security & Sudden Loss Recovery Panel
                </span>
                <h4 className="font-extrabold text-sm text-slate-800 uppercase flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-600" />
                  आकस्मिक डाटा रिकभरी नियन्त्रण (Sudden Loss Recovery Tool)
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  कुनै पनि समयमा डाटाबेस अचानक खाली भएमा वा डिलिट भएमा, अपलोड गरिएको मिति र समय दायरा (Date-Time Range) छनौट गरी आर्काइभ ब्याकअपबाट तत्काल पुन:स्थापना गर्नुहोस्।
                </p>
              </div>

              {recoverySuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-semibold">
                  {recoverySuccess}
                </div>
              )}
              {recoveryError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs font-semibold">
                  {recoveryError}
                </div>
              )}

              <form onSubmit={handleRecoverData} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">सुरु मिति</span>
                    <NepaliDatePicker
                      value={fromDateTime}
                      onChange={(val) => setFromDateTime(val)}
                      placeholder="YYYY/MM/DD"
                    />
                  </div>
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider self-end mb-2.5 px-1">TO</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">अन्तिम मिति</span>
                    <NepaliDatePicker
                      value={toDateTime}
                      onChange={(val) => setToDateTime(val)}
                      placeholder="YYYY/MM/DD"
                      isEndDate={true}
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-[180px] self-end mb-0.5">
                  <button
                    type="submit"
                    disabled={recovering}
                    className="w-full sm:w-auto px-5 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {recovering ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        डाटा रिकभर हुँदैछ...
                      </>
                    ) : (
                      <>
                        <History className="w-3.5 h-3.5" />
                        डाटा रिकभर गर्नुहोस् (RECOVER DATA)
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Quick time range presets */}
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <span className="font-bold text-gray-400 uppercase">छिटो चयन प्रिसिट (Quick Presets):</span>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                    setFromDateTime(new Date(oneHourAgo.getTime() - oneHourAgo.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                    setToDateTime(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 rounded border border-gray-200 hover:border-red-200 font-bold transition-all cursor-pointer"
                >
                  गत १ घण्टा (Last 1 Hour)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const startOfToday = new Date();
                    startOfToday.setHours(0,0,0,0);
                    setFromDateTime(new Date(startOfToday.getTime() - startOfToday.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                    setToDateTime(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 rounded border border-gray-200 hover:border-red-200 font-bold transition-all cursor-pointer"
                >
                  आजको दिन (Today)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const startOfYesterday = new Date();
                    startOfYesterday.setDate(now.getDate() - 1);
                    startOfYesterday.setHours(0,0,0,0);
                    const endOfYesterday = new Date();
                    endOfYesterday.setDate(now.getDate() - 1);
                    endOfYesterday.setHours(23,59,59,999);
                    setFromDateTime(new Date(startOfYesterday.getTime() - startOfYesterday.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                    setToDateTime(new Date(endOfYesterday.getTime() - endOfYesterday.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 rounded border border-gray-200 hover:border-red-200 font-bold transition-all cursor-pointer"
                >
                  हिजोको दिन (Yesterday)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(now.getDate() - 7);
                    setFromDateTime(new Date(sevenDaysAgo.getTime() - sevenDaysAgo.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                    setToDateTime(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 rounded border border-gray-200 hover:border-red-200 font-bold transition-all cursor-pointer"
                >
                  गत ७ दिन (Last 7 Days)
                </button>
              </div>
            </div>
            )}

          </div>
        </div>
          </>
        )}
          </>
        )}

        {/* User Management Tab Content */}
        {activeTab === "users" && role === "super_user" && (
          <div className="space-y-6" id="user-management-panel">
            {/* Success & Error messages */}
            {userError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {userError}
              </div>
            )}
            {userSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {userSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Form to create user */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                <div className="border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-indigo-600" />
                    नयाँ प्रयोगकर्ता थप्नुहोस् (Add New User)
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-1">सिस्टम प्रयोग गर्नका लागि नयाँ प्रयोगकर्ता खाता सिर्जना गर्नुहोस्।</p>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase block">युजरनेम वा इमेल (Username / Email)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-400 text-xs font-bold">@</span>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="tmo.staff@gmail.com वा staff"
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase block">पासवर्ड (Password)</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="पासवर्ड प्रविष्ट गर्नुहोस्"
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 uppercase block">भूमिका (Role)</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="super_user">Super User (पूर्ण नियन्त्रण)</option>
                      <option value="admin_user">Admin User (अपलोड र व्यवस्थापन)</option>
                      <option value="staff">Office Staff (सामान्य कर्मचारी)</option>
                      <option value="viewer">Viewer (अवलोकनकर्ता मात्र - Read Only)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {creatingUser ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        थपिँदैछ...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="w-3.5 h-3.5" />
                        खाता सिर्जना गर्नुहोस्
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* User List & Password Changer */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:col-span-2 space-y-4">
                <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-600" />
                      सञ्चालक प्रयोगकर्ता सूची (Current User Accounts)
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-1">यस प्रणालीमा पहुँच भएका दर्ता गरिएका कर्मचारी र सञ्चालकहरूको विवरण।</p>
                  </div>
                  <button 
                    onClick={loadUsers} 
                    disabled={loadingUsers}
                    className="p-1.5 hover:bg-gray-50 rounded border border-gray-100 text-gray-500 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {loadingUsers ? (
                  <div className="py-12 text-center text-xs font-semibold text-gray-400 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                    विवरणहरू लोड हुँदैछ...
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-12 text-center text-xs font-semibold text-gray-400 border border-dashed border-gray-200 rounded-xl">
                    कुनै प्रयोगकर्ता भेटिएन।
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                    <table className="w-full text-xs text-left text-gray-700">
                      <thead className="bg-slate-50 text-gray-600 font-bold border-b border-gray-200">
                        <tr>
                          <th className="p-3">युजरनेम / इमेल</th>
                          <th className="p-3">भूमिका (Role)</th>
                          <th className="p-3 text-right">कार्यहरू (Actions)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 font-sans">
                        {users.map((u, idx) => {
                          const isSelf = u.username.toLowerCase() === username.toLowerCase();
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-800">
                                {u.username}
                                {isSelf && (
                                  <span className="ml-1.5 text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded border">
                                    तपाईं आफैं (You)
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                {u.role === "super_user" ? (
                                  <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded">
                                    Super User
                                  </span>
                                ) : u.role === "admin_user" ? (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded">
                                    Admin
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                                    Staff
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEditingUser(u.username);
                                    setEditingPassword("");
                                    setUserError("");
                                    setUserSuccess("");
                                  }}
                                  className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded text-[10px] font-bold transition-all cursor-pointer"
                                >
                                  पासवर्ड फेर्नुहोस्
                                </button>
                                {!isSelf && (
                                  <button
                                    onClick={() => handleDeleteUser(u.username)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 rounded transition-all cursor-pointer"
                                    title="प्रयोगकर्ता हटाउनुहोस्"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Password Editing Sub-Panel for Super User */}
                {editingUser && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 mt-4" id="password-edit-panel">
                    <h4 className="text-xs font-black text-slate-800 uppercase flex items-center justify-between">
                      <span>पासवर्ड रिसेट: <strong className="text-indigo-600 font-mono text-[11px]">{editingUser}</strong></span>
                      <button 
                        onClick={() => setEditingUser(null)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 uppercase font-bold"
                      >
                        रद्द गर्नुहोस्
                      </button>
                    </h4>
                    <form onSubmit={handleChangeUserPassword} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={editingPassword}
                        onChange={(e) => setEditingPassword(e.target.value)}
                        placeholder="नयाँ पासवर्ड प्रविष्ट गर्नुहोस्"
                        className="flex-grow px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        required
                      />
                      <button
                        type="submit"
                        disabled={updatingPassword}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {updatingPassword ? (
                          <Loader2 className="w-3 animate-spin" />
                        ) : (
                          "सुरक्षित गर्नुहोस्"
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* My Password Tab Content */}
        {activeTab === "my_password" && (
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6" id="my-password-panel">
            <div className="border-b border-gray-100 pb-4">
              <h3 className="text-base font-black text-slate-800 uppercase flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                मेरो पासवर्ड परिवर्तन गर्नुहोस् (Change My Password)
              </h3>
              <p className="text-xs text-gray-500">तपाईंको खाता सुरक्षित राख्नका लागि नयाँ गोप्य पासवर्ड सेट गर्नुहोस्।</p>
            </div>

            {userError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {userError}
              </div>
            )}
            {userSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {userSuccess}
              </div>
            )}

            <form onSubmit={handleChangeMyPassword} className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-gray-400 block">तपाईंको युजरनेम:</span>
                <span className="text-xs font-black text-slate-700 bg-slate-50 px-3 py-1.5 rounded border border-slate-100 block font-mono">{username}</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 uppercase block">हालको पासवर्ड (Current Password)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="password"
                    value={myCurrentPassword}
                    onChange={(e) => setMyCurrentPassword(e.target.value)}
                    placeholder="हालको गोप्य पासवर्ड प्रविष्ट गर्नुहोस्"
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 uppercase block">नयाँ पासवर्ड (New Password)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="password"
                    value={myNewPassword}
                    onChange={(e) => setMyNewPassword(e.target.value)}
                    placeholder="नयाँ गोप्य पासवर्ड प्रविष्ट गर्नुहोस्"
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={changingMyPassword}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow"
              >
                {changingMyPassword ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    अपडेट हुँदैछ...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    नयाँ पासवर्ड सुरक्षित गर्नुहोस्
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Security Audit Logs Tab Content */}
        {activeTab === "audit" && role === "super_user" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6" id="security-audit-panel">
            <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  सुरक्षा अडिट लगहरू (Security & Audit Trail Logs)
                </h3>
                <p className="text-xs text-gray-500">प्रणालीमा गरिएका प्रशासनिक र सुरक्षा सम्बन्धी गतिविधिहरूको पूर्ण इतिहास (Audit Logs)</p>
              </div>
              <button
                onClick={loadAuditLogs}
                disabled={loadingAudit}
                className="flex items-center gap-2 text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-all font-bold cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingAudit ? "animate-spin" : ""}`} />
                ताजा गर्नुहोस् (Refresh Logs)
              </button>
            </div>

            {auditError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {auditError}
              </div>
            )}

            {loadingAudit ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="text-xs font-bold">अडिट लगहरू लोड हुँदैछ...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold">
                कुनै सुरक्षा अडिट लग फेला परेन। (No security logs found)
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-150 rounded-xl shadow-sm">
                <table className="w-full text-left border-collapse" id="audit-logs-table">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-150 text-gray-500 font-bold uppercase text-[10px] sm:text-[11px] font-sans">
                      <th className="px-4 py-3 font-black">मिति र समय (Timestamp)</th>
                      <th className="px-4 py-3 font-black">गतिविधि (Action)</th>
                      <th className="px-4 py-3 font-black">युजर (Username)</th>
                      <th className="px-4 py-3 font-black">आई.पी. (IP Address)</th>
                      <th className="px-4 py-3 font-black text-center">स्थिति (Status)</th>
                      <th className="px-4 py-3 font-black">विवरण (Details)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px] sm:text-xs font-sans font-medium text-slate-700">
                    {auditLogs.map((log) => {
                      const dateObj = new Date(log.timestamp);
                      const formattedTime = dateObj.toLocaleString();
                      
                      let statusBadgeColor = "bg-gray-100 text-gray-700";
                      if (log.status === "SUCCESS") statusBadgeColor = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                      if (log.status === "FAILED") statusBadgeColor = "bg-rose-50 text-rose-700 border border-rose-100";
                      if (log.status === "WARN") statusBadgeColor = "bg-amber-50 text-amber-700 border border-amber-100";

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-[11px] font-bold text-gray-500 whitespace-nowrap">{formattedTime}</td>
                          <td className="px-4 py-3 font-black text-slate-900 whitespace-nowrap">{log.action}</td>
                          <td className="px-4 py-3 font-mono text-[11px] font-bold text-gray-600">{log.username}</td>
                          <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{log.ip}</td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${statusBadgeColor}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-[10px] max-w-xs truncate" title={log.details}>
                            {log.details || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
          </>
        ) : (
          /* Render the search view inside the same <main> container! */
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-600" />
                लाइसेन्स कार्ड खोज (License Search Panel)
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                प्रिन्ट भएको स्मार्ट कार्ड कार्यालयमा उपलब्ध छ वा छैन सजिलै खोजी गर्नुहोस्।
              </p>
            </div>

            {/* Replicated Citizen Search Panel Card */}
            <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-gray-200/80 w-full text-center" id="admin-search-panel">
              <div className="mb-3.5 text-left bg-amber-50 border border-amber-200 text-amber-800 p-2.5 sm:p-3.5 rounded-md sm:rounded-lg text-[11px] sm:text-xs font-bold leading-relaxed">
                💡यस कार्यालयबाट नवीकरण (Renewal), नयाँ (New License), वर्ग थप (Category Add) तथा प्रतिलिपि (Duplicate) वापतको सेवा लिइएका कार्डहरू मात्र यहाँबाट खोज्नुहोला।
              </div>

              <form onSubmit={handleAdminSearch} className="space-y-3 sm:space-y-4" id="admin-search-form">
                <div className="flex flex-col text-left space-y-1 sm:space-y-1.5">
                  <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase">लाइसेन्स नम्बर प्रविष्ट गर्नुहोस् Enter License No: XX-XX-XXXXXXXX</label>
                  <div className="flex flex-col sm:flex-row gap-2" id="admin-search-input-group">
                    <input
                      type="text"
                      value={adminSearchLicenseNo}
                      onChange={(e) => setAdminSearchLicenseNo(e.target.value)}
                      placeholder=" Enter Your License No. (xx-xx-xxxxxxxx)"
                      className="flex-1 px-3 py-2.5 sm:px-4 sm:py-3.5 text-sm sm:text-base border-2 border-gray-300 rounded-lg outline-none focus:border-[#1e40af] text-center sm:text-left font-mono uppercase tracking-widest placeholder:text-gray-400 font-bold transition-all"
                      id="admin-license-input-field"
                      required
                    />
                    <button
                      type="submit"
                      disabled={adminSearchLoading}
                      className="bg-[#1d4ed8] hover:bg-[#1e40af] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-4 py-2.5 sm:px-6 sm:py-3 rounded-md sm:rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap text-xs sm:text-sm shadow-sm"
                      id="admin-license-search-btn"
                    >
                      {adminSearchLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          SEARCHING...
                        </>
                      ) : (
                        <>
                          <Search className="w-3.5 h-3.5" />
                          लाइसेन्स खोज्नुहोस्
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Search Result Display */}
              {adminSearchResult && adminSearchResult.searched && (
                <div className="mt-4 pt-4 sm:mt-6 sm:pt-6 border-t border-gray-100 transition-all text-left animate-fadeIn" id="admin-search-results-section">
                  {adminSearchResult.available && adminSearchResult.record ? (
                    /* SUCCESS: READY TO COLLECT */
                    <div className="bg-emerald-50 border border-emerald-300 rounded-lg sm:rounded-xl p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-sm" id="admin-result-available-card">
                      <div className="flex items-center gap-2 sm:gap-3 border-b border-emerald-200 pb-2.5 sm:pb-3">
                        <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-[#15803d] flex-shrink-0" />
                        <div>
                          <h3 className="text-xs sm:text-base font-black text-emerald-800">
                            लाइसेन्स कार्ड उपलब्ध छ (LICENSE AVAILABLE)
                          </h3>
                          <p className="text-[10px] sm:text-xs text-emerald-700 font-bold">
                            तपाईंको प्रिन्ट भएको स्मार्ट कार्ड कार्यालयमा आइपुगेको छ।
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-[11px] sm:text-sm">
                        <div className="bg-white p-2 sm:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center">
                          <span className="text-[10px] sm:text-xs text-black block uppercase font-bold">License Number / लाइसेन्स नं.</span>
                          <strong className="text-base sm:text-lg font-black text-black font-mono block mt-0.5">{adminSearchResult.record.licenseNo}</strong>
                        </div>
                        <div className="bg-white p-2 sm:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center">
                          <span className="text-[10px] sm:text-xs text-black block uppercase font-bold">Applicant Name / नाम</span>
                          <strong className="text-xs sm:text-sm font-black text-gray-800 uppercase block mt-0.5">{adminSearchResult.record.fullName}</strong>
                        </div>
                        <div className="bg-white p-2 sm:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center">
                          <span className="text-[10px] sm:text-xs text-black block uppercase font-bold">Category / वर्ग</span>
                          <strong className="text-xs sm:text-sm font-black text-gray-800 block mt-0.5">{adminSearchResult.record.category}</strong>
                        </div>
                        <div className="bg-white p-2 sm:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center">
                          <span className="text-[10px] sm:text-xs text-black block uppercase font-bold">VISITING DAY / कार्ड बुझिलिने दिन</span>
                          <strong className="text-xs sm:text-sm font-black text-black block mt-0.5 uppercase">{adminSearchResult.record.officeVisitDay || "N/A"}</strong>
                        </div>
                        <div className="bg-white p-3 sm:p-4 rounded-lg border border-emerald-200/60 shadow-sm col-span-1 sm:col-span-2 text-center space-y-2">
                          <div className="text-[11px] sm:text-sm font-extrabold text-emerald-800 leading-relaxed">
                            पुरानो सक्कल लाईसेन्स वा रसिद लिने ठाँउ (Collection Counter) कोठा नं. १६
                          </div>
                          <div className="border-t border-dashed border-emerald-200/70 pt-2 text-[11px] sm:text-sm font-extrabold text-[#1e40af] leading-relaxed">
                            स्मार्ट कार्ड वितरण काउन्टर (Distribution Counter) कोठा नं. १७
                          </div>
                          <div className="border-t border-dashed border-emerald-200/70 pt-2 text-[11px] sm:text-sm font-extrabold text-red-600 leading-relaxed">
                            स्मार्ट कार्ड लिन जाने दिन <span className="font-black text-red-700 font-mono text-sm uppercase">{adminSearchResult.record.officeVisitDay || "N/A"}</span> ।
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* FAILURE: NOT READY */
                    <div className="bg-red-50 border border-red-200 rounded-lg sm:rounded-xl p-3.5 sm:p-5 space-y-2.5 sm:space-y-3.5 shadow-sm" id="admin-result-not-available-card">
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="w-5 h-5 sm:w-6 sm:h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0 mt-0.5">
                          ✕
                        </div>
                        <div>
                          <h3 className="text-xs sm:text-base font-black text-red-800">
                            लाइसेन्स कार्ड फेला परेन (NOT READY YET)
                          </h3>
                          <p className="text-[10px] sm:text-xs text-red-700 font-bold mt-0.5 leading-relaxed">
                            {adminSearchResult.message || "तपाईंको प्रविष्ट गरिएको लाइसेन्स कार्ड हालसम्म कार्यालयमा प्राप्त भइसकेको छैन।"}
                          </p>
                        </div>
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-red-800 bg-white p-2.5 rounded-lg border border-red-200 font-semibold leading-relaxed">
                        प्रविष्ट नम्बर: <strong className="font-mono text-[11px] sm:text-xs text-gray-800">{adminSearchQuery}</strong> । हालै नवीकरण वा प्रयोगात्मक परीक्षा पास गर्नुभएको हो भने कार्ड प्रिन्ट भई कार्यालय आइपुग्न केही समय लाग्नेछ। कृपया केही दिनपछि पुनः खोज्नुहोला।
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Custom Database Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" id="reset-modal-overlay">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-lg overflow-hidden transform transition-all animate-scale-up" id="reset-modal-card">
            {/* Header */}
            <div className="bg-red-50 border-b border-red-100 px-6 py-5 flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-full text-red-600">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black text-red-950 uppercase">
                  डाटाबेस रिसेट र पूर्ण सफाइ (Database Reset)
                </h3>
                <p className="text-[10px] text-red-700/80 font-bold uppercase tracking-wider">Warning: Critical Action Required</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-700 leading-relaxed font-semibold">
                यो प्रक्रियाले <span className="text-red-600 font-extrabold">डाटाबेसका सबै रेकर्डहरू, अपलोड इतिहास र लट फाइलहरू</span> पूर्ण रूपमा मेटाउनेछ। यो कार्यलाई फिर्ता गर्न सकिँदैन (This action cannot be undone and will permanently wipe all uploaded license cards and upload ledgers).
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                <span className="text-[10px] font-extrabold text-amber-800 uppercase block tracking-wider">सुरक्षा निर्देशन (Safety Instruction):</span>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  अनपेक्षित रूप रूपमा डाटा डिलिट हुनबाट जोगाउन, कृपया तलको कोठामा <strong className="font-mono text-red-600 font-black">RESET</strong> टाइप गर्नुहोस्। त्यसपछि मात्र यो बटन सक्रिय हुनेछ।
                </p>
              </div>

              {/* Status Indicator */}
              {resetError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {resetError}
                </div>
              )}
              {resetSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {resetSuccess}
                </div>
              )}

              {/* Input Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase block">पुष्टि गर्न यहाँ 'RESET' लेख्नुहोस् (Type RESET to confirm):</label>
                <input
                  type="text"
                  value={resetConfirmationText}
                  onChange={(e) => setResetConfirmationText(e.target.value)}
                  placeholder="RESET"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-black font-mono focus:outline-none focus:ring-2 focus:ring-red-500 uppercase text-center tracking-widest placeholder-gray-300"
                  disabled={resetting}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="bg-slate-50 border-t border-gray-100 px-6 py-4 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                disabled={resetting}
                className="px-4 py-2 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                रद्द गर्नुहोस् (Cancel)
              </button>
              <button
                type="button"
                onClick={handleResetDatabase}
                disabled={resetting || resetConfirmationText.toUpperCase() !== "RESET"}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    डाटा रिसेट हुँदैछ...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    नयाँ रिसेट पुष्टि गर्नुहोस् (Confirm Reset)
                  </>
                )
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicates Viewer Modal */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" id="duplicates-modal-overlay">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-4xl overflow-hidden transform transition-all animate-scale-up flex flex-col max-h-[85vh]" id="duplicates-modal-card">
            {/* Header */}
            <div className="bg-rose-50 border-b border-rose-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-rose-100 p-2 rounded-full text-rose-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-rose-950 uppercase">
                    दोहोरो प्रविष्टि विवरण (Rejected Duplicate Records Details)
                  </h3>
                  <p className="text-[10px] text-rose-700/80 font-bold uppercase tracking-wider">
                    File: {duplicateModalFileName} | ID: {duplicateModalUploadId}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setDuplicateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-sans font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <p className="text-xs text-gray-700 leading-relaxed font-semibold bg-rose-50/50 p-3 rounded-lg border border-rose-100">
                यी रेकर्डहरू डेटाबेसमा पहिले नै उपलब्ध भएको वा अपलोड गरिएको फाइलभित्रै दोहोरिएको पाइएकाले प्रणालीले सुरक्षित रूपमा अस्वीकार (Reject) गरेको छ। हालको लाइसेन्स सूचीमा कुनै पनि पुरानो तथ्याङ्क बिग्रिएको वा दोहोरिएको छैन। (These records were skipped during upload because they are either duplicates within the uploaded file or already exist in the system's database. This keeps our registry clean).
              </p>

              {loadingDuplicates ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                  <p className="text-xs text-gray-500 font-bold">डेटा लोड हुँदैछ... (Loading duplicate details...)</p>
                </div>
              ) : duplicateError ? (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {duplicateError}
                </div>
              ) : duplicateRecords.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-xs font-semibold">
                  यस अपलोडमा कुनै पनि दोहोरिएका रेकर्डहरू फेला परेनन्। (No duplicate details are archived for this upload).
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Total duplicates summary banner */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-rose-50 border border-rose-200 p-4 rounded-xl shadow-sm text-rose-950">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-rose-100 text-rose-800 px-3 py-1.5 rounded-lg text-sm font-black font-mono">
                        {duplicateRecords.length}
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold">
                        जम्मा दोहोरो प्रविष्टि रेकर्ड फेला पर्यो (Total duplicate records found in this file)
                      </div>
                    </div>
                    <span className="text-[10px] sm:text-xs text-rose-700 font-bold bg-white/60 px-3 py-1 rounded-full border border-rose-200">
                      * हरफमा क्लिक गरी सिस्टमको पुराना रेकर्डसँग तुलना (Compare) हेर्नुहोस्
                    </span>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-left">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider text-center w-12">
                              S.N. <br /><span className="text-[10px] text-gray-400 font-medium">क्र.सं.</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-wider">
                              License No <br /><span className="text-[10px] text-gray-400 font-medium">लाइसेन्स नं.</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-wider">
                              Full Name <br /><span className="text-[10px] text-gray-400 font-medium">पूरा नाम</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-wider">
                              F/H Name <br /><span className="text-[10px] text-gray-400 font-medium">बाबु/पतिको नाम</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-wider text-center w-20">
                              Category <br /><span className="text-[10px] text-gray-400 font-medium">वर्ग</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-wider text-center w-24">
                              Visit Day <br /><span className="text-[10px] text-gray-400 font-medium">जाने दिन</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-wider">
                              Reason <br /><span className="text-[10px] text-gray-400 font-medium">अस्वीकृत कारण</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-wider text-center w-24">
                              Action <br /><span className="text-[10px] text-gray-400 font-medium">तुलना</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {duplicateRecords.map((rec, index) => {
                            const hasOriginal = !!rec.originalRecord;
                            const isExpanded = expandedDuplicateRow === index;
                            return (
                              <React.Fragment key={index}>
                                <tr 
                                  onClick={() => setExpandedDuplicateRow(isExpanded ? null : index)}
                                  className={`hover:bg-rose-50/30 cursor-pointer transition-colors ${isExpanded ? "bg-rose-50/40" : ""}`}
                                >
                                  <td className="px-4 py-3.5 text-center font-mono text-xs font-bold text-gray-500">
                                    {index + 1}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="font-mono text-rose-700 font-black text-xs sm:text-[13px] tracking-wide">
                                      {rec.licenseNo}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-xs font-black text-slate-800 uppercase">
                                    {rec.fullName}
                                  </td>
                                  <td className="px-4 py-3.5 text-xs font-bold text-slate-600 uppercase">
                                    {rec.fhName || "N/A"}
                                  </td>
                                  <td className="px-4 py-3.5 text-center">
                                    <span className="text-[10px] font-black bg-rose-50 border border-rose-100 text-rose-700 px-2.5 py-1 rounded-md uppercase">
                                      {rec.category || "N/A"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-center text-xs font-black text-amber-900">
                                    {rec.officeVisitDay || "N/A"}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="text-[10px] font-bold text-rose-800 bg-rose-50/70 border border-rose-100/50 px-2 py-0.5 rounded uppercase">
                                      {rec.rejectionReason || "Duplicate / दोहोरो"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-center">
                                    <button
                                      type="button"
                                      className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                                        isExpanded 
                                          ? "bg-rose-600 text-white" 
                                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                      }`}
                                    >
                                      {isExpanded ? "Close / बन्द" : "Compare / तुलना"}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expandable Detail / Side-by-Side Comparison */}
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={8} className="px-4 py-4 bg-slate-50/70 border-y border-rose-100/60">
                                      {hasOriginal ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-full">
                                          {/* Incoming Record Card */}
                                          <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
                                            <div className="absolute top-0 right-0 bg-rose-500 text-white text-[9px] font-black px-2.5 py-1 rounded-bl uppercase tracking-wider">
                                              Incoming (नयाँ / दोहोरो हरफ)
                                            </div>
                                            
                                            <div className="space-y-2">
                                              <h4 className="text-[11px] font-black text-rose-800 uppercase tracking-wider border-b border-rose-100 pb-1.5 mb-2">
                                                अपलोड गरिएको विवरण (Incoming Entry)
                                              </h4>
                                              <div className="grid grid-cols-3 gap-y-1.5 gap-x-2 text-xs font-semibold text-slate-700">
                                                <div className="text-slate-400 font-bold uppercase text-[9px]">लाइसेन्स नं (License No)</div>
                                                <div className="col-span-2 font-mono text-rose-700 font-black text-[13px] tracking-wide">{rec.licenseNo}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">आवेदकको नाम (Full Name)</div>
                                                <div className="col-span-2 text-slate-900 uppercase font-black">{rec.fullName}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">बाबु/पतिको नाम (F/H Name)</div>
                                                <div className="col-span-2 text-slate-800 uppercase">{rec.fhName || "N/A"}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">वर्ग (Category)</div>
                                                <div className="col-span-2 text-slate-900 font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded w-fit text-[10px]">{rec.category || "N/A"}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">जाने दिन (Visit Day)</div>
                                                <div className="col-span-2 text-amber-900 font-black">{rec.officeVisitDay || "N/A"}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">코드 नं (Code No)</div>
                                                <div className="col-span-2 text-slate-800 font-mono text-[11px]">{rec.codeNo || "N/A"}</div>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Existing Record Card */}
                                          <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
                                            <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-black px-2.5 py-1 rounded-bl uppercase tracking-wider">
                                              Database (पहिले देखि रहेको)
                                            </div>
                                            
                                            <div className="space-y-2">
                                              <h4 className="text-[11px] font-black text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1.5 mb-2">
                                                सिस्टममा रहेको विवरण (Existing Entry)
                                              </h4>
                                              <div className="grid grid-cols-3 gap-y-1.5 gap-x-2 text-xs font-semibold text-slate-700">
                                                <div className="text-slate-400 font-bold uppercase text-[9px]">लाइसेन्स नं (License No)</div>
                                                <div className="col-span-2 font-mono text-emerald-700 font-black text-[13px] tracking-wide">{rec.originalRecord.licenseNo}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">आवेदकको नाम (Full Name)</div>
                                                <div className="col-span-2 text-slate-900 uppercase font-black">{rec.originalRecord.fullName}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">बाबु/पतिको नाम (F/H Name)</div>
                                                <div className="col-span-2 text-slate-800 uppercase">{rec.originalRecord.fhName || rec.fhName || "N/A"}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">वर्ग (Category)</div>
                                                <div className="col-span-2 text-slate-900 font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded w-fit text-[10px]">{rec.originalRecord.category || "N/A"}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">जाने दिन (Visit Day)</div>
                                                <div className="col-span-2 text-emerald-900 font-black">{rec.originalRecord.officeVisitDay || "N/A"}</div>

                                                <div className="text-slate-400 font-bold uppercase text-[9px]">अपलोड स्रोत (Source/File)</div>
                                                <div className="col-span-2 text-slate-800 font-sans text-[11px] truncate">
                                                  {rec.originalRecord.source === "Same Upload File" ? (
                                                    <span className="text-blue-700 font-black">फाइल भित्रै अर्को हरफ (Same file)</span>
                                                  ) : (
                                                    <span className="text-emerald-700 font-black">डाटाबेस रेकर्ड (ID: {rec.originalRecord.uploadId})</span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm">
                                          <div className="text-[11px] font-black text-rose-800 uppercase tracking-wider border-b border-rose-100 pb-1.5 mb-3">
                                            थप विवरणहरू (Extended Details)
                                          </div>
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div className="text-xs font-semibold">
                                              <div className="text-gray-400 text-[10px] uppercase font-bold">लाइसेन्स नं. (License No)</div>
                                              <div className="font-mono text-rose-700 font-black text-sm">{rec.licenseNo}</div>
                                            </div>
                                            <div className="text-xs font-semibold">
                                              <div className="text-gray-400 text-[10px] uppercase font-bold">नाम (Full Name)</div>
                                              <div className="text-slate-900 uppercase font-black">{rec.fullName}</div>
                                            </div>
                                            <div className="text-xs font-semibold">
                                              <div className="text-gray-400 text-[10px] uppercase font-bold">बाबु/पतिको नाम (F/H Name)</div>
                                              <div className="text-slate-800 uppercase">{rec.fhName || "N/A"}</div>
                                            </div>
                                            <div className="text-xs font-semibold">
                                              <div className="text-gray-400 text-[10px] uppercase font-bold">वर्ग (Category)</div>
                                              <div className="text-slate-900 font-black bg-slate-100 px-2 py-0.5 rounded w-fit">{rec.category || "N/A"}</div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
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
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-gray-100 px-6 py-4 flex justify-end">
              <button
                type="button"
                onClick={() => setDuplicateModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black transition-all cursor-pointer shadow-sm"
              >
                बन्द गर्नुहोस् (Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center text-xs text-gray-400 font-semibold" id="admin-footer">
        © 2026 Transport Management Office, Itahari. Powered by PLSMS.
      </footer>
    </div>
  );
}
