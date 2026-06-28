import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { 
  db,
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
  adminAuth
} from "./firebaseServer.js";
import crypto from "crypto";

// Secure hashing using standard Node.js pbkdf2 with SHA-512 and random salt
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

// Verifies the password. Backward-compatible with plain-text passwords.
function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (!storedHash.includes(":")) {
    return password === storedHash;
  }
  const [salt, originalHash] = storedHash.split(":");
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return originalHash === testHash;
}

// Secure security audit logging helper
async function logSecurityEvent(
  action: string, 
  username: string, 
  ip: string, 
  status: "SUCCESS" | "FAILED" | "WARN", 
  details?: any
) {
  try {
    const logId = "log_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
    await setDoc(doc(db, "securityAuditLogs", logId), {
      id: logId,
      action,
      username,
      ip,
      status,
      details: details ? (typeof details === "string" ? details : JSON.stringify(details)) : "",
      timestamp: new Date().toISOString()
    });
    const statusText = status === "FAILED" ? "unsuccessful" : status.toLowerCase();
    console.log(`[SecurityLog] ${action} was ${statusText} for ${username} from ${ip}`);
  } catch (err) {
    console.error("Failed to write to securityAuditLogs:", err);
  }
}

const app = express();
const PORT = 3000;

// 1. Native HTTP Security Headers Middleware to prevent common clickjacking, injection, and sniffing attacks
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader(
    "Content-Security-Policy", 
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: referrer; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com; frame-ancestors 'self' https://*.google.com https://*.google.dev https://*.run.app https://ai.studio;"
  );
  next();
});

// 2. High-Performance Native In-Memory Rate Limiter to prevent DoS and brute-forcing
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const rateLimitStores = new Map<string, { count: number; resetTime: number }>();

function createRateLimiter(maxRequests: number, endpointName: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Treat the client IP address securely, resolving proxy forwarded headers
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
    const key = `${endpointName}:${ip}`;
    const now = Date.now();
    
    let rateData = rateLimitStores.get(key);
    if (!rateData || now > rateData.resetTime) {
      rateData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
    }
    
    rateData.count++;
    rateLimitStores.set(key, rateData);
    
    // Append standard Rate-Limiting HTTP headers
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - rateData.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(rateData.resetTime / 1000));
    
    if (rateData.count > maxRequests) {
      console.warn(`[SECURITY WARN] Rate limit exceeded for IP ${ip} on endpoint /api/${endpointName}`);
      logSecurityEvent(
        "RATE_LIMIT_EXCEEDED",
        "anonymous",
        ip,
        "WARN",
        { endpoint: endpointName, maxRequests }
      ).catch(() => {});

      return res.status(429).json({ 
        error: "धेरै प्रयासहरू (Too many requests). कृपया १५ मिनेट पछि पुनः प्रयास गर्नुहोस्।" 
      });
    }
    next();
  };
}

const searchRateLimiter = createRateLimiter(100, "search"); // Allow max 100 searches per 15 mins per IP
const loginRateLimiter = createRateLimiter(15, "login");    // Allow max 15 admin login attempts per 15 mins per IP

// Body parser middleware with generous limits for bulk uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Simple in-memory session store (safe for Cloud Run single container execution)
const SESSIONS = new Map<string, { username: string; role: string; expiresAt: number }>();
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to normalize license numbers (strips all non-alphanumeric characters for robust lookup)
function normalizeLicenseNo(licenseNo: string): string {
  if (!licenseNo) return "";
  return String(licenseNo).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Authentication Middleware
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  
  try {
    // Attempt verifying as Firebase ID Token
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uName = decodedToken.email || decodedToken.uid;
    (req as any).username = uName;
    
    // Fetch role from DB
    const userRef = doc(db, "adminUsers", uName);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      (req as any).role = userSnap.data().role || "staff";
    } else {
      (req as any).role = "staff";
    }
    next();
  } catch (verifyError) {
    // Fallback to local session store or Firestore persistent sessions
    let session = SESSIONS.get(token);
    
    if (!session) {
      try {
        const sessionRef = doc(db, "adminSessions", token);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const sData = sessionSnap.data();
          if (sData.expiresAt > Date.now()) {
            session = {
              username: sData.username,
              role: sData.role || "staff",
              expiresAt: sData.expiresAt
            };
            // Cache in memory for quick subsequent lookups
            SESSIONS.set(token, session);
          } else {
            // Deleted expired session from database
            await deleteDoc(sessionRef);
          }
        }
      } catch (dbErr) {
        console.error("Failed to lookup session in Firestore:", dbErr);
      }
    }

    if (!session || session.expiresAt < Date.now()) {
      if (session) SESSIONS.delete(token);
      return res.status(401).json({ error: "Session expired or invalid" });
    }
    (req as any).username = session.username;
    (req as any).role = session.role || "staff";
    next();
  }
}

// Seed Default Admin User & Settings on startup
async function seedDefaultConfig() {
  try {
    // Helper to securely create or migrate a user account
    const secureSetupUser = async (ref: any, snap: any, defaultPass: string, role: string) => {
      if (!snap.exists()) {
        await setDoc(ref, {
          username: ref.id,
          passwordHash: hashPassword(defaultPass),
          role: role
        });
        console.log(`Default user ${ref.id} seeded successfully with secure password hash`);
      } else {
        const data = snap.data();
        const currentHash = data.passwordHash || defaultPass;
        const currentRole = data.role || role;
        
        // If password is not cryptographically hashed (contains no ':'), secure it!
        if (!currentHash.includes(":")) {
          await setDoc(ref, {
            username: data.username || ref.id,
            passwordHash: hashPassword(currentHash),
            role: currentRole
          });
          console.log(`Successfully migrated user ${ref.id} password to secure cryptographic hash`);
        } else if (!data.role) {
          await setDoc(ref, { ...data, role: currentRole }, { merge: true });
        }
      }
    };

    // 1. Seed default admin users if they do not exist
    const adminRef = doc(db, "adminUsers", "tmodlsunsari@gmail.com");
    const adminSnap = await getDoc(adminRef);
    await secureSetupUser(adminRef, adminSnap, "Itahari@PLSMS2026", "super_user");

    const adminRef2 = doc(db, "adminUsers", "admin");
    const adminSnap2 = await getDoc(adminRef2);
    await secureSetupUser(adminRef2, adminSnap2, "admin123", "admin_user");

    const adminRef3 = doc(db, "adminUsers", "superadmin");
    const adminSnap3 = await getDoc(adminRef3);
    await secureSetupUser(adminRef3, adminSnap3, "admin123", "super_user");

    const adminRef4 = doc(db, "adminUsers", "staff");
    const adminSnap4 = await getDoc(adminRef4);
    await secureSetupUser(adminRef4, adminSnap4, "admin123", "staff");

    // 2. Seed default collection instructions if not exists
    const instRef = doc(db, "instructions", "collection_instructions");
    const instSnap = await getDoc(instRef);
    if (!instSnap.exists()) {
      await setDoc(instRef, {
        id: "collection_instructions",
        steps: [
          "नागरिकताको सक्कल प्रमाणपत्र र सवारी चालक अनुमति पत्र (नवीकरण भएमा पुरानो लाइसेन्स) साथमा लिएर आउनुहोस् ।",
          "राजस्व तिरेको सक्कल रसिद अनिवार्य रूपमा पेश गर्नुहोस् ।",
          "काउन्टर नम्बर २ मा गएर आफ्नो टोकन लिनुहोस् ।",
          "काउन्टर नम्बर ४ (वितरण शाखा) बाट आफ्नो नयाँ स्मार्ट कार्ड बुझिलिनुहोस् ।"
        ]
      });
      console.log("Default collection instructions seeded");
    }

    // 3. Seed default announcement if not exists
    const annRef = doc(db, "announcements", "default_announcement");
    const annSnap = await getDoc(annRef);
    if (!annSnap.exists()) {
      await setDoc(annRef, {
        id: "default_announcement",
        text: "📢 हाल कार्यालयमा २०८२/०४/१५ सम्म प्रिन्ट भएका लाइसेन्सहरू वितरणको लागि उपलब्ध छन् ।",
        date: new Date().toISOString().split("T")[0],
        active: true
      });
      console.log("Default announcement seeded");
    }

    // 4. Seed default import settings if not exists
    const setRef = doc(db, "settings", "import_settings");
    const setSnap = await getDoc(setRef);
    if (!setSnap.exists()) {
      await setDoc(setRef, {
        id: "import_settings",
        defaultStartRow: 5
      });
      console.log("Default import settings seeded");
    }

  } catch (error: any) {
    console.error("Error seeding default configurations:", error);
  }
}

