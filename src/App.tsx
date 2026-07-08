import { useState, useEffect } from "react";
import HomeView from "./components/HomeView";
import PlacementTest from "./components/PlacementTest";
import ResultView from "./components/ResultView";
import AdminPanel from "./components/AdminPanel";
import { Language, translations } from "./locales";
import { Globe, X } from "lucide-react";

enum ViewState {
  HOME = "home",
  TEST = "test",
  RESULT = "result",
  ADMIN = "admin"
}

export default function App() {
  const [view, setView] = useState<ViewState>(ViewState.HOME);
  const [candidate, setCandidate] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    // Read initial preference
    const saved = localStorage.getItem("theme");
    return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("lang");
    return (saved === "vi" || saved === "en") ? (saved as Language) : "vi";
  });

  const [showLangNotice, setShowLangNotice] = useState<boolean>(() => {
    return !localStorage.getItem("lang");
  });

  // Keep HTML class in sync for Tailwind's "dark" selector
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const handleLanguageChange = (selectedLang: Language) => {
    setLang(selectedLang);
    localStorage.setItem("lang", selectedLang);
    setShowLangNotice(false);
  };

  // Handle registration response from HomeView
  const handleRegistered = (candidateData: any) => {
    setCandidate(candidateData);
    // Clear admin session to enforce password re-entry if admin logs back in
    localStorage.removeItem("adminToken");
    if (candidateData.submitted || candidateData.status === "COMPLETED") {
      setView(ViewState.RESULT);
    } else {
      setView(ViewState.TEST);
    }
  };

  // Handle submission from PlacementTest
  const handleFinished = (finalCandidate: any) => {
    setCandidate(finalCandidate);
    setView(ViewState.RESULT);
  };

  return (
    <div className="font-sans antialiased min-h-screen relative">
      {/* Floating Language Notice Card in the Top Right */}
      {showLangNotice && (
        <div className="fixed top-4 right-4 z-50 max-w-xs w-full bg-white dark:bg-slate-900 border border-indigo-150 dark:border-slate-800 rounded-2xl shadow-2xl p-4 space-y-3 animate-slide-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <Globe size={18} className="animate-spin-slow" />
              <span className="font-bold text-xs tracking-wider uppercase">Language Select</span>
            </div>
            <button
              onClick={() => setShowLangNotice(false)}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-850 dark:text-slate-100">
              Welcome! Please choose your preferred language to proceed.
            </p>
            <p className="text-[10px] text-slate-400">
              Chào mừng bạn! Vui lòng chọn ngôn ngữ để bắt đầu làm bài.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleLanguageChange("en")}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
            >
              English
            </button>
            <button
              onClick={() => handleLanguageChange("vi")}
              className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-xs font-extrabold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
            >
              Tiếng Việt
            </button>
          </div>
        </div>
      )}

      {view === ViewState.HOME && (
        <HomeView
          isDarkMode={isDarkMode}
          onThemeToggle={() => setIsDarkMode(!isDarkMode)}
          onRegistered={handleRegistered}
          onAdminOpen={() => setView(ViewState.ADMIN)}
          lang={lang}
          onLanguageChange={handleLanguageChange}
        />
      )}

      {view === ViewState.TEST && candidate && (
        <PlacementTest
          candidate={candidate}
          isDarkMode={isDarkMode}
          onThemeToggle={() => setIsDarkMode(!isDarkMode)}
          onFinished={handleFinished}
          lang={lang}
          onLanguageChange={handleLanguageChange}
        />
      )}

      {view === ViewState.RESULT && candidate && (
        <ResultView
          candidate={candidate}
          onBackToHome={() => {
            setCandidate(null);
            setView(ViewState.HOME);
          }}
          lang={lang}
          onLanguageChange={handleLanguageChange}
        />
      )}

      {view === ViewState.ADMIN && (
        <AdminPanel
          isDarkMode={isDarkMode}
          onThemeToggle={() => setIsDarkMode(!isDarkMode)}
          onClose={() => setView(ViewState.HOME)}
          onLoginAsStudent={(studentCandidate) => {
            setCandidate(studentCandidate);
            // Clear admin session so they must enter the password to log back in
            localStorage.removeItem("adminToken");
            if (studentCandidate.status === "COMPLETED") {
              setView(ViewState.RESULT);
            } else {
              setView(ViewState.TEST);
            }
          }}
          lang={lang}
          onLanguageChange={handleLanguageChange}
        />
      )}
    </div>
  );
}
