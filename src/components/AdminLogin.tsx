import React, { useState } from "react";
import { ShieldAlert, Key, User, ArrowLeft, Loader2, Lock } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

interface AdminLoginProps {
  onLoginSuccess: (token: string, username: string, role: string) => void;
  onBack: () => void;
}

export default function AdminLogin({ onLoginSuccess, onBack }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and Password are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Direct Firebase Authentication from React frontend
      const email = username.includes("@") ? username.trim() : `${username.trim()}@gmail.com`;
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const idToken = await user.getIdToken();
      
      // Fetch role from Firestore adminUsers collection
      const userDocRef = doc(db, "adminUsers", user.email || username.trim());
      const userSnap = await getDoc(userDocRef);
      let role = "staff";
      if (userSnap.exists()) {
        role = userSnap.data().role || "staff";
      } else {
        // Fallback: Check if document ID matches prefix (e.g., if Firestore ID is "admin" but email is "admin@gmail.com")
        const prefix = (user.email || "").split("@")[0];
        const prefixDocRef = doc(db, "adminUsers", prefix);
        const prefixSnap = await getDoc(prefixDocRef);
        if (prefixSnap.exists()) {
          role = prefixSnap.data().role || "staff";
        }
      }

      onLoginSuccess(idToken, user.email || username.trim(), role);
    } catch (err: any) {
      console.error("Direct Firebase Authentication error:", err);
      let errMsg = "लगइन असफल भयो। युजरनेम वा पासवर्ड गलत छ।";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found" || err.code === "auth/invalid-email") {
        errMsg = "लगइन असफल भयो। युजरनेम वा पासवर्ड गलत छ। (Invalid email or password)";
      } else if (err.code === "auth/too-many-requests") {
        errMsg = "धेरै प्रयासहरू भएका छन्। कृपया केही समय पछि प्रयास गर्नुहोस्। (Too many attempts. Please try again later.)";
      } else {
        errMsg = `प्रमाणीकरण त्रुटि: ${err.message || err}`;
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col justify-center items-center p-4 font-sans text-gray-900" id="admin-login-container">
      {/* Back to Home Button */}
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-[#1e40af] hover:text-[#1d4ed8] font-bold bg-white px-4 py-2.5 rounded-[6px] shadow-sm border border-gray-200 transition-all cursor-pointer"
        id="back-to-home-btn"
      >
        <ArrowLeft className="w-4 h-4" />
        नागरिक खोज गृहपृष्ठ (Back to Citizen Search)
      </button>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-lg shadow-md border border-gray-200/60 overflow-hidden" id="login-card">
        {/* Top Header matching .gov-header */}
        <div className="bg-[#1e40af] p-6 text-white text-center border-b-4 border-[#dc2626]">
          <div className="w-12 h-12 bg-white/15 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">प्रशासकीय लगइन (Admin Portal)</h2>
          <p className="text-xs text-white/90 mt-1">यातायात व्यवस्था कार्यालय, स.चा.अ.प., इटहरी, सुनसरी</p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6" id="login-form" autoComplete="off">
          {error && (
            <div className="bg-[#fee2e2] border border-[#fecaca] text-[#991b1b] text-xs sm:text-sm p-3.5 rounded-md flex items-start gap-2.5" id="login-error-msg">
              <ShieldAlert className="w-5 h-5 text-[#991b1b] flex-shrink-0 mt-0.5" />
              <p className="font-semibold leading-relaxed">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Username field */}
            <div className="space-y-1.5 text-left">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#1e40af]" />
                युजरनेम / इमेल (Username / Email)
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="उदा. admin@gmail.com"
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-[6px] focus:outline-none focus:border-[#1e40af] focus:bg-white text-sm transition-all"
                id="username-field"
              />
            </div>

            {/* Password field */}
            <div className="space-y-1.5 text-left">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-[#1e40af]" />
                पासवर्ड (Password)
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="पासवर्ड प्रविष्ट गर्नुहोस्"
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-[6px] focus:outline-none focus:border-[#1e40af] focus:bg-white text-sm transition-all [text-security:disc] [-webkit-text-security:disc]"
                id="password-field"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1d4ed8] hover:bg-[#1e40af] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-[6px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all text-sm cursor-pointer uppercase"
            id="login-submit-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                लगइन हुँदैछ (Logging in...)
              </>
            ) : (
              "लगइन गर्नुहोस् (LOGIN)"
            )}
          </button>
        </form>

        {/* Helpful hints bottom banner */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            सुरक्षित लगइन कुञ्जी बिना यो प्रणाली पहुँच गर्न सकिँदैन। 
            <br />
            सहायताको लागि वितरण प्रणाली विभागमा सम्पर्क गर्नुहोस्।
          </p>
        </div>
      </div>
    </div>
  );
}