// -------------------------------------------------------------
// PUBLIC API ENDPOINTS
// -------------------------------------------------------------

// Search Driving License (Public)
app.get("/api/search", searchRateLimiter, async (req, res) => {
  try {
    const { licenseNo } = req.query;
    if (!licenseNo) {
      return res.status(400).json({ error: "License number is required" });
    }

    const searchStr = normalizeLicenseNo(String(licenseNo));
    if (!searchStr) {
      return res.status(400).json({ error: "Invalid license number format" });
    }

    const q = query(
      collection(db, "licenses"),
      where("normalizedLicense", "==", searchStr)
    );
    const querySnap = await getDocs(q);

    if (!querySnap.empty) {
      const records: any[] = [];
      querySnap.forEach((doc) => {
        records.push(doc.data());
      });

      // Sort by latest first
      records.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      const primaryRecord = records[0];
      return res.json({
        available: true,
        record: {
          licenseNo: primaryRecord.licenseNo,
          applicantId: primaryRecord.applicantId,
          fullName: primaryRecord.fullName,
          fhName: primaryRecord.fhName,
          category: primaryRecord.category,
          codeNo: primaryRecord.codeNo,
          oldCode: primaryRecord.oldCode || "",
          newCode: primaryRecord.newCode || "",
          officeVisitDay: primaryRecord.officeVisitDay,
          receivedBy: primaryRecord.receivedBy,
          status: primaryRecord.status,
          roomNo: primaryRecord.roomNo || "वितरण काउन्टर (Distribution Counter)",
          remarks: primaryRecord.remarks || "उपलब्ध छ / Ready for collection",
          createdAt: primaryRecord.createdAt
        },
        records: records.map(rec => ({
          licenseNo: rec.licenseNo,
          applicantId: rec.applicantId,
          fullName: rec.fullName,
          fhName: rec.fhName,
          category: rec.category,
          codeNo: rec.codeNo,
          oldCode: rec.oldCode || "",
          newCode: rec.newCode || "",
          officeVisitDay: rec.officeVisitDay,
          receivedBy: rec.receivedBy,
          status: rec.status,
          roomNo: rec.roomNo || "वितरण काउन्टर (Distribution Counter)",
          remarks: rec.remarks || "उपलब्ध छ / Ready for collection",
          createdAt: rec.createdAt
        }))
      });
    } else {
      return res.json({
        available: false,
        message: "तपाईंको लाइसेन्स कार्ड हाल कार्यालयमा उपलब्ध छैन । कृपया केही दिनपछि पुनः खोज्नुहोस् ।"
      });
    }
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Internal server error during search" });
  }
});

// Get Active Announcements
app.get("/api/announcements", async (req, res) => {
  try {
    const q = query(collection(db, "announcements"));
    const querySnapshot = await getDocs(q);
    const announcements: any[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.active) {
        announcements.push(data);
      }
    });
    res.json(announcements);
  } catch (error: any) {
    console.error("Get announcements error:", error);
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

// Get Collection Instructions
app.get("/api/instructions", async (req, res) => {
  try {
    const docRef = doc(db, "instructions", "collection_instructions");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      res.json(docSnap.data());
    } else {
      res.status(404).json({ error: "Instructions not found" });
    }
  } catch (error: any) {
    console.error("Get instructions error:", error);
    res.status(500).json({ error: "Failed to fetch instructions" });
  }
});

// Get Settings (Start Row)
app.get("/api/settings", async (req, res) => {
  try {
    const docRef = doc(db, "settings", "import_settings");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      res.json(docSnap.data());
    } else {
      res.json({ defaultStartRow: 5 });
    }
  } catch (error) {
    res.json({ defaultStartRow: 5 });
  }
});


// -------------------------------------------------------------
// ADMIN API ENDPOINTS (PROTECTED EXCEPT LOGIN)
// -------------------------------------------------------------

// Admin Login
app.post("/api/admin/login", loginRateLimiter, async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
  let usernameToLog = "anonymous";
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      await logSecurityEvent("ADMIN_LOGIN", "anonymous", ip, "FAILED", { reason: "Missing username or password" });
      return res.status(400).json({ error: "Username and password are required" });
    }

    usernameToLog = String(username).trim();
    const inputLower = usernameToLog.toLowerCase();
    const inputPwd = password.trim();

    // Fetch all adminUsers from Firestore to find a flexible match
    const adminUsersSnap = await getDocs(collection(db, "adminUsers"));
    let matchedDoc: any = null;
    let matchedUsername = "";

    for (const d of adminUsersSnap.docs) {
      const data = d.data();
      const dbUsername = (data.username || d.id).trim();
      const dbLower = dbUsername.toLowerCase();

      // Check different match conditions:
      // 1. Direct case-insensitive match
      const directMatch = (dbLower === inputLower);

      // 2. Email first part / name match (e.g. "tmodlsunsari" matching "tmodlsunsari@gmail.com")
      let emailPrefixMatch = false;
      if (dbLower.includes("@")) {
        const prefix = dbLower.split("@")[0];
        if (prefix === inputLower) {
          emailPrefixMatch = true;
        }
      }

      // 3. User first name or generic part match
      let namePartMatch = false;
      const parts = dbLower.split(/[^a-zA-Z0-9]/);
      if (parts.length > 0 && parts[0] === inputLower) {
        namePartMatch = true;
      }

      if (directMatch || emailPrefixMatch || namePartMatch) {
        matchedDoc = data;
        matchedUsername = dbUsername;
        break;
      }
    }

    if (matchedDoc) {
      // Validate password securely using cryptographic pbkdf2 helper
      const expectedHash = matchedDoc.passwordHash;
      const isValidPassword = verifyPassword(inputPwd, expectedHash);

      if (isValidPassword) {
        // Login successful, generate a cryptographically secure, unpredictable session token
        const token = "token_" + crypto.randomBytes(32).toString("hex");
        const userRole = matchedDoc.role || "staff";
        const sessionData = {
          username: matchedUsername,
          role: userRole,
          expiresAt: Date.now() + SESSION_EXPIRY_MS
        };
        SESSIONS.set(token, sessionData);

        // Store persistently in Firestore
        try {
          await setDoc(doc(db, "adminSessions", token), sessionData);
        } catch (dbErr) {
          console.error("Failed to persist session to Firestore:", dbErr);
        }

        await logSecurityEvent("ADMIN_LOGIN", matchedUsername, ip, "SUCCESS", { role: userRole });

        return res.json({
          success: true,
          token: token,
          username: matchedUsername,
          role: userRole
        });
      }
    }

    await logSecurityEvent("ADMIN_LOGIN", usernameToLog, ip, "FAILED", { reason: "Invalid username or password" });
    return res.status(401).json({ error: "Invalid username or password" });
  } catch (error) {
    console.error("Login error:", error);
    await logSecurityEvent("ADMIN_LOGIN", usernameToLog, ip, "FAILED", { reason: "Internal server error" });
    res.status(500).json({ error: "Login failed due to server error" });
  }
});

