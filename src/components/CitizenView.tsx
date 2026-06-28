import React, { useState } from "react";
import { Search, Loader2, CheckCircle, ShieldCheck, Info } from "lucide-react";

export default function CitizenView() {
  const [licenseNo, setLicenseNo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    searched: boolean;
    available: boolean;
    record?: any;
    records?: any[];
    message?: string;
  } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseNo.trim()) return;

    setLoading(true);
    setSearchQuery(licenseNo);
    try {
      const res = await fetch(`/api/search?licenseNo=${encodeURIComponent(licenseNo.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setResult({
          searched: true,
          available: data.available,
          record: data.record,
          records: data.records,
          message: data.message,
        });
      } else {
        setResult({
          searched: true,
          available: false,
          message: data.error || "खोज गर्दा त्रुटि देखा पर्यो।",
        });
      }
    } catch (err) {
      console.error(err);
      setResult({
        searched: true,
        available: false,
        message: "सर्भरसँग जडान हुन सकेन। कृपया इन्टरनेट जाँच गरी पुनः प्रयास गर्नुहोस्।",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col font-sans text-gray-900 animate-fadeIn w-full overflow-x-hidden" id="citizen-view-container">


      {/* Official Government Style Header */}
      <header className="bg-[#1e40af] text-white py-3.5 sm:py-6 px-3 sm:px-4 border-b-[4px] border-[#dc2626] shadow-sm w-full overflow-x-hidden" id="header">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-4 text-center px-2">
          <div className="w-10 h-10 xs:w-12 xs:h-12 sm:w-14 sm:h-14 bg-white rounded-full flex items-center justify-center shadow-md flex-shrink-0">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/2/23/Emblem_of_Nepal.svg" 
              alt="Gov Logo" 
              className="w-[28px] h-[28px] xs:w-[32px] xs:h-[32px] sm:w-[40px] sm:h-[40px] object-contain" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="text-center">
            <h1 className="my-0.5 text-xs xs:text-sm sm:text-lg md:text-2xl font-black text-white tracking-normal leading-tight text-center break-words px-1">यातायात व्यवस्था कार्यालय, सवारी चालक अनुमति पत्र</h1>
            <p className="text-[11px] xs:text-xs sm:text-base md:text-xl font-bold text-white/95 mt-0.5 tracking-wide text-center break-words px-1">ईटहरी, सुनसरी</p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-2xl w-full mx-auto p-3 xs:p-4 sm:p-6 flex flex-col gap-3.5 sm:gap-6 overflow-x-hidden" id="main-content">
        <div className="text-center -mb-1 px-1" id="system-title-above-search">
          <p className="text-[10px] xs:text-xs sm:text-sm font-black text-[#1e40af] tracking-wider sm:tracking-widest uppercase drop-shadow-sm break-words">
            PRINTED LICENSE SEARCH MANAGEMENT SYSTEM (PLSMS)
          </p>
        </div>

        {/* Search Panel Card */}
        <div className="bg-white p-3 xs:p-4 sm:p-8 rounded-lg sm:rounded-xl shadow-sm border border-gray-200/80 w-full text-center" id="search-panel">
          <div className="mb-3.5 text-left bg-amber-50 border border-amber-200 text-amber-800 p-2.5 xs:p-3 sm:p-3.5 rounded-md sm:rounded-lg text-[10px] xs:text-xs sm:text-sm font-bold leading-relaxed break-words w-full">
            💡यस कार्यालयबाट नवीकरण (Renewal), नयाँ (New License), वर्ग थप (Category Add) तथा प्रतिलिपि (Duplicate) वापतको सेवा लिइएका कार्डहरू मात्र यहाँबाट खोज्नुहोला।
          </div>

          <form onSubmit={handleSearch} className="space-y-3 sm:space-y-4" id="search-form">
            <div className="flex flex-col text-left space-y-1 sm:space-y-1.5 w-full">
              <label className="text-[9px] xs:text-[10px] sm:text-xs font-bold text-gray-500 uppercase leading-relaxed break-words">लाइसेन्स नम्बर प्रविष्ट गर्नुहोस् Enter License No: XX-XX-XXXXXXXX</label>
              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full" id="search-input-group">
                <input
                  type="text"
                  value={licenseNo}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  placeholder=" Enter Your License No. (xx-xx-xxxxxxxx)"
                  className="w-full sm:flex-1 px-3 py-3 sm:px-4 sm:py-3.5 text-sm sm:text-base border-2 border-gray-300 rounded-lg outline-none focus:border-[#1e40af] text-center sm:text-left font-mono uppercase tracking-widest placeholder:text-gray-400 placeholder:tracking-normal placeholder:font-sans placeholder:text-[11px] xs:placeholder:text-xs sm:placeholder:text-sm font-bold transition-all min-h-[48px]"
                  id="license-input-field"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto bg-[#1d4ed8] hover:bg-[#1e40af] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-4 py-3 sm:px-6 sm:py-3 rounded-md sm:rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap text-xs sm:text-sm shadow-sm min-h-[48px]"
                  id="license-search-btn"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      SEARCHING...
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      SEARCH (खोज्नुहोस्)
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {result && (
            <div className="mt-4 sm:mt-6 text-left border-t border-gray-200/80 pt-4 sm:pt-6 w-full" id="search-result-section">
              {result.available && (result.records || result.record) ? (
                /* SUCCESS: READY TO COLLECT */
                <div className="space-y-4 w-full" id="result-available-container">
                  {(result.records && result.records.length > 0 ? result.records : [result.record]).map((rec, cardIdx) => (
                    <div key={cardIdx} className="bg-emerald-50 border border-emerald-300 rounded-lg sm:rounded-xl p-3 xs:p-4 sm:p-5 space-y-3 sm:space-y-4 shadow-sm w-full" id={`result-available-card-${cardIdx}`}>
                      <div className="flex items-start gap-2.5 sm:gap-3 border-b border-emerald-200 pb-2.5 sm:pb-3">
                        <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-[#15803d] flex-shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-xs xs:text-sm sm:text-base font-black text-emerald-800 leading-snug break-words">
                            लाइसेन्स कार्ड उपलब्ध छ (LICENSE AVAILABLE)
                          </h3>
                          <p className="text-[10px] xs:text-xs sm:text-sm text-emerald-700 font-bold mt-0.5 leading-relaxed break-words">
                            तपाईंको प्रिन्ट भएको स्मार्ट कार्ड कार्यालयमा आइपुगेको छ। {result.records && result.records.length > 1 && `(कार्ड नम्बर #${cardIdx + 1})`}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-[11px] xs:text-xs sm:text-sm w-full">
                        <div className="bg-white p-2.5 xs:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center w-full break-words">
                          <span className="text-[9px] xs:text-[10px] sm:text-xs text-black block uppercase font-bold tracking-wide leading-relaxed">License Number / लाइसेन्स नं.</span>
                          <strong className="text-sm xs:text-base sm:text-lg font-black text-black font-mono block mt-0.5 break-all">{rec.licenseNo}</strong>
                        </div>
                        <div className="bg-white p-2.5 xs:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center w-full break-words">
                          <span className="text-[9px] xs:text-[10px] sm:text-xs text-black block uppercase font-bold tracking-wide leading-relaxed">Applicant Name / नाम</span>
                          <strong className="text-xs xs:text-sm font-black text-gray-800 uppercase block mt-0.5 break-words">{rec.fullName}</strong>
                        </div>
                        <div className="bg-white p-2.5 xs:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center w-full break-words">
                          <span className="text-[9px] xs:text-[10px] sm:text-xs text-black block uppercase font-bold tracking-wide leading-relaxed">Category / वर्ग</span>
                          <strong className="text-xs xs:text-sm font-black text-gray-800 block mt-0.5 break-words">{rec.category}</strong>
                        </div>
                        <div className="bg-white p-2.5 xs:p-3 rounded-lg border border-emerald-200/60 shadow-sm text-center w-full break-words">
                          <span className="text-[9px] xs:text-[10px] sm:text-xs text-black block uppercase font-bold tracking-wide leading-relaxed">VISITING DAY / कार्ड बुझिलिने दिन</span>
                          <strong className="text-xs xs:text-sm font-black text-black block mt-0.5 uppercase break-words">{rec.officeVisitDay || "N/A"}</strong>
                        </div>
                        <div className="bg-white p-3 xs:p-4 sm:p-5 rounded-lg border border-emerald-200/60 shadow-sm col-span-1 sm:col-span-2 text-center space-y-2.5 w-full break-words">
                          <div className="text-[10px] xs:text-xs sm:text-sm font-extrabold text-emerald-800 leading-relaxed break-words">
                            पुरानो सक्कल लाईसेन्स वा रसिद लिने ठाँउ (Collection Counter) कोठा नं. १६
                          </div>
                          <div className="border-t border-dashed border-emerald-200/70 pt-2 text-[10px] xs:text-xs sm:text-sm font-extrabold text-[#1e40af] leading-relaxed break-words">
                            स्मार्ट कार्ड वितरण काउन्टर (Distribution Counter) कोठा नं. १७
                          </div>
                          <div className="border-t border-dashed border-emerald-200/70 pt-2 text-[10px] xs:text-xs sm:text-sm font-extrabold text-red-600 leading-relaxed break-words">
                            स्मार्ट कार्ड लिन जाने दिन <span className="font-black text-red-700 font-mono text-xs xs:text-sm uppercase break-words">{rec.officeVisitDay || "N/A"}</span> ।
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* FAILURE: NOT READY */
                <div className="bg-red-50 border border-red-200 rounded-lg sm:rounded-xl p-3 xs:p-4 sm:p-5 space-y-2.5 sm:space-y-3.5 shadow-sm w-full" id="result-not-available-card">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-red-600 text-white rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] sm:text-xs font-bold">
                      ✕
                    </div>
                    <div>
                      <h3 className="text-xs xs:text-sm sm:text-base font-black text-red-800 leading-snug break-words">
                        लाइसेन्स कार्ड फेला परेन (NOT READY YET)
                      </h3>
                      <p className="text-[10px] xs:text-xs sm:text-sm text-red-700 font-bold mt-0.5 leading-relaxed break-words">
                        {result.message || "तपाईंको प्रविष्ट गरिएको लाइसेन्स कार्ड हालसम्म कार्यालयमा प्राप्त भइसकेको छैन।"}
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] xs:text-xs sm:text-sm text-red-800 bg-white p-2.5 rounded-lg border border-red-200 font-semibold leading-relaxed break-words w-full">
                    प्रविष्ट नम्बर: <strong className="font-mono text-[11px] xs:text-xs sm:text-sm text-gray-800 break-all">{searchQuery}</strong> । हालै नवीकरण वा प्रयोगात्मक परीक्षा पास गर्नुभएको हो भने कार्ड प्रिन्ट भई कार्यालय आइपुग्न केही समय लाग्नेछ। कृपया केही दिनपछि पुनः खोज्नुहोला।
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Static Collection Guidelines for Mobile Users */}
        <div className="bg-emerald-50 border border-emerald-200 p-3.5 xs:p-5 sm:p-6 rounded-lg sm:rounded-xl text-left w-full" id="instructions-section">
          <h3 className="text-[#15803d] font-black text-xs xs:text-sm sm:text-base border-b border-emerald-200 pb-2 mb-2.5 flex items-center gap-1.5 uppercase break-words">
            <ShieldCheck className="w-4 h-4 xs:w-4.5 xs:h-4.5 text-[#15803d] flex-shrink-0" />
            लाइसेन्स कार्ड बुझ्न आउँदा ल्याउनुपर्ने कागजातहरू:
          </h3>
          <ul className="list-disc pl-4 sm:pl-5 space-y-1.5 sm:space-y-2 text-[#166534] text-[10px] xs:text-xs sm:text-sm font-semibold w-full" id="guidelines-list">
            <li className="leading-relaxed break-words">लाईसेन्स वापतको राजस्व बुझाएको सक्कल रसिद (Original Receipt Bill).</li>
            <li className="leading-relaxed break-words">सक्कल लाईसेन्स वा राजस्व बुझाएको सक्कल रसिद हराएको/नासिएको हकमा ट्राफिक कार्यालयको सिफारिस पत्र ।</li>
            <li className="leading-relaxed break-words">अनलाइन भुक्तानी गरेको भए सोको प्रिन्ट प्रतिलिपि (Online Payment Receipt).</li>
            <li className="leading-relaxed break-words">अन्य व्यक्तिले बुझिलिने भएमा सम्बन्धित व्यक्तिको मन्जुरीनामा र नागरिकता कपी।</li>
            <li className="leading-relaxed break-words">कार्ड वितरण कार्यको लागि सक्कल रसिद लिने समय: सोमबार देखि शुक्रबार (बिहान ९:३० देखि दिउँसो ४:०० सम्म)।</li>
          </ul>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="text-center py-4 border-t border-gray-200 text-gray-400 text-[10px] sm:text-[11px] font-bold w-full max-w-2xl mx-auto mt-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 px-4" id="footer">
        <div>
          © 2026 Transport Management Office, Itahari Sunsari.
        </div>
      </footer>
    </div>
  );
}
