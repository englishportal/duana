import React, { useState, useEffect } from "react";
import {
  Phone,
  User,
  AlertCircle,
  HelpCircle,
  Shield,
  Clock,
  Play,
  ArrowRight,
  Sparkles,
  PhoneCall,
  Lock,
  Moon,
  Sun,
  LayoutGrid,
  FileText,
  MessageSquare,
  Globe,
  MapPin,
  Mail,
  Facebook
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { getGlobalSettings } from "../services/settingsService";
import { getPublicActiveExams, getExamByCodeOrId } from "../services/examService";
import { registerOrResumeCandidate } from "../services/candidateService";

interface HomeViewProps {
  isDarkMode: boolean;
  onThemeToggle: () => void;
  onRegistered: (candidateData: any) => void;
  onAdminOpen: () => void;
}

export default function HomeView({
  isDarkMode,
  onThemeToggle,
  onRegistered,
  onAdminOpen,
}: HomeViewProps) {
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  
  const [error, setError] = useState("");
  const [pathError, setPathError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);

  // Dynamic exams and branding
  const [tests, setTests] = useState<any[]>([]);
  const [selectedTestId, setSelectedTestId] = useState("exam-test-1");
  const [isTestLocked, setIsTestLocked] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<any>({
    backgroundColor: "#002147",
    logoUrl: "",
    contactName: "Trung tâm Tiếng Anh Conquer English",
    contactPhone: "0912 345 678",
    contactEmail: "info@conquerenglish.edu.vn",
    contactZalo: "0912 345 678",
    contactFacebook: "https://facebook.com/conquerenglish",
    contactWebsite: "https://conquerenglish.edu.vn",
    contactAddress: "Số 123 Đường Cầu Giấy, Quận Cầu Giấy, Hà Nội"
  });

  useEffect(() => {
    // 1. Fetch system logo & branding background color & contact details
    getGlobalSettings()
      .then((data) => {
        setGlobalSettings(data);
      })
      .catch((err) => console.error("Error loading global settings:", err));

    // 2. Determine path-based routing
    const pathname = window.location.pathname;
    const examPathMatch = pathname.match(/^\/exam\/([a-zA-Z0-9_\-]+)$/);
    const pathExamCode = examPathMatch ? examPathMatch[1] : null;

    if (pathExamCode) {
      getExamByCodeOrId(pathExamCode)
        .then((exam) => {
          if (!exam) {
            setPathError("Kỳ thi không tồn tại hoặc đường dẫn không chính xác. Vui lòng kiểm tra lại.");
          } else if (exam.status !== "Đang mở") {
            setPathError("This exam is currently closed or has expired.");
          } else {
            setTests([exam]);
            setSelectedTestId(exam.id);
            setIsTestLocked(true);
          }
        })
        .catch((err) => {
          console.error("Error loading path-based exam:", err);
          setPathError("Không thể tải thông tin kỳ thi. Vui lòng thử lại sau.");
        });
    } else {
      // 3. Regular active tests load
      getPublicActiveExams()
        .then((data) => {
          setTests(data);
          
          // Fallback check for URL query parameters (e.g., ?test=test-4)
          const params = new URLSearchParams(window.location.search);
          const urlTestId = params.get("test");
          if (urlTestId) {
            const matched = data.find(
              (t: any) => t.id === urlTestId || t.code === urlTestId
            );
            if (matched) {
              setSelectedTestId(matched.id);
              setIsTestLocked(true);
            }
          }
        })
        .catch((err) => console.error("Error loading public tests:", err));
    }
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const name = fullName.trim();
    const phone = phoneNumber.trim();

    if (!name) {
      setError("Vui lòng nhập Họ và tên của bạn.");
      return;
    }
    if (!phone) {
      setError("Vui lòng nhập Số điện thoại của bạn.");
      return;
    }

    const phoneRegex = /^[0-9\s+-.]{9,15}$/;
    if (!phoneRegex.test(phone)) {
      setError("Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }

    setLoading(true);

    try {
      const result = await registerOrResumeCandidate(name, phone, selectedTestId);
      onRegistered(result.candidate);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  // Branding variables derived from settings
  const brandBgColor = globalSettings.backgroundColor || "#002147";
  const brandBgStyle = { backgroundColor: brandBgColor };
  const brandTextStyle = { color: brandBgColor };
  const brandBorderStyle = { borderColor: brandBgColor };

  const currentTestObj = tests.find((t) => t.id === selectedTestId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 text-slate-800 dark:text-slate-200 transition-colors duration-200 flex flex-col justify-between select-none">
      
      {/* 1. Header Navigation bar */}
      <nav className="max-w-7xl w-full mx-auto px-6 py-4 flex items-center justify-between border-b border-slate-150 dark:border-slate-800 bg-transparent">
        <div className="flex items-center gap-3">
          {globalSettings.logoUrl ? (
            <img
              src={globalSettings.logoUrl}
              alt="System Logo"
              className="h-9 w-auto rounded-lg object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="text-white p-2.5 rounded-xl font-extrabold text-sm tracking-widest shadow-sm"
              style={brandBgStyle}
            >
              EPT
            </div>
          )}
          <span className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100 uppercase tracking-tight">
            Placement Portal
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle isDarkMode={isDarkMode} onToggle={onThemeToggle} />
          
          <button
            onClick={onAdminOpen}
            id="go-to-admin-btn"
            className="p-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 flex items-center gap-1 hover:underline transition cursor-pointer"
          >
            <Lock size={13} />
            Admin
          </button>
        </div>
      </nav>

      {/* 2. Main content section */}
      <main className="max-w-5xl w-full mx-auto px-6 py-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left pane: Branding and instructions */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <span
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-55/10 border border-indigo-100 dark:border-indigo-900/40"
              style={{ color: brandBgColor, backgroundColor: `${brandBgColor}15` }}
            >
              <Sparkles size={12} className="animate-pulse" />
              {currentTestObj ? `${currentTestObj.category} Standard` : "English Assessment"}
            </span>
            <h1
              className="text-4xl sm:text-5xl font-black tracking-tight leading-none uppercase"
              style={brandTextStyle}
            >
              {currentTestObj ? currentTestObj.name : "ENGLISH PLACEMENT TEST"}
            </h1>
            <p className="text-md sm:text-lg text-indigo-600/90 dark:text-indigo-400 font-bold italic tracking-wide">
              &ldquo;Your English Journey Starts Here.&rdquo;
            </p>
          </div>

          {/* Danger / warning box */}
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500 rounded-2xl shadow-sm space-y-2">
            <h3 className="text-xs font-black tracking-wider text-red-600 dark:text-red-400 uppercase flex items-center gap-1">
              <AlertCircle size={15} />
              CẢNH BÁO AN NINH PHÒNG THI
            </h3>
            <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 leading-relaxed font-semibold">
              Thí sinh không được sử dụng từ điển, AI, công cụ dịch thuật hoặc nhờ người khác hỗ trợ. Nếu không biết đáp án, hãy bỏ qua và tiếp tục làm bài.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-2.5">
              <Clock size={16} className="text-indigo-500" style={brandTextStyle} />
              <span>Thời gian: {selectedTestId === "exam-test-1" ? "45 Phút" : "Tự do"}</span>
            </div>
            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-2.5">
              <Shield size={16} className="text-emerald-500" />
              <span>Chống gian lận tab-switch</span>
            </div>
          </div>
        </div>

        {/* Right pane: Candidate Registration Form */}
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
            {pathError ? (
              <div className="space-y-6 py-4 text-center">
                <div className="inline-flex p-4 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                  <AlertCircle size={40} className="animate-bounce" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-red-600 dark:text-red-400 uppercase tracking-tight">KỲ THI CHƯA SẴN SÀNG</h2>
                  <p className="text-sm font-medium text-slate-650 dark:text-slate-350 px-2 leading-relaxed">
                    {pathError}
                  </p>
                </div>
                
                <div className="border-t border-slate-100 dark:border-slate-800 pt-6 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">LIÊN HỆ QUẢN TRỊ VIÊN PHÒNG THI</p>
                  <button
                    type="button"
                    onClick={() => setShowTeacherModal(true)}
                    className="w-full py-3 px-5 border-2 font-bold text-sm rounded-xl transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                    style={{ borderColor: brandBgColor, color: brandBgColor }}
                  >
                    <PhoneCall size={14} />
                    THÔNG TIN LIÊN HỆ GIÁO VIÊN
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">ĐĂNG KÝ DỰ THI</h2>
                  <p className="text-xs text-slate-500">
                    Mỗi số điện thoại chỉ được thi 1 lần trên mỗi bài thi. Đăng ký đúng thông tin để tiếp tục bài thi đang dở.
                  </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Dynamic Test Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Bài thi tuyển sinh
                    </label>
                    {isTestLocked ? (
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center gap-2 text-sm font-semibold">
                        <FileText size={16} className="text-indigo-500" style={brandTextStyle} />
                        <span>{currentTestObj ? currentTestObj.name : selectedTestId} (Đang khóa theo link)</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <FileText size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                        <select
                          value={selectedTestId}
                          onChange={(e) => setSelectedTestId(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm appearance-none cursor-pointer font-medium"
                        >
                          {tests.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.category})
                            </option>
                          ))}
                          {tests.length === 0 && (
                            <option value="exam-test-1">Test 1 On The Go (IELTS)</option>
                          )}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-name" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Họ và tên thí sinh
                    </label>
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                      <input
                        id="reg-name"
                        type="text"
                        placeholder="Nhập đầy đủ Họ tên..."
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-phone" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Số điện thoại
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                      <input
                        id="reg-phone"
                        type="tel"
                        placeholder="Nhập số điện thoại dự thi..."
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-150 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold flex items-center gap-2 animate-shake">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      id="start-test-btn"
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 text-white font-bold text-sm rounded-xl shadow-md transition-all hover:scale-102 active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                      style={brandBgStyle}
                    >
                      {loading ? "Đang xử lý..." : "BẮT ĐẦU LÀM BÀI"}
                      <ArrowRight size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowTeacherModal(true)}
                      id="contact-teacher-btn"
                      className="py-3 px-5 border-2 font-bold text-sm rounded-xl transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 bg-transparent"
                      style={{ borderColor: brandBgColor, color: brandBgColor }}
                    >
                      <PhoneCall size={14} />
                      CONTACT TO TEACHER
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </main>

      {/* 3. Teacher Contact Modal dialog */}
      {showTeacherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setShowTeacherModal(false)}
          />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 w-full max-w-md space-y-4 animate-slide-in overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Phone size={18} className="text-indigo-600" style={brandTextStyle} />
              Thông tin liên hệ Giáo viên
            </h3>
            <p className="text-xs text-slate-500">
              Bạn có thể sử dụng các liên kết tương tác dưới đây để liên hệ trực tiếp với giáo viên quản lý phòng thi.
            </p>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-800/45 rounded-xl border border-slate-150 dark:border-slate-800 space-y-3">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ĐƠN VỊ / GIÁO VIÊN CHỦ QUẢN</p>
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">{globalSettings.contactName || "Conquer English Center"}</p>
              </div>
              {globalSettings.contactAddress && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <MapPin size={10} /> ĐỊA CHỈ
                  </p>
                  <p className="text-xs font-semibold text-slate-650 dark:text-slate-300 mt-0.5">{globalSettings.contactAddress}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Call */}
              <a
                href={`tel:${globalSettings.contactPhone || "0912 345 678"}`}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition text-center flex items-center justify-center gap-1.5"
              >
                <PhoneCall size={13} />
                Gọi Điện
              </a>
              {/* SMS */}
              <a
                href={`sms:${globalSettings.contactPhone || "0912 345 678"}`}
                className="py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition text-center flex items-center justify-center gap-1.5"
              >
                <MessageSquare size={13} />
                Gửi SMS
              </a>
              {/* Zalo */}
              <a
                href={`https://zalo.me/${globalSettings.contactZalo || globalSettings.contactPhone || "0912 345 678"}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition text-center flex items-center justify-center gap-1.5"
              >
                <Phone size={13} />
                Zalo Chat
              </a>
              {/* Email */}
              <a
                href={`mailto:${globalSettings.contactEmail || "info@conquerenglish.edu.vn"}`}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition text-center flex items-center justify-center gap-1.5"
              >
                <Mail size={13} />
                Gửi Email
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Facebook */}
              {globalSettings.contactFacebook && (
                <a
                  href={globalSettings.contactFacebook}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-4 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-xl transition text-center flex items-center justify-center gap-1.5"
                >
                  <Facebook size={13} />
                  Facebook
                </a>
              )}
              {/* Website */}
              {globalSettings.contactWebsite && (
                <a
                  href={globalSettings.contactWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition text-center flex items-center justify-center gap-1.5"
                >
                  <Globe size={13} />
                  Trang Web
                </a>
              )}
            </div>

            <button
              onClick={() => setShowTeacherModal(false)}
              id="teacher-close-btn"
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              ĐÓNG CỬA SỔ
            </button>
          </div>
        </div>
      )}

      {/* 4. Humble footer */}
      <footer className="text-center py-5 text-[11px] text-slate-400 font-medium">
        © 2026 Cambridge English Assessment Placement Engine. Developed for Vietnam Entrance Exams.
      </footer>
    </div>
  );
}