// User Management: List all users (Only super_user allowed)
app.get("/api/admin/users", requireAuth, async (req, res) => {
  try {
    const requesterRole = (req as any).role;
    if (requesterRole !== "super_user") {
      return res.status(403).json({ error: "Forbidden: Only Super Users can manage user accounts" });
    }

    const usersSnap = await getDocs(collection(db, "adminUsers"));
    const users: any[] = [];
    usersSnap.forEach((doc) => {
      const data = doc.data();
      users.push({
        username: data.username || doc.id,
        role: data.role || "staff"
      });
    });

    res.json(users);
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ error: "Failed to fetch user accounts" });
  }
});

// Security Audit: Retrieve security event logs (Only super_user allowed)
app.get("/api/admin/audit-logs", requireAuth, async (req, res) => {
  try {
    const requesterRole = (req as any).role;
    if (requesterRole !== "super_user") {
      return res.status(403).json({ error: "Forbidden: Only Super Users can access security audit logs" });
    }

    const logsSnap = await getDocs(
      query(collection(db, "securityAuditLogs"), orderBy("timestamp", "desc"), limit(200))
    );
    const logs: any[] = [];
    logsSnap.forEach((doc) => {
      logs.push(doc.data());
    });

    res.json(logs);
  } catch (error) {
    console.error("Fetch audit logs error:", error);
    res.status(500).json({ error: "Failed to fetch security audit logs" });
  }
});

// User Management: Create new user (Only super_user allowed)
app.post("/api/admin/users/create", requireAuth, async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
  const requesterUsername = (req as any).username;
  try {
    const requesterRole = (req as any).role;
    if (requesterRole !== "super_user") {
      await logSecurityEvent("USER_CREATE", requesterUsername, ip, "FAILED", { reason: "Forbidden: Not Super User" });
      return res.status(403).json({ error: "Forbidden: Only Super Users can create accounts" });
    }

    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password, and role are required" });
    }

    const targetUsername = username.trim();
    if (!/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(targetUsername) && targetUsername.length < 3) {
      return res.status(400).json({ error: "Username must be a valid email or at least 3 characters long" });
    }

    const allowedRoles = ["super_user", "admin_user", "staff"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role specified" });
    }

    const userRef = doc(db, "adminUsers", targetUsername);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return res.status(409).json({ error: "User already exists with this username" });
    }

    await setDoc(userRef, {
      username: targetUsername,
      passwordHash: hashPassword(password), // Store password cryptographically hashed using PBKDF2
      role: role
    });

    await logSecurityEvent("USER_CREATE", requesterUsername, ip, "SUCCESS", { targetUser: targetUsername, role: role });

    res.json({ success: true, message: `User ${targetUsername} created successfully with role ${role}` });
  } catch (error) {
    console.error("Create user error:", error);
    await logSecurityEvent("USER_CREATE", requesterUsername, ip, "FAILED", { reason: "Internal server error" });
    res.status(500).json({ error: "Failed to create user account" });
  }
});

// User Management: Delete user (Only super_user allowed)
app.post("/api/admin/users/delete", requireAuth, async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
  const requesterUsername = (req as any).username;
  try {
    const requesterRole = (req as any).role;

    if (requesterRole !== "super_user") {
      await logSecurityEvent("USER_DELETE", requesterUsername, ip, "FAILED", { reason: "Forbidden: Not Super User" });
      return res.status(403).json({ error: "Forbidden: Only Super Users can delete accounts" });
    }

    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const targetUsername = username.trim();
    if (targetUsername.toLowerCase() === requesterUsername.toLowerCase()) {
      await logSecurityEvent("USER_DELETE", requesterUsername, ip, "FAILED", { reason: "Cannot delete self" });
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const userRef = doc(db, "adminUsers", targetUsername);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "User account not found" });
    }

    await deleteDoc(userRef);

    await logSecurityEvent("USER_DELETE", requesterUsername, ip, "SUCCESS", { targetUser: targetUsername });

    res.json({ success: true, message: `User ${targetUsername} deleted successfully` });
  } catch (error) {
    console.error("Delete user error:", error);
    await logSecurityEvent("USER_DELETE", requesterUsername, ip, "FAILED", { reason: "Internal server error" });
    res.status(500).json({ error: "Failed to delete user account" });
  }
});

// User Management: Change Password (Super User can change anyone's password; other users can change their own)
app.post("/api/admin/users/change-password", requireAuth, async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
  const requesterUsername = (req as any).username;
  try {
    const requesterRole = (req as any).role;

    const { username, currentPassword, newPassword } = req.body;
    if (!username || !newPassword) {
      return res.status(400).json({ error: "Username and new password are required" });
    }

    const targetUsername = username.trim();
    const isSelf = targetUsername.toLowerCase() === requesterUsername.toLowerCase();

    // Check permissions
    if (requesterRole !== "super_user" && !isSelf) {
      await logSecurityEvent("PASSWORD_CHANGE", requesterUsername, ip, "FAILED", { targetUser: targetUsername, isSelf, reason: "Forbidden: Access denied" });
      return res.status(403).json({ error: "Forbidden: You can only change your own password" });
    }

    const userRef = doc(db, "adminUsers", targetUsername);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "User account not found" });
    }

    const userData = userSnap.data();

    // Secure Verification: If a user is changing their own password, verify the current password first
    if (isSelf) {
      if (!currentPassword) {
        return res.status(400).json({ error: "हालको पासवर्ड आवश्यक छ (Current password is required)" });
      }
      const isCurrentPasswordCorrect = verifyPassword(currentPassword, userData.passwordHash);
      if (!isCurrentPasswordCorrect) {
        await logSecurityEvent("PASSWORD_CHANGE", requesterUsername, ip, "FAILED", { targetUser: targetUsername, isSelf, reason: "Incorrect current password" });
        return res.status(400).json({ error: "हालको पासवर्ड मिलेन। कृपया सही पासवर्ड राख्नुहोस् (Incorrect current password)" });
      }
    }

    await setDoc(userRef, {
      ...userData,
      passwordHash: hashPassword(newPassword)
    });

    await logSecurityEvent("PASSWORD_CHANGE", requesterUsername, ip, "SUCCESS", { targetUser: targetUsername, isSelf });

    res.json({ success: true, message: `Password for ${targetUsername} changed successfully` });
  } catch (error) {
    console.error("Change password error:", error);
    await logSecurityEvent("PASSWORD_CHANGE", requesterUsername, ip, "FAILED", { targetUser: req.body.username || "unknown", reason: "Internal server error" });
    res.status(500).json({ error: "Failed to change password" });
  }
});

// Admin Logout
app.post("/api/admin/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    SESSIONS.delete(token);
    try {
      await deleteDoc(doc(db, "adminSessions", token));
    } catch (dbErr) {
      console.error("Failed to delete session from Firestore:", dbErr);
    }
  }
  res.json({ success: true });
});

