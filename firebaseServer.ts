import { initializeApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc,
  query, 
  where, 
  writeBatch, 
  orderBy, 
  limit, 
  documentId,
  setLogLevel
} from "firebase/firestore";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
import fs from "fs";
import path from "path";

// Silence standard Firestore SDK logs
try {
  setLogLevel("silent");
} catch (e) {
  // Ignore error if any
}

// Monkey-patch console.error and console.warn to suppress noisy and harmless BloomFilterError
const originalConsoleError = console.error;
console.error = function (...args: any[]) {
  const msg = args.map(arg => String(arg)).join(" ");
  if (
    msg.includes("BloomFilter") || 
    msg.includes("BloomFilterError") || 
    msg.includes("Invalid hash count")
  ) {
    // Suppress harmless Firestore BloomFilter warning/error log
    return;
  }
  originalConsoleError.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = function (...args: any[]) {
  const msg = args.map(arg => String(arg)).join(" ");
  if (
    msg.includes("BloomFilter") || 
    msg.includes("BloomFilterError") || 
    msg.includes("Invalid hash count")
  ) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};


// Read Firebase configuration dynamically from the workspace
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let config: any;

try {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (error) {
  console.error("Failed to read firebase-applet-config.json:", error);
  config = {};
}

// Initialize Client SDK on the backend to bypass service account requirement
const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];

// Export Firestore with correct database ID from configuration
export const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

// Dedicated System Backend Authenticator
const auth = getAuth(app);
const SYSTEM_EMAIL = "system-backend@plsms.local";
const SYSTEM_PASSWORD = "PLSMS_Server_Secure_Key_2026_#" + config.projectId;

async function authenticateBackendSystem() {
  try {
    await signInWithEmailAndPassword(auth, SYSTEM_EMAIL, SYSTEM_PASSWORD);
    console.log("🔒 Backend Express Server authenticated successfully as system-backend@plsms.local");
  } catch (err: any) {
    if (
      err.code === "auth/user-not-found" || 
      err.code === "auth/invalid-credential" || 
      err.code === "auth/invalid-email" || 
      err.code === "auth/cannot-create-user"
    ) {
      try {
        await createUserWithEmailAndPassword(auth, SYSTEM_EMAIL, SYSTEM_PASSWORD);
        console.log("🔒 Created and authenticated backend system account: system-backend@plsms.local");
      } catch (createErr) {
        console.error("❌ Failed to auto-create backend system account in Firebase Auth:", createErr);
      }
    } else {
      console.error("❌ Backend authentication error:", err);
    }
  }
}

// Trigger backend service authentication asynchronously on startup
authenticateBackendSystem();

// Re-export standard firestore functions
export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  orderBy,
  limit,
  documentId
};

// Mock adminAuth since we are using client SDK on the backend
export const adminAuth = {
  verifyIdToken: async (token: string): Promise<any> => {
    // Standard Firebase Admin verifyIdToken throws if token is invalid or if it's not a real Firebase ID Token.
    // Since we are using our custom token login ("token_..."), this should throw so that server.ts falls back to the in-memory SESSIONS check.
    throw new Error("Using client-side Firebase SDK on server. Fallback to session token.");
  }
};

