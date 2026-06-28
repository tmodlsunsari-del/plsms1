export interface LicenseRecord {
  licenseNo: string;        // Normalized license number as document ID
  applicantId: string;
  fullName: string;
  fhName: string;
  category: string;
  codeNo: string;
  oldCode?: string;
  newCode?: string;
  officeVisitDay: string;
  receivedBy: string;
  status: "Available" | "Collected";
  roomNo?: string;
  remarks?: string;
  uploadId: string;
  createdAt: string;       // ISO timestamp
}

export interface UploadLedgerRecord {
  uploadId: string;
  fileName: string;
  fileType: string;
  totalRecords: number;
  newRecords: number;
  duplicateSkipped: number;
  uploadedBy: string;
  uploadDate: string;      // YYYY-MM-DD
  uploadTime: string;      // HH:mm:ss
}

export interface Announcement {
  id: string;
  text: string;
  date: string;
  active: boolean;
}

export interface CollectionInstructions {
  id: string;
  steps: string[];
}

export interface ImportSettings {
  id: string;
  defaultStartRow: number;
}