// Get Dashboard Statistics
app.get("/api/admin/dashboard", requireAuth, async (req, res) => {
  try {
    const licensesSnap = await getDocs(collection(db, "licenses"));
    const totalRecords = licensesSnap.size;
    
    let availableLicenses = 0;
    licensesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "Available" || !data.status) {
        availableLicenses++;
      }
    });

    const ledgersSnap = await getDocs(collection(db, "uploadLedgers"));
    const totalUploadFiles = ledgersSnap.size;

    let lastUploadDate = "N/A";
    ledgersSnap.forEach((doc) => {
      const d = doc.data();
      if (d.uploadDate && d.uploadDate > lastUploadDate) {
        lastUploadDate = d.uploadDate;
      }
    });

    const stats = {
      totalRecords: totalRecords,
      totalUploadFiles: totalUploadFiles,
      availableLicenses: availableLicenses,
      lastUploadDate: lastUploadDate
    };

    const statsRef = doc(db, "settings", "dashboard_statistics");
    await setDoc(statsRef, stats);

    res.json(stats);
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard statistics" });
  }
});

// Upload and Append License Records
app.post("/api/admin/upload", requireAuth, async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
  const username = (req as any).username;
  try {
    const { fileName, fileType, records, startRow, uploadMode } = req.body;

    if (!fileName || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: "Invalid upload structure" });
    }

    const uploadId = "upl_" + Date.now();
    const today = new Date();
    const uploadDate = today.toISOString().split("T")[0];
    const uploadTime = today.toTimeString().split(" ")[0];
    const backupTimestamp = today.toISOString();

    // Read start row parameter with robust server-side header row auto-detection
    let detectedStartRow = 5;
    if (startRow && Number(startRow) >= 1) {
      detectedStartRow = Number(startRow);
    } else {
      // Server-side header row discovery by scoring first 25 rows
      let bestRowIndex = -1;
      let maxScore = 0;
      for (let i = 0; i < Math.min(25, records.length); i++) {
        const row = records[i];
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

      if (bestRowIndex !== -1 && maxScore >= 1.5) {
        detectedStartRow = bestRowIndex + 2; // Header is at bestRowIndex, so data starts at bestRowIndex + 2 (1-based)
      }
    }

    const startIdx = detectedStartRow - 1; // 0-indexed index of first data row

    if (records.length <= startIdx) {
      return res.status(400).json({ error: `फायलमा पर्याप्त पङ्क्तिहरू छैनन्। (File contains fewer rows than the auto-detected start row ${detectedStartRow})` });
    }

    const rawHeaders = records[startIdx - 1] || [];
    const dataRows = records.slice(startIdx);

    // Initialize colIndices with default fallback indices
    let colIndices = {
      sn: -1,
      applicantId: -1,
      fullName: -1,
      fhName: -1,
      licenseNo: -1,
      category: -1,
      oldCode: -1,
      newCode: -1,
      officeVisitDay: -1,
      receivedBy: -1
    };

    // 1. DYNAMIC HEADER SEARCH based on string matching
    if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
      rawHeaders.forEach((header, idx) => {
        if (!header) return;
        const hStr = String(header).trim().toUpperCase();
        // Clean hStr to only contain alphanumeric characters, space and underscore
        const cleanStr = hStr.replace(/[^A-Z0-9\s_]/g, "").trim().replace(/\s+/g, " ");
        
        if (cleanStr === "SN" || cleanStr === "S N" || cleanStr === "S NO" || cleanStr === "S_N") {
          colIndices.sn = idx;
        } else if (cleanStr === "FULL NAME" || cleanStr === "NAME" || cleanStr === "APPLICANT NAME" || cleanStr === "APPLICANT_NAME" || cleanStr === "FULLNAME") {
          colIndices.fullName = idx;
        } else if (cleanStr === "LICENSE" || cleanStr === "LICENSE NO" || cleanStr === "LICENSE_NO" || cleanStr === "LICENSE NUMBER" || cleanStr === "LICENCE NO" || cleanStr === "LICENCE_NO" || cleanStr.startsWith("LICENSE NO") || cleanStr.startsWith("LICENCE NO")) {
          colIndices.licenseNo = idx;
        } else if (cleanStr === "CATEGORY" || cleanStr === "CAT" || cleanStr === "CLASS" || cleanStr === "CATEGORIES") {
          colIndices.category = idx;
        } else if (cleanStr === "VISIT DATE" || cleanStr === "VISIT DAY" || cleanStr === "VISIT_DATE" || cleanStr === "OFFICE VISIT DAY" || cleanStr === "VISIT_DAY" || cleanStr === "DAY" || cleanStr.includes("VISIT")) {
          colIndices.officeVisitDay = idx;
        } else if (cleanStr === "APPLICANT ID" || cleanStr === "APPLICANT_ID" || cleanStr === "ID") {
          colIndices.applicantId = idx;
        } else if (cleanStr === "FH NAME" || cleanStr === "F H NAME" || cleanStr === "FH_NAME" || cleanStr.includes("FATHER") || cleanStr.includes("HUSBAND")) {
          colIndices.fhName = idx;
        } else if (cleanStr.includes("OLD CODE")) {
          colIndices.oldCode = idx;
        } else if (cleanStr.includes("NEW CODE")) {
          colIndices.newCode = idx;
        } else if (cleanStr.includes("CODE") || cleanStr.includes("CODE NO")) {
          colIndices.oldCode = idx;
          colIndices.newCode = idx;
        } else if (cleanStr.includes("RECEIVED") || cleanStr.includes("RECEIVED BY")) {
          colIndices.receivedBy = idx;
        }
      });
    }

    // 2. DATA VALUE HEURISTICS (Find missing columns based on content patterns!)
    const sampleRow = dataRows.find(r => Array.isArray(r) && r.some(v => v !== null && v !== undefined && String(v).trim() !== ""));
    if (sampleRow) {
      // A. Detect License Number Column: has format like XX-XX-XXXX... or looks like "01-02-..."
      if (colIndices.licenseNo === -1) {
        for (let idx = 0; idx < sampleRow.length; idx++) {
          const val = String(sampleRow[idx] || "").trim();
          if (/^\d{2}-\d{2}-\d{4,12}$/.test(val) || /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/i.test(val)) {
            colIndices.licenseNo = idx;
            break;
          }
        }
      }

      // B. Detect Full Name Column: typically alphabetical strings with length >= 4
      if (colIndices.fullName === -1) {
        for (let idx = 0; idx < sampleRow.length; idx++) {
          if (idx === colIndices.sn || idx === colIndices.licenseNo) continue;
          const val = String(sampleRow[idx] || "").trim();
          if (/^[a-z\s.']{4,}$/i.test(val) && !/^\d+$/.test(val)) {
            colIndices.fullName = idx;
            break;
          }
        }
      }

      // C. Detect Category Column: very short (e.g. A, B, K, B, K)
      if (colIndices.category === -1) {
        for (let idx = 0; idx < sampleRow.length; idx++) {
          if (idx === colIndices.sn || idx === colIndices.licenseNo || idx === colIndices.fullName) continue;
          const val = String(sampleRow[idx] || "").trim();
          if (val.length >= 1 && val.length <= 6 && /^[a-z,\s]+$/i.test(val)) {
            colIndices.category = idx;
            break;
          }
        }
      }

      // D. Detect Office Visit Day Column: typical non-numeric strings
      if (colIndices.officeVisitDay === -1) {
        for (let idx = 0; idx < sampleRow.length; idx++) {
          if (idx === colIndices.sn || idx === colIndices.licenseNo || idx === colIndices.fullName || idx === colIndices.category) continue;
          const val = String(sampleRow[idx] || "").trim();
          if (val.length > 0) {
            colIndices.officeVisitDay = idx;
            break;
          }
        }
      }
    }

    // 3. STATISTICAL LAYOUT FALLBACKS (If heuristics or headers still didn't resolve critical columns)
    const maxCols = dataRows.length > 0 ? Math.max(...dataRows.map(r => r.length)) : 0;
    const isSimplifiedFormat = maxCols <= 5;

    if (isSimplifiedFormat) {
      // 4-column or 5-column simplified files
      if (colIndices.sn === -1) colIndices.sn = 0;
      if (colIndices.fullName === -1) colIndices.fullName = 1;
      if (colIndices.licenseNo === -1) colIndices.licenseNo = 2; // Always index 2
      if (colIndices.category === -1) colIndices.category = maxCols >= 5 ? 3 : -1; // -1 if 4-column
      if (colIndices.officeVisitDay === -1) colIndices.officeVisitDay = maxCols >= 5 ? 4 : 3; // Index 3 if 4-column, Index 4 if 5-column
    } else {
      // Standard full 10-column layout
      if (colIndices.sn === -1) colIndices.sn = 0;
      if (colIndices.applicantId === -1) colIndices.applicantId = 1;
      if (colIndices.fullName === -1) colIndices.fullName = 2;
      if (colIndices.fhName === -1) colIndices.fhName = 3;
      if (colIndices.licenseNo === -1) colIndices.licenseNo = 4;
      if (colIndices.category === -1) colIndices.category = 5;
      if (colIndices.oldCode === -1) colIndices.oldCode = 6;
      if (colIndices.newCode === -1) colIndices.newCode = 7;
      if (colIndices.officeVisitDay === -1) colIndices.officeVisitDay = 8;
      if (colIndices.receivedBy === -1) colIndices.receivedBy = 9;
    }

    const validRowsToInsert: any[] = [];
    const duplicateRecordsToSave: any[] = [];
    const internalSeenMap = new Map<string, any>();
    let invalidRowsCount = 0;
    let duplicateSkipped = 0;
    let totalRecordsCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row || !Array.isArray(row) || row.length === 0) {
        continue; // skip completely empty rows
      }

      // Check if the row is effectively empty (all columns null or empty string)
      const isRowEmpty = row.every(val => val === null || val === undefined || String(val).trim() === "");
      if (isRowEmpty) {
        continue;
      }

      totalRecordsCount++;

      const rawLicenseNo = row[colIndices.licenseNo];
      const fullName = row[colIndices.fullName];

      if (!rawLicenseNo || !fullName) {
        invalidRowsCount++;
        continue; // Must have License No and Applicant Name
      }

      const displayLicense = String(rawLicenseNo).trim().toUpperCase();
      const normLicense = normalizeLicenseNo(displayLicense);
      if (!normLicense) {
        invalidRowsCount++;
        continue;
      }

      // Extract and combine codes
      const oldVal = row[colIndices.oldCode] !== undefined && row[colIndices.oldCode] !== null ? String(row[colIndices.oldCode]).trim() : "";
      const newVal = row[colIndices.newCode] !== undefined && row[colIndices.newCode] !== null ? String(row[colIndices.newCode]).trim() : "";
      
      let finalCodeNo = "N/A";
      if (oldVal && newVal && oldVal !== newVal) {
        finalCodeNo = `${newVal} (Old: ${oldVal})`;
      } else if (newVal) {
        finalCodeNo = newVal;
      } else if (oldVal) {
        finalCodeNo = oldVal;
      }

      const displayCategory = row[colIndices.category] ? String(row[colIndices.category]).trim() : "N/A";
      const normCategory = displayCategory.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const uniqueKey = `${normLicense}_${normCategory}`;

      const currentRecordObj = {
        licenseNo: displayLicense,
        normalizedLicense: normLicense,
        applicantId: row[colIndices.applicantId] ? String(row[colIndices.applicantId]).trim() : `APP-${Math.floor(100000 + Math.random() * 900000)}`,
        fullName: String(fullName).trim().toUpperCase(),
        fhName: row[colIndices.fhName] ? String(row[colIndices.fhName]).trim() : "N/A",
        category: displayCategory,
        codeNo: finalCodeNo,
        oldCode: oldVal,
        newCode: newVal,
        officeVisitDay: row[colIndices.officeVisitDay] ? String(row[colIndices.officeVisitDay]).trim() : "N/A",
        receivedBy: row[colIndices.receivedBy] ? String(row[colIndices.receivedBy]).trim() : "N/A",
        status: "Available",
        uploadId: uploadId,
        createdAt: today.toISOString()
      };

      // Deduplicate inside the uploaded file itself using both license and category
      if (internalSeenMap.has(uniqueKey)) {
        duplicateSkipped++;
        const original = internalSeenMap.get(uniqueKey);
        duplicateRecordsToSave.push({
          ...currentRecordObj,
          rejectionReason: "Duplicate in the same file (फाइल भित्रै दोहोरिएको)",
          originalRecord: {
            licenseNo: original.licenseNo,
            fullName: original.fullName,
            category: original.category,
            officeVisitDay: original.officeVisitDay,
            uploadId: original.uploadId,
            createdAt: original.createdAt,
            source: "Same Upload File"
          }
        });
        continue; // Skip duplicate inside same file
      }
      internalSeenMap.set(uniqueKey, currentRecordObj);
      validRowsToInsert.push(currentRecordObj);
    }

    // If fresh reload, delete all live licenses first
    if (uploadMode === "fresh_reload") {
      console.log("FRESH RELOAD MODE: Purging live licenses collection...");
      const licensesSnap = await getDocs(collection(db, "licenses"));
      let deleteBatch = writeBatch(db);
      let dCount = 0;
      for (const d of licensesSnap.docs) {
        deleteBatch.delete(d.ref);
        dCount++;
        if (dCount % 500 === 0) {
          await deleteBatch.commit();
          deleteBatch = writeBatch(db);
        }
      }
      if (dCount % 500 !== 0) {
        await deleteBatch.commit();
      }
      console.log(`Successfully purged ${dCount} live license records for Fresh Overwrite.`);
    }

    // Now check database duplicates in chunks of 30
    let newRecordsAdded = 0;
    const finalRecordsToWrite: any[] = [];

    if (uploadMode === "fresh_reload") {
      validRowsToInsert.forEach(record => {
        finalRecordsToWrite.push(record);
        newRecordsAdded++;
      });
    } else {
      const CHUNK_SIZE = 30;
      for (let i = 0; i < validRowsToInsert.length; i += CHUNK_SIZE) {
        const chunk = validRowsToInsert.slice(i, i + CHUNK_SIZE);
        const chunkKeys = chunk.map(r => `${r.normalizedLicense}_${String(r.category || "N/A").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}`);

        // Firestore "in" query to find existing duplicates
        const licensesRef = collection(db, "licenses");
        const q = query(licensesRef, where(documentId(), "in", chunkKeys));
        const querySnap = await getDocs(q);

        const existingInDb = new Map<string, any>();
        querySnap.forEach((doc) => {
          existingInDb.set(doc.id, doc.data());
        });

        chunk.forEach(record => {
          const normCat = String(record.category || "N/A").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          const key = `${record.normalizedLicense}_${normCat}`;

          if (existingInDb.has(key)) {
            // It exists in the DB, but we write/overwrite it to make sure any updated fields (like class, visit date) are updated!
            finalRecordsToWrite.push(record);
            duplicateSkipped++;
            const dbRecord = existingInDb.get(key);
            duplicateRecordsToSave.push({
              ...record,
              rejectionReason: "Already exists in Database (डेटाबेसमा पहिले नै रहेको र अपडेट गरिएको)",
              originalRecord: {
                licenseNo: dbRecord.licenseNo,
                fullName: dbRecord.fullName,
                category: dbRecord.category,
                officeVisitDay: dbRecord.officeVisitDay,
                uploadId: dbRecord.uploadId || "previous",
                createdAt: dbRecord.createdAt,
                source: "Database"
              }
            });
          } else {
            finalRecordsToWrite.push(record);
            newRecordsAdded++;
          }
        });
      }
    }

    // Write new and updated records to Firestore in batches of 500
    const WRITE_BATCH_SIZE = 500;
    for (let i = 0; i < finalRecordsToWrite.length; i += WRITE_BATCH_SIZE) {
      const batch = writeBatch(db);
      const writeChunk = finalRecordsToWrite.slice(i, i + WRITE_BATCH_SIZE);
      
      writeChunk.forEach(record => {
        const normCat = String(record.category || "N/A").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        const docId = `${record.normalizedLicense}_${normCat}`;
        const docRef = doc(db, "licenses", docId);
        batch.set(docRef, record);
      });

      await batch.commit();
    }

    // WRITE SECURE ARCHIVAL COLD BACKUP LOGS (all parsed rows)
    // This allows recovery at any time even if live tables are lost!
    for (let i = 0; i < validRowsToInsert.length; i += WRITE_BATCH_SIZE) {
      const backupBatch = writeBatch(db);
      const backupChunk = validRowsToInsert.slice(i, i + WRITE_BATCH_SIZE);

      backupChunk.forEach(record => {
        // Unique backup doc ID per upload to preserve history!
        const bId = `bk_${record.licenseNo}_${uploadId}`;
        const backupRef = doc(db, "backupLogs", bId);
        backupBatch.set(backupRef, {
          ...record,
          backupId: bId,
          backupTimestamp: backupTimestamp,
          backedUpBy: username
        });
      });

      await backupBatch.commit();
    }

    // Write duplicate records to Firestore rejectedDuplicates collection in batches of 500
    for (let i = 0; i < duplicateRecordsToSave.length; i += WRITE_BATCH_SIZE) {
      const dupBatch = writeBatch(db);
      const dupChunk = duplicateRecordsToSave.slice(i, i + WRITE_BATCH_SIZE);

      dupChunk.forEach(record => {
        const dId = `dup_${record.normalizedLicense}_${uploadId}_${Math.floor(Math.random() * 100000)}`;
        const docRef = doc(db, "rejectedDuplicates", dId);
        dupBatch.set(docRef, record);
      });

      await dupBatch.commit();
    }

    // Save Upload History Ledger Entry
    const ledgerEntry = {
      uploadId: uploadId,
      fileName: fileName,
      fileType: fileType,
      totalRecords: totalRecordsCount,
      newRecords: newRecordsAdded,
      duplicateSkipped: duplicateSkipped,
      uploadedBy: username,
      uploadDate: uploadDate,
      uploadTime: uploadTime
    };

    await setDoc(doc(db, "uploadLedgers", uploadId), ledgerEntry);

    // Update real-time statistics metadata
    const statsRef = doc(db, "settings", "dashboard_statistics");
    const statsSnap = await getDoc(statsRef);
    let currentStats = {
      totalRecords: 0,
      totalUploadFiles: 0,
      availableLicenses: 0,
      lastUploadDate: uploadDate
    };

    if (statsSnap.exists() && uploadMode !== "fresh_reload") {
      const existingStats = statsSnap.data();
      currentStats = {
        totalRecords: (existingStats.totalRecords || 0) + newRecordsAdded,
        totalUploadFiles: (existingStats.totalUploadFiles || 0) + 1,
        availableLicenses: (existingStats.availableLicenses || 0) + newRecordsAdded,
        lastUploadDate: uploadDate
      };
    } else {
      currentStats = {
        totalRecords: newRecordsAdded,
        totalUploadFiles: uploadMode === "fresh_reload" ? 1 : 1,
        availableLicenses: newRecordsAdded,
        lastUploadDate: uploadDate
      };
    }
    await setDoc(statsRef, currentStats);

    await logSecurityEvent("DATABASE_UPLOAD", username, ip, "SUCCESS", { 
      fileName: fileName,
      recordsCount: totalRecordsCount, 
      uploadMode: uploadMode,
      newRecordsAdded: newRecordsAdded,
      duplicateSkipped: duplicateSkipped
    });

    return res.json({
      success: true,
      summary: {
        fileName: fileName,
        rowsIgnored: detectedStartRow - 1 <= 0 ? "None" : `1-${detectedStartRow - 1}`,
        recordsRead: totalRecordsCount,
        newRecordsAdded: newRecordsAdded,
        duplicateSkipped: duplicateSkipped,
        invalidRows: invalidRowsCount
      }
    });

  } catch (error) {
    console.error("Upload error:", error);
    await logSecurityEvent("DATABASE_UPLOAD", username, ip, "FAILED", { reason: "Internal server error" });
    res.status(500).json({ error: "Failed to process and upload records" });
  }
});

// Sync and Reconcile Live Data & Statistics (Calculates true counts)
app.post("/api/admin/sync-reconcile", requireAuth, async (req, res) => {
  try {
    console.log("Running Sync and Reconcile tool...");
    const licensesSnap = await getDocs(collection(db, "licenses"));
    const totalRecords = licensesSnap.size;
    
    let availableLicenses = 0;
    licensesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "Available" || !data.status) {
        availableLicenses++;
      }
    });

    const ledgersSnap = await getDocs(collection(db, "uploadLedgers"));
    const totalUploadFiles = ledgersSnap.size;

    let lastUploadDate = "N/A";
    ledgersSnap.forEach((doc) => {
      const d = doc.data();
      if (d.uploadDate && d.uploadDate > lastUploadDate) {
        lastUploadDate = d.uploadDate;
      }
    });

    // Save accurate, verified stats
    const statsRef = doc(db, "settings", "dashboard_statistics");
    const verifiedStats = {
      totalRecords,
      totalUploadFiles,
      availableLicenses,
      lastUploadDate
    };
    await setDoc(statsRef, verifiedStats);

    res.json({
      success: true,
      message: "डेटाबेस र तथ्याङ्क सफलतापूर्वक सिंक गरियो! (Database and stats reconciled successfully)",
      stats: verifiedStats
    });
  } catch (error: any) {
    console.error("Sync and reconcile error:", error);
    res.status(500).json({ error: "Failed to sync and reconcile database stats" });
  }
});

// Clear and Reset Database completely
app.post("/api/admin/reset-database", requireAuth, async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
  const username = (req as any).username;
  try {
    console.log("Starting a complete database purge and reset...");

    // 1. Delete all live licenses
    const licensesSnap = await getDocs(collection(db, "licenses"));
    let deleteBatch = writeBatch(db);
    let dCount = 0;
    for (const d of licensesSnap.docs) {
      deleteBatch.delete(d.ref);
      dCount++;
      if (dCount % 500 === 0) {
        await deleteBatch.commit();
        deleteBatch = writeBatch(db);
      }
    }
    if (dCount % 500 !== 0) {
      await deleteBatch.commit();
    }
    console.log(`Deleted ${dCount} live licenses.`);

    // 2. Delete all upload history / ledgers
    const ledgersSnap = await getDocs(collection(db, "uploadLedgers"));
    let ledgerDeleteBatch = writeBatch(db);
    let lCount = 0;
    for (const d of ledgersSnap.docs) {
      ledgerDeleteBatch.delete(d.ref);
      lCount++;
      if (lCount % 500 === 0) {
        await ledgerDeleteBatch.commit();
        ledgerDeleteBatch = writeBatch(db);
      }
    }
    if (lCount % 500 !== 0) {
      await ledgerDeleteBatch.commit();
    }
    console.log(`Deleted ${lCount} upload ledgers.`);

    // 3. Reset dashboard statistics to 0
    const statsRef = doc(db, "settings", "dashboard_statistics");
    const clearedStats = {
      totalRecords: 0,
      totalUploadFiles: 0,
      availableLicenses: 0,
      lastUploadDate: "N/A"
    };
    await setDoc(statsRef, clearedStats);

    console.log("Database reset complete.");
    await logSecurityEvent("DATABASE_RESET", username, ip, "SUCCESS", { deletedLicensesCount: dCount, deletedLedgersCount: lCount });

    res.json({
      success: true,
      message: "डाटाबेस र अपलोड इतिहास सफलतापूर्वक खाली गरियो! (Database and upload history successfully cleared and reset)",
      stats: clearedStats
    });
  } catch (error: any) {
    console.error("Database reset error:", error);
    await logSecurityEvent("DATABASE_RESET", username, ip, "FAILED", { reason: error.message || "Internal server error" });
    res.status(500).json({ error: "Failed to clear and reset the database" });
  }
});

// Date and Time Range Recovery from Archival Backups
app.post("/api/admin/recover", requireAuth, async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip").split(",")[0].trim();
  const username = (req as any).username;
  try {
    const { fromDateTime, toDateTime } = req.body;
    if (!fromDateTime || !toDateTime) {
      return res.status(400).json({ error: "From and To Date-Time ranges are required" });
    }

    console.log(`Attempting recovery between: ${fromDateTime} and ${toDateTime}`);

    // Fetch from backupLogs collection
    const backupRef = collection(db, "backupLogs");
    const q = query(
      backupRef,
      where("backupTimestamp", ">=", fromDateTime),
      where("backupTimestamp", "<=", toDateTime)
    );
    const backupSnap = await getDocs(q);

    if (backupSnap.empty) {
      await logSecurityEvent("DATABASE_RECOVER", username, ip, "FAILED", { reason: `No backup data found between ${fromDateTime} and ${toDateTime}` });
      return res.status(404).json({
        error: "तोकिएको समय दायरा भित्र कुनै ब्याकअप डाटा भेटिएन। (No backup data found in this range)"
      });
    }

    let restoredCount = 0;
    const recordsToRestore: any[] = [];

    backupSnap.forEach((docSnap) => {
      recordsToRestore.push(docSnap.data());
    });

    // Write them back to live licenses in batches of 500
    const WRITE_BATCH_SIZE = 500;
    for (let i = 0; i < recordsToRestore.length; i += WRITE_BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = recordsToRestore.slice(i, i + WRITE_BATCH_SIZE);

      chunk.forEach(bkRecord => {
        const liveRecord = {
          licenseNo: bkRecord.licenseNo,
          normalizedLicense: bkRecord.normalizedLicense || bkRecord.licenseNo,
          applicantId: bkRecord.applicantId,
          fullName: bkRecord.fullName,
          fhName: bkRecord.fhName || "N/A",
          category: bkRecord.category || "N/A",
          codeNo: bkRecord.codeNo || "N/A",
          oldCode: bkRecord.oldCode || "",
          newCode: bkRecord.newCode || "",
          officeVisitDay: bkRecord.officeVisitDay || "N/A",
          receivedBy: bkRecord.receivedBy || "N/A",
          status: bkRecord.status || "Available",
          uploadId: bkRecord.uploadId || "recovered",
          createdAt: bkRecord.createdAt || new Date().toISOString()
        };

        const normCat = String(bkRecord.category || "N/A").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        const docId = `${bkRecord.normalizedLicense || bkRecord.licenseNo}_${normCat}`;
        const liveDocRef = doc(db, "licenses", docId);
        batch.set(liveDocRef, liveRecord);
        restoredCount++;
      });

      await batch.commit();
    }

    // Trigger reconciliation automatically to recalculate dashboard statistics correctly
    const licensesSnap = await getDocs(collection(db, "licenses"));
    const totalRecords = licensesSnap.size;
    let availableLicenses = 0;
    licensesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "Available" || !data.status) {
        availableLicenses++;
      }
    });

    const statsRef = doc(db, "settings", "dashboard_statistics");
    await setDoc(statsRef, {
      totalRecords,
      availableLicenses,
      totalUploadFiles: (await getDocs(collection(db, "uploadLedgers"))).size,
      lastUploadDate: new Date().toISOString().split("T")[0]
    }, { merge: true });

    await logSecurityEvent("DATABASE_RECOVER", username, ip, "SUCCESS", { fromDateTime, toDateTime, restoredCount });

    res.json({
      success: true,
      restoredCount,
      message: `सफलतापूर्वक ${restoredCount} रेकर्डहरू ब्याकअपबाट पुनर्स्थापित गरियो र तथ्याङ्क सिंक गरियो! (Successfully restored ${restoredCount} records and synced statistics)`
    });
  } catch (error: any) {
    console.error("Recovery error:", error);
    await logSecurityEvent("DATABASE_RECOVER", username, ip, "FAILED", { reason: error.message || "Internal server error" });
    res.status(500).json({ error: "डेटा रिकभरी प्रक्रिया असफल भयो। (Recovery process failed)" });
  }
});

// Get Upload History Ledger
app.get("/api/admin/ledger", requireAuth, async (req, res) => {
  try {
    const q = query(collection(db, "uploadLedgers"), orderBy("uploadId", "desc"));
    const querySnapshot = await getDocs(q);
    const ledger: any[] = [];
    querySnapshot.forEach((doc) => {
      ledger.push(doc.data());
    });
    res.json(ledger);
  } catch (error) {
    console.error("Ledger error:", error);
    res.status(500).json({ error: "Failed to fetch upload ledger" });
  }
});

// Get Duplicates for a specific uploadId
app.get("/api/admin/ledger/:uploadId/duplicates", requireAuth, async (req, res) => {
  const { uploadId } = req.params;
  try {
    const q = query(
      collection(db, "rejectedDuplicates"),
      where("uploadId", "==", uploadId)
    );
    const querySnapshot = await getDocs(q);
    const duplicates: any[] = [];
    querySnapshot.forEach((doc) => {
      duplicates.push(doc.data());
    });
    duplicates.sort((a, b) => String(a.licenseNo).localeCompare(String(b.licenseNo)));
    res.json(duplicates);
  } catch (error) {
    console.error("Fetch duplicates error:", error);
    res.status(500).json({ error: "Failed to fetch duplicate records" });
  }
});

// Search & Filter Driving Licenses for Admin Panel (Manage View)
app.get("/api/admin/licenses", requireAuth, async (req, res) => {
  try {
    const { search, limitCount } = req.query;
    const limitVal = limitCount ? Number(limitCount) : 50;

    let licenses: any[] = [];

    if (search) {
      const searchStr = String(search).trim();
      const normalizedSearch = normalizeLicenseNo(searchStr);
      const searchUpper = searchStr.toUpperCase();

      // 1. Exact normalized license number search
      const docQuery = query(
        collection(db, "licenses"),
        where("normalizedLicense", "==", normalizedSearch),
        limit(limitVal)
      );

      // 2. Full Name prefix search
      const nameQuery = query(
        collection(db, "licenses"),
        where("fullName", ">=", searchUpper),
        where("fullName", "<=", searchUpper + "\uf8ff"),
        limit(limitVal)
      );

      const [docSnap, nameSnap] = await Promise.all([
        getDocs(docQuery),
        getDocs(nameQuery)
      ]);

      const seen = new Set<string>();

      docSnap.forEach((doc) => {
        const data = doc.data();
        if (data && data.licenseNo) {
          const normCat = String(data.category || "N/A").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          const key = `${data.normalizedLicense || data.licenseNo}_${normCat}`;
          if (!seen.has(key)) {
            licenses.push(data);
            seen.add(key);
          }
        }
      });

      nameSnap.forEach((doc) => {
        const data = doc.data();
        if (data && data.licenseNo) {
          const normCat = String(data.category || "N/A").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          const key = `${data.normalizedLicense || data.licenseNo}_${normCat}`;
          if (!seen.has(key)) {
            licenses.push(data);
            seen.add(key);
          }
        }
      });

      licenses = licenses.slice(0, limitVal);
    } else {
      // Return top recently added
      const q = query(collection(db, "licenses"), orderBy("createdAt", "desc"), limit(limitVal));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((doc) => {
        licenses.push(doc.data());
      });
    }

    res.json(licenses);
  } catch (error) {
    console.error("Admin licenses search error:", error);
    res.status(500).json({ error: "Failed to query license records" });
  }
});

// Update License Status (e.g. mark as Collected or Available)
app.post("/api/admin/licenses/update-status", requireAuth, async (req, res) => {
  try {
    const { licenseNo, status, category } = req.body;
    if (!licenseNo || !status) {
      return res.status(400).json({ error: "License number and status are required" });
    }

    const normLic = normalizeLicenseNo(licenseNo) || licenseNo;
    const normCat = category ? String(category).trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    
    let licenseRef;
    let oldData;

    if (normCat) {
      licenseRef = doc(db, "licenses", `${normLic}_${normCat}`);
      const snap = await getDoc(licenseRef);
      if (snap.exists()) {
        oldData = snap.data();
      }
    }

    if (!oldData) {
      // Try searching by normalizedLicense and updating all categories
      const q = query(
        collection(db, "licenses"),
        where("normalizedLicense", "==", normLic)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        // Try fallback direct lookup with licenseNo
        licenseRef = doc(db, "licenses", licenseNo);
        const fbSnap = await getDoc(licenseRef);
        if (!fbSnap.exists()) {
          return res.status(404).json({ error: "License record not found" });
        }
        oldData = fbSnap.data();
      } else {
        // Update all documents returned
        let oldStatus = "Available";
        const batch = writeBatch(db);
        snap.forEach(d => {
          const dData = d.data();
          oldStatus = dData.status;
          batch.set(d.ref, { ...dData, status: status }, { merge: true });
        });
        await batch.commit();

        // Update statistics metadata
        if (oldStatus !== status) {
          const statsRef = doc(db, "settings", "dashboard_statistics");
          const statsSnap = await getDoc(statsRef);
          if (statsSnap.exists()) {
            const stats = statsSnap.data();
            let availChange = 0;
            if (oldStatus === "Available" && status === "Collected") availChange = -snap.size;
            if (oldStatus === "Collected" && status === "Available") availChange = snap.size;

            await setDoc(statsRef, {
              ...stats,
              availableLicenses: Math.max(0, (stats.availableLicenses || 0) + availChange)
            }, { merge: true });
          }
        }
        return res.json({ success: true, message: `License status updated to ${status}` });
      }
    }

    if (oldData && licenseRef) {
      const oldStatus = oldData.status;
      await setDoc(licenseRef, { ...oldData, status: status }, { merge: true });

      // Update real-time statistics metadata
      if (oldStatus !== status) {
        const statsRef = doc(db, "settings", "dashboard_statistics");
        const statsSnap = await getDoc(statsRef);
        if (statsSnap.exists()) {
          const stats = statsSnap.data();
          let availChange = 0;
          if (oldStatus === "Available" && status === "Collected") availChange = -1;
          if (oldStatus === "Collected" && status === "Available") availChange = 1;

          await setDoc(statsRef, {
            ...stats,
            availableLicenses: Math.max(0, (stats.availableLicenses || 0) + availChange)
          }, { merge: true });
        }
      }
    }

    res.json({ success: true, message: `License status updated to ${status}` });
  } catch (error) {
    console.error("Status update error:", error);
    res.status(500).json({ error: "Failed to update license status" });
  }
});

// Add or Update Announcement
app.post("/api/admin/announcements", requireAuth, async (req, res) => {
  try {
    const { id, text, active } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Announcement text is required" });
    }

    const annId = id || "ann_" + Date.now();
    const announcement = {
      id: annId,
      text: text,
      date: new Date().toISOString().split("T")[0],
      active: active !== undefined ? active : true
    };

    await setDoc(doc(db, "announcements", annId), announcement);
    res.json({ success: true, announcement });
  } catch (error) {
    console.error("Update announcement error:", error);
    res.status(500).json({ error: "Failed to save announcement" });
  }
});

// Delete Announcement
app.delete("/api/admin/announcements/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // We can delete or set active = false. Let's delete.
    // In Express with standard Firebase Client SDK, we don't have direct deleteDoc in this scope unless we import it
    // Wait, let's write setDoc or we can use deleteDoc.
    // Let's import deleteDoc or just write setDoc with active: false to keep a record, which is safer!
    const annRef = doc(db, "announcements", id);
    await setDoc(annRef, { active: false }, { merge: true });
    res.json({ success: true, message: "Announcement deactivated successfully" });
  } catch (error) {
    console.error("Delete announcement error:", error);
    res.status(500).json({ error: "Failed to deactivate announcement" });
  }
});

// Update Collection Instructions
app.post("/api/admin/instructions", requireAuth, async (req, res) => {
  try {
    const { steps } = req.body;
    if (!steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: "Steps array is required" });
    }

    await setDoc(doc(db, "instructions", "collection_instructions"), {
      id: "collection_instructions",
      steps: steps.filter(step => step.trim() !== "")
    });

    res.json({ success: true, message: "Instructions updated successfully" });
  } catch (error) {
    console.error("Update instructions error:", error);
    res.status(500).json({ error: "Failed to update instructions" });
  }
});

// Update Import Settings
app.post("/api/admin/settings", requireAuth, async (req, res) => {
  try {
    const { defaultStartRow } = req.body;
    if (defaultStartRow === undefined || isNaN(Number(defaultStartRow))) {
      return res.status(400).json({ error: "Valid start row is required" });
    }

    await setDoc(doc(db, "settings", "import_settings"), {
      id: "import_settings",
      defaultStartRow: Number(defaultStartRow)
    });

    res.json({ success: true, message: "Import settings updated successfully" });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});


// -------------------------------------------------------------
// VITE DEV SERVER & PRODUCTION ROUTING SETUP
// -------------------------------------------------------------

// Boot configurations and Vite Middleware integration
async function startServer() {
  // Seed configurations
  await seedDefaultConfig();

  // Vite integration in Dev mode, Static Assets serving in Production mode
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static frontend files
    app.use(express.static(distPath));
    
    // Fallback everything else to SPA index.html
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PLSMS server running successfully on http://localhost:${PORT}`);
  });
}

startServer();
