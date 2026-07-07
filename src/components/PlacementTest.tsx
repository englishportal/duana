import { useState, useEffect, useRef } from "react";
import {
  Volume2,
  Mic,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Clock,
  AlertCircle,
  CheckCircle,
  Moon,
  Sun,
  Shield,
  CornerDownRight,
  Menu,
  X,
  Play,
  VolumeX,
  Award
} from "lucide-react";
import AudioPlayerOnce from "./AudioPlayerOnce";
import VoiceRecorder from "./VoiceRecorder";
import ThemeToggle from "./ThemeToggle";
import { getExamById } from "../services/examService";
import { updateCandidateSession, uploadCandidateSpeaking, submitCandidateExam } from "../services/candidateService";
import {
  LISTENING_PART_1,
  LISTENING_PART_2,
  SPEAKING_PART_1,
  SPEAKING_PART_2,
  GRAMMAR_QUESTIONS,
  VOCABULARY_QUESTIONS,
  READING_PASSAGE,
  WRITING_QUESTIONS
} from "../data/questions";

interface PlacementTestProps {
  candidate: any;
  isDarkMode: boolean;
  onThemeToggle: () => void;
  onFinished: (summaryData: any) => void;
}

export default function PlacementTest({
  candidate,
  isDarkMode,
  onThemeToggle,
  onFinished
}: PlacementTestProps) {
  // Navigation & Sub-pages
  // Page 1: Listening Part 1 (Guest Check-in)
  // Page 2: Listening Part 2 (Rented Properties table blanks)
  // Page 3: Grammar Part 1 (Q1 - Q10)
  // Page 4: Grammar Part 2 (Q11 - Q20)
  // Page 5: Grammar Part 3 (Q21 - Q30)
  // Page 6: Vocabulary Part 1 (Q1 - Q11: A1, A2, B1 start)
  // Page 7: Vocabulary Part 2 (Q12 - Q22: B1 continued, B2, C1)
  // Page 8: Reading (Fast Fashion passage & Q1-Q6)
  // Page 9: Writing (10 Translation sentences)
  // Page 10: Speaking (Part 1 Passage, Part 2 Interview)
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 10;

  // Custom tests and dynamic configurations
  const [customTest, setCustomTest] = useState<any>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);

  useEffect(() => {
    const tId = candidate.testId || "exam-test-1";
    setIsLoadingTest(true);
    getExamById(tId)
      .then((data) => {
        if (data) {
          if (tId !== "exam-test-1") {
            setCustomTest(data);
          }
          if (data.durationLimit !== undefined) {
            const totalSecs = data.durationLimit * 60;
            const elapsedSecs = candidate.durationSeconds || 0;
            const remaining = totalSecs - elapsedSecs;
            setTimeLeft(remaining > 0 ? remaining : 0);
          }
        }
        setIsLoadingTest(false);
      })
      .catch((err) => {
        console.error("Error fetching test details:", err);
        setIsLoadingTest(false);
      });
  }, [candidate.testId]);

  // Track Student Answers
  const [answers, setAnswers] = useState<Record<string, any>>(candidate.answers || {});
  
  // Track specific plays and blocks
  const [listening1Played, setListening1Played] = useState<boolean>(candidate.answers?.l1_played || false);
  const [listening2Played, setListening2Played] = useState<boolean>(candidate.answers?.l2_played || false);
  
  // Anti-Cheat & Violations tracking
  const [tabViolations, setTabViolations] = useState<number>(candidate.tabViolations || 0);
  const [showCheatOverlay, setShowCheatOverlay] = useState<boolean>(false);
  
  // Timer State (default 45 minutes i.e., 2700 seconds)
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const elapsedSecs = candidate.durationSeconds || 0;
    const remaining = 2700 - elapsedSecs;
    return remaining > 0 ? remaining : 0;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Custom interactive states for Speaking difficulty and Custom modal submissions
  const [selectedSpeakingLevel, setSelectedSpeakingLevel] = useState<string>(() => {
    return candidate.answers?.speaking_level || "medium";
  });
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Sync Timer duration back to database
  const elapsedSecondsRef = useRef<number>(candidate.durationSeconds || 0);

  // Timer Countdown loop
  useEffect(() => {
    if (timeLeft <= 0) {
      if (isLoadingTest) return; // Wait for test to load before auto-submitting
      handleAutoSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        elapsedSecondsRef.current += 1;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isLoadingTest]);

  // Periodic autosave to database
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      saveSessionProgress(answers, tabViolations, elapsedSecondsRef.current);
    }, 10000); // save progress every 10 seconds

    return () => clearInterval(autosaveInterval);
  }, [answers, tabViolations]);

  // Handle anti-cheat visibility change events (only triggers when leaving tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Show full-screen white overlay
        setShowCheatOverlay(true);
        setTabViolations((prev) => {
          const nextViolations = prev + 1;
          // Update server immediately on tab switch
          saveSessionProgress(answers, nextViolations, elapsedSecondsRef.current);
          return nextViolations;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [answers]);

  const saveSessionProgress = async (
    currentAnswers: Record<string, any>,
    violations: number,
    durationSecs: number
  ) => {
    try {
      await updateCandidateSession(candidate.id, {
        answers: {
          ...currentAnswers,
          l1_played: listening1Played,
          l2_played: listening2Played
        },
        tabViolations: violations,
        durationSeconds: durationSecs
      });
    } catch (err) {
      console.error("Autosave failed:", err);
    }
  };

  const handleAudioSaved = async (questionId: string, base64Audio: string) => {
    // Save recording state in answers
    const updatedAnswers = {
      ...answers,
      [`speaking_recorded_${questionId}`]: true
    };
    setAnswers(updatedAnswers);
    saveSessionProgress(updatedAnswers, tabViolations, elapsedSecondsRef.current);

    // Send recording to server (Firebase Storage)
    try {
      await uploadCandidateSpeaking(candidate.id, questionId, base64Audio);
    } catch (err) {
      console.error("Firebase Storage audio upload error:", err);
    }
  };

  const updateAnswer = (questionId: string, value: any) => {
    const updated = { ...answers, [questionId]: value };
    setAnswers(updated);
    // Sync immediately for continuous responsiveness
    saveSessionProgress(updated, tabViolations, elapsedSecondsRef.current);
  };

  const handleSkipQuestion = (questionId: string) => {
    // In skipped, we can set state as specifically skipped or keep blank
    if (answers[questionId] === undefined) {
      updateAnswer(questionId, ""); // mark with empty string to flag as visited/skipped
    }
    // Navigate to next question page or just keep as is
  };

  const handleSkipVoice = (questionId: string) => {
    const updatedAnswers = {
      ...answers,
      [`speaking_recorded_${questionId}`]: "skipped"
    };
    setAnswers(updatedAnswers);
    saveSessionProgress(updatedAnswers, tabViolations, elapsedSecondsRef.current);
  };

  const handleResetSkipVoice = (questionId: string) => {
    const updatedAnswers = {
      ...answers,
      [`speaking_recorded_${questionId}`]: undefined
    };
    setAnswers(updatedAnswers);
    saveSessionProgress(updatedAnswers, tabViolations, elapsedSecondsRef.current);
  };

  const handleSpeakingLevelChange = (level: string) => {
    setSelectedSpeakingLevel(level);
    const updatedAnswers = {
      ...answers,
      speaking_level: level
    };
    setAnswers(updatedAnswers);
    saveSessionProgress(updatedAnswers, tabViolations, elapsedSecondsRef.current);
  };

  const handleAutoSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const finalAnswers = {
        ...answers,
        l1_played: listening1Played,
        l2_played: listening2Played
      };
      const submittedCandidate = await submitCandidateExam(candidate.id, finalAnswers);
      onFinished(submittedCandidate);
    } catch (err) {
      console.error("Auto submit failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = () => {
    setShowSubmitModal(true);
  };

  const executeManualSubmit = async () => {
    setShowSubmitModal(false);
    setIsSubmitting(true);
    try {
      const finalAnswers = {
        ...answers,
        l1_played: listening1Played,
        l2_played: listening2Played
      };
      const submittedCandidate = await submitCandidateExam(candidate.id, finalAnswers);
      onFinished(submittedCandidate);
    } catch (err) {
      console.error("Lỗi xảy ra khi nộp bài:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Timer color classification
  const getTimerColorClass = () => {
    const mins = Math.floor(timeLeft / 60);
    if (mins < 1) return "text-red-500 font-black animate-pulse bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900";
    if (mins < 5) return "text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900";
    if (mins < 10) return "text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900";
    return "text-[#002147] dark:text-blue-300 font-bold bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700";
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Get active answers mapping and navigation list
  const getQuestionNavigationStatus = (qId: string) => {
    const val = answers[qId];
    if (val === undefined) return "not-attempted";
    if (val === "") return "skipped";
    return "answered";
  };

  // List of all question identifiers for navigation grid
  const allQuestionIds: { id: string; label: string; page: number }[] = [
    // Listening Part 1
    ...LISTENING_PART_1.questions.map((q, idx) => ({ id: q.id, label: `L${idx + 1}`, page: 1 })),
    // Listening Part 2
    ...Array.from({ length: 10 }).map((_, idx) => ({ id: `l2_${idx + 1}`, label: `L${idx + 8}`, page: 2 })),
    // Grammar Part 1 (Q1-10)
    ...Array.from({ length: 10 }).map((_, idx) => ({ id: `g_${idx + 1}`, label: `G${idx + 1}`, page: 3 })),
    // Grammar Part 2 (Q11-20)
    ...Array.from({ length: 10 }).map((_, idx) => ({ id: `g_${idx + 11}`, label: `G${idx + 11}`, page: 4 })),
    // Grammar Part 3 (Q21-30)
    ...Array.from({ length: 10 }).map((_, idx) => ({ id: `g_${idx + 21}`, label: `G${idx + 21}`, page: 5 })),
    // Vocab Part 1 (Q1-11)
    ...Array.from({ length: 11 }).map((_, idx) => ({ id: `v_${idx + 1}`, label: `V${idx + 1}`, page: 6 })),
    // Vocab Part 2 (Q12-22)
    ...Array.from({ length: 11 }).map((_, idx) => ({ id: `v_${idx + 12}`, label: `V${idx + 12}`, page: 7 })),
    // Reading
    ...READING_PASSAGE.questions.map((q, idx) => ({ id: q.id, label: `R${idx + 1}`, page: 8 })),
    // Writing
    ...WRITING_QUESTIONS.map((q, idx) => ({ id: q.id, label: `W${idx + 1}`, page: 9 })),
    // Speaking
    { id: "speaking_s1_1", label: `S1`, page: 10 },
    ...SPEAKING_PART_2.questions.map((q, idx) => ({ id: q.id, label: `S${idx + 2}`, page: 10 }))
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0b1329] text-[#0f172a] dark:text-slate-200 flex flex-col transition-colors duration-200 select-none font-sans">
      {/* 1. ANTI-CHEAT OVERLAY */}
      {showCheatOverlay && (
        <div className="fixed inset-0 bg-white dark:bg-slate-950 z-[9999] flex flex-col items-center justify-center p-10 text-center animate-fade-in animate-duration-200">
          <div className="w-full max-w-xl space-y-6">
            <div className="inline-flex p-4 rounded-full bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 animate-bounce">
              <Shield size={48} />
            </div>
            <h1 className="text-4xl font-extrabold text-red-600 dark:text-red-400 tracking-tight uppercase">
              CẢNH BÁO VI PHẠM AN NINH
            </h1>
            <p className="text-lg text-slate-700 dark:text-slate-300">
              Hệ thống phát hiện bạn vừa rời khỏi tab/cửa sổ bài thi. Hành vi này đã được tự động lưu lại vào lịch sử đánh giá của Hội đồng Giám khảo.
            </p>
            <div className="p-4 bg-red-50 dark:bg-red-950/10 border border-red-100 dark:border-red-900 rounded-2xl text-sm font-semibold text-red-700 dark:text-red-400">
              Tổng số lần rời tab ghi nhận: {tabViolations} lần
            </div>
            <button
              onClick={() => setShowCheatOverlay(false)}
              id="resume-test-btn"
              className="px-8 py-4 bg-[#002147] hover:bg-slate-800 text-white font-bold rounded-2xl shadow-xl transition-all cursor-pointer"
            >
              TÔI ĐÃ HIỂU - QUAY LẠI LÀM BÀI
            </button>
          </div>
        </div>
      )}

      {/* TOP SLOGAN BANNER */}
      <div className="bg-gradient-to-r from-blue-900 via-[#002147] to-indigo-900 text-white py-2 px-6 text-center text-xs font-bold tracking-widest border-b border-yellow-500/40 uppercase shadow-sm flex items-center justify-center gap-2 select-none">
        <span className="text-yellow-400">★</span>
        <span>CHINH PHỤC TIẾNG ANH - VƯƠN TẦM THẾ GIỚI - KHAI PHÓNG TƯƠNG LAI</span>
        <span className="text-yellow-400">★</span>
      </div>

      {/* 2. PLACEMENT TEST HEADER */}
      <header className="sticky top-0 z-45 h-20 bg-[#002147] text-white px-6 sm:px-8 flex justify-between items-center shadow-lg border-b border-slate-850">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            id="mobile-nav-toggle"
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 sm:hidden cursor-pointer"
          >
            <Menu size={20} />
          </button>
          <div className="p-2 bg-yellow-500 rounded text-[#002147] font-bold text-xs uppercase hidden sm:block">
            Placement
          </div>
          <h1 className="text-sm sm:text-base md:text-lg font-bold tracking-tight uppercase">
            English Placement Test
          </h1>
        </div>

        <div className="flex items-center gap-4 sm:gap-8">
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[10px] uppercase opacity-60 font-semibold">Candidate</span>
            <span className="text-sm font-medium">{candidate.fullName}</span>
          </div>

          {/* Timer Widget */}
          <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-lg border border-white/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span className="text-lg sm:text-2xl font-mono font-bold tracking-widest text-white">
              {formatTimer(timeLeft)}
            </span>
          </div>

          <ThemeToggle isDarkMode={isDarkMode} onToggle={onThemeToggle} />
        </div>
      </header>

      {/* Anti-Cheat / Warning Banner */}
      <div className="bg-red-50 dark:bg-red-950/25 border-b border-red-250 dark:border-red-900/40 px-6 sm:px-8 py-2.5 flex items-center gap-3 shrink-0">
        <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">An Ninh</span>
        <p className="text-xs text-red-700 dark:text-red-300 font-medium leading-relaxed">
          CẢNH BÁO: Nghiêm cấm sử dụng tài liệu, từ điển, công cụ dịch thuật hoặc AI trong quá trình làm bài. Nếu bạn rời khỏi tab làm bài hoặc mở ứng dụng khác, hệ thống sẽ tự động ghi nhận vi phạm. Nếu không biết câu trả lời, hãy bấm BỎ QUA. (Số lần rời tab ghi nhận: <span className="font-bold underline text-red-650 dark:text-red-400">{tabViolations}</span>)
        </p>
      </div>

      {/* 3. WORKING CONTENT CONTAINER */}
      <div className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left main pane: Question presentation */}
        <div className="flex-1 lg:flex-[3] bg-white dark:bg-slate-900 p-6 sm:p-10 flex flex-col justify-between overflow-y-auto border-r border-slate-200 dark:border-slate-800">
          
          <div className="space-y-6">
            {/* Page Headers */}
            {!customTest && (
              <div className="mb-8 flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#002147] dark:text-indigo-400 uppercase tracking-widest">
                    {currentPage === 1 && "LISTENING: PART 1"}
                    {currentPage === 2 && "LISTENING: PART 2"}
                    {currentPage === 3 && "GRAMMAR: PART 1 (Q1-10)"}
                    {currentPage === 4 && "GRAMMAR: PART 2 (Q11-20)"}
                    {currentPage === 5 && "GRAMMAR: PART 3 (Q21-30)"}
                    {currentPage === 6 && "VOCABULARY: PART 1 (Q1-11)"}
                    {currentPage === 7 && "VOCABULARY: PART 2 (Q12-22)"}
                    {currentPage === 8 && "READING COMPREHENSION"}
                    {currentPage === 9 && "WRITING TRANSLATION"}
                    {currentPage === 10 && "SPEAKING PERFORMANCE"}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 mt-1 tracking-tight">
                    Trang {currentPage} trên {totalPages}
                  </h2>
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Tự động lưu...
                </div>
              </div>
            )}

            {/* PAGE RENDERS */}
            {isLoadingTest && (
              <div className="text-center py-20 space-y-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-sm text-slate-500 font-semibold">Đang tải nội dung bài thi của bạn...</p>
              </div>
            )}

            {customTest && (
              <div className="space-y-6 animate-fade-in pb-12">
                <div className="space-y-1 pb-4 border-b border-slate-150 dark:border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-blue-400">
                    KỲ THI ĐÁNH GIÁ NĂNG LỰC ĐẦU VÀO
                  </span>
                  <h2 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
                    {customTest.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Mã đề thi: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{customTest.code}</span> | Thể loại: <span className="font-semibold">{customTest.category}</span>
                  </p>
                </div>

                {customTest.audioUrl && (
                  <div className="p-5 bg-indigo-50/10 dark:bg-slate-800/40 border border-indigo-100 dark:border-slate-800 rounded-2xl space-y-3">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <Volume2 size={16} className="text-indigo-600 dark:text-blue-400" />
                      Đoạn băng nghe âm thanh (Audio)
                    </h3>
                    <audio src={customTest.audioUrl} controls className="w-full" />
                  </div>
                )}

                <div className="space-y-6">
                  {(customTest.questions || []).map((q: any, idx: number) => {
                    const isSelectedKey = answers[q.id];
                    return (
                      <div key={`${q.id}-${idx}`} className="p-5 bg-slate-50/50 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-xs font-extrabold px-3 py-1 bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 rounded-lg">
                            Câu hỏi {idx + 1}
                          </span>
                        </div>
                        <p className="text-slate-850 dark:text-slate-100 font-bold text-base sm:text-lg leading-relaxed">
                          {q.questionText}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(q.options || []).map((opt: any) => {
                            const isSelected = isSelectedKey === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => updateAnswer(q.id, opt.key)}
                                className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                  isSelected
                                    ? "border-indigo-600 bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-indigo-700 dark:text-blue-300 font-extrabold"
                                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                                }`}
                              >
                                <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-indigo-600 dark:bg-blue-400 text-white dark:text-slate-950"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                                }`}>
                                  {opt.key}
                                </span>
                                <span className="text-xs sm:text-sm font-medium">{opt.text}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {(customTest.questions || []).length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-slate-250 dark:border-slate-800 rounded-2xl text-slate-400 font-semibold">
                      Đề thi này hiện chưa được cấu hình câu hỏi nào. Giáo viên hãy vào trang Quản lý (Admin) để cập nhật.
                    </div>
                  )}
                </div>

                <div className="pt-8 border-t border-slate-150 dark:border-slate-800 flex justify-end">
                  <button
                    onClick={handleManualSubmit}
                    disabled={isSubmitting}
                    className="px-8 py-4 bg-emerald-600 hover:bg-emerald-750 text-white font-extrabold text-sm tracking-wide rounded-2xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? "ĐANG NỘP BÀI..." : "HOÀN THÀNH & NỘP BÀI THI"}
                  </button>
                </div>
              </div>
            )}

            {/* PAGE 1: Listening Part 1 */}
            {!customTest && !isLoadingTest && currentPage === 1 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{LISTENING_PART_1.title}</h2>
                  <p className="text-sm text-slate-500">{LISTENING_PART_1.description}</p>
                </div>

                <AudioPlayerOnce
                  src={LISTENING_PART_1.audioUrl}
                  id="listening_p1"
                  hasBeenPlayed={listening1Played}
                  onStartPlaying={() => {
                    setListening1Played(true);
                    updateAnswer("l1_played", true);
                  }}
                  onEnded={() => {}}
                />

                <div className="space-y-6 pt-2">
                  {LISTENING_PART_1.questions.map((q, idx) => (
                    <div key={q.id} id={`q-block-${q.id}`} className="space-y-3.5 p-4 bg-slate-50/40 dark:bg-slate-900/45 rounded-xl border border-slate-100 dark:border-slate-800">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base">
                        {idx + 1}. {q.questionText}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {q.options?.map((opt) => {
                          const isSelected = answers[q.id] === opt.key;
                          return (
                            <button
                              key={opt.key}
                              onClick={() => updateAnswer(q.id, opt.key)}
                              id={`opt-${q.id}-${opt.key}`}
                              className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                isSelected
                                  ? "border-[#002147] bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-[#002147] dark:text-blue-300 font-extrabold"
                                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                              }`}
                            >
                              <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-[#002147] dark:bg-blue-400 text-white dark:text-slate-950"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                              }`}>
                                {opt.key}
                              </span>
                              <span className="text-xs sm:text-sm">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleSkipQuestion(q.id)}
                          className="text-xs font-semibold text-slate-400 hover:text-amber-500 underline cursor-pointer"
                        >
                          Bỏ qua câu này
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE 2: Listening Part 2 */}
            {currentPage === 2 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{LISTENING_PART_2.title}</h2>
                  <p className="text-sm text-slate-500">{LISTENING_PART_2.description}</p>
                </div>

                <AudioPlayerOnce
                  src={LISTENING_PART_2.audioUrl}
                  id="listening_p2"
                  hasBeenPlayed={listening2Played}
                  onStartPlaying={() => {
                    setListening2Played(true);
                    updateAnswer("l2_played", true);
                  }}
                  onEnded={() => {}}
                />

                {/* Table structure representing rented properties layout */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-[#002147] text-white">
                        <th className="py-3.5 px-4 font-bold tracking-wider" colSpan={2}>
                          Rented Properties: Information About a House
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {/* Availability & pricing */}
                      <tr className="bg-slate-50/55 dark:bg-slate-900/10">
                        <td className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400 w-1/3 border-r border-slate-100 dark:border-slate-800">
                          Availability & Pricing
                        </td>
                        <td className="py-3 px-4 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>Available date:</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(8)</span>
                            <input
                              type="text"
                              placeholder="8"
                              value={answers.l2_1 || ""}
                              onChange={(e) => updateAnswer("l2_1", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-36"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span>Rent: $</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(9)</span>
                            <input
                              type="text"
                              placeholder="9"
                              value={answers.l2_2 || ""}
                              onChange={(e) => updateAnswer("l2_2", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-32"
                            />
                            <span>per month</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-slate-500">
                            <span>Deposit:</span>
                            <span className="font-mono font-bold">$1,500</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span>Credit check: $</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(10)</span>
                            <input
                              type="text"
                              placeholder="10"
                              value={answers.l2_3 || ""}
                              onChange={(e) => updateAnswer("l2_3", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-24"
                            />
                          </div>
                        </td>
                      </tr>

                      {/* Facilities */}
                      <tr>
                        <td className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400 border-r border-slate-100 dark:border-slate-800">
                          Facilities
                        </td>
                        <td className="py-3 px-4 space-y-3">
                          <div className="text-slate-500">
                            <span>Bedrooms and bathrooms:</span>
                            <span className="font-bold ml-1">3 bedrooms and 2 bathrooms</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span>A remodelled</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(11)</span>
                            <input
                              type="text"
                              placeholder="11"
                              value={answers.l2_4 || ""}
                              onChange={(e) => updateAnswer("l2_4", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-36"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span>No</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(12)</span>
                            <input
                              type="text"
                              placeholder="12"
                              value={answers.l2_5 || ""}
                              onChange={(e) => updateAnswer("l2_5", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-36"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span>Parking: A</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(13)</span>
                            <input
                              type="text"
                              placeholder="13"
                              value={answers.l2_6 || ""}
                              onChange={(e) => updateAnswer("l2_6", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-36"
                            />
                            <span>with a work area</span>
                          </div>
                        </td>
                      </tr>

                      {/* Utilities */}
                      <tr className="bg-slate-50/55 dark:bg-slate-900/10">
                        <td className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400 border-r border-slate-100 dark:border-slate-800">
                          Utilities
                        </td>
                        <td className="py-3 px-4 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>Garden care: The landlord will provide landscaping, but tenants must</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(14)</span>
                            <input
                              type="text"
                              placeholder="14"
                              value={answers.l2_7 || ""}
                              onChange={(e) => updateAnswer("l2_7", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-32"
                            />
                            <span>the grass.</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span>Tenants pay $15 for trashing and</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(15)</span>
                            <input
                              type="text"
                              placeholder="15"
                              value={answers.l2_8 || ""}
                              onChange={(e) => updateAnswer("l2_8", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-32"
                            />
                            <span>service.</span>
                          </div>

                          <div className="text-slate-500 text-xs">
                            Other bills: Tenants pay for electricity, water and gas.
                          </div>
                        </td>
                      </tr>

                      {/* Other information */}
                      <tr>
                        <td className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400 border-r border-slate-100 dark:border-slate-800">
                          Other Information
                        </td>
                        <td className="py-3 px-4 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>Air conditioning: No central air conditioning, but there is a</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(16)</span>
                            <input
                              type="text"
                              placeholder="16"
                              value={answers.l2_9 || ""}
                              onChange={(e) => updateAnswer("l2_9", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-32"
                            />
                            <span>conditioning unit.</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span>Student's name: Sam</span>
                            <span className="font-mono font-bold text-[#002147] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[11px]">(17)</span>
                            <input
                              type="text"
                              placeholder="17"
                              value={answers.l2_10 || ""}
                              onChange={(e) => updateAnswer("l2_10", e.target.value)}
                              className="px-2.5 py-1 text-xs border-b border-slate-350 dark:border-slate-700 bg-transparent outline-none focus:border-indigo-500 font-bold text-indigo-600 dark:text-indigo-400 w-32"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PAGE 3: Grammar Part 1 (Q1 - 10) */}
            {currentPage === 3 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Grammar Questions: Part 1</h2>
                  <p className="text-sm text-slate-500">Chọn đáp án đúng hoặc điền động từ thích hợp để hoàn thành câu hỏi.</p>
                </div>

                <div className="space-y-6">
                  {GRAMMAR_QUESTIONS.slice(0, 10).map((q, idx) => (
                    <div key={q.id} id={`q-block-${q.id}`} className="p-4 bg-slate-50/40 dark:bg-slate-900/45 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <p className="font-bold text-slate-850 dark:text-slate-200 text-sm sm:text-base">
                        {idx + 1}. {q.questionText}
                      </p>

                      {q.type === "text" ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Nhập câu trả lời của bạn..."
                            value={answers[q.id] || ""}
                            onChange={(e) => updateAnswer(q.id, e.target.value)}
                            className="w-full max-w-md px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                          />
                          {q.hint && <p className="text-xs text-slate-400 italic font-medium">{q.hint}</p>}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {q.options?.map((opt) => {
                            const isSelected = answers[q.id] === opt.key;
                            return (
                              <button
                                key={opt.key}
                                onClick={() => updateAnswer(q.id, opt.key)}
                                className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                  isSelected
                                    ? "border-[#002147] bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-[#002147] dark:text-blue-300 font-extrabold"
                                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                                }`}
                              >
                                <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-[#002147] dark:bg-blue-400 text-white dark:text-slate-950"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                                }`}>
                                  {opt.key}
                                </span>
                                <span className="text-xs sm:text-sm">{opt.text}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE 4: Grammar Part 2 (Q11 - 20) */}
            {currentPage === 4 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Grammar Questions: Part 2</h2>
                  <p className="text-sm text-slate-500">Chọn đáp án thích hợp nhất để điền vào chỗ trống.</p>
                </div>

                <div className="space-y-6">
                  {GRAMMAR_QUESTIONS.slice(10, 20).map((q, idx) => (
                    <div key={q.id} id={`q-block-${q.id}`} className="p-4 bg-slate-50/40 dark:bg-slate-900/45 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <p className="font-bold text-slate-850 dark:text-slate-200 text-sm sm:text-base">
                        {idx + 11}. {q.questionText}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {q.options?.map((opt) => {
                          const isSelected = answers[q.id] === opt.key;
                          return (
                            <button
                              key={opt.key}
                              onClick={() => updateAnswer(q.id, opt.key)}
                              className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                isSelected
                                  ? "border-[#002147] bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-[#002147] dark:text-blue-300 font-extrabold"
                                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                              }`}
                            >
                              <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-[#002147] dark:bg-blue-400 text-white dark:text-slate-950"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                              }`}>
                                {opt.key}
                              </span>
                              <span className="text-xs sm:text-sm">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE 5: Grammar Part 3 (Q21 - 30) */}
            {currentPage === 5 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Grammar Questions: Part 3</h2>
                  <p className="text-sm text-slate-500">Hoàn thành phần kiểm tra Ngữ pháp cuối cùng.</p>
                </div>

                <div className="space-y-6">
                  {GRAMMAR_QUESTIONS.slice(20, 30).map((q, idx) => (
                    <div key={q.id} id={`q-block-${q.id}`} className="p-4 bg-slate-50/40 dark:bg-slate-900/45 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <p className="font-bold text-slate-850 dark:text-slate-200 text-sm sm:text-base">
                        {idx + 21}. {q.questionText}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {q.options?.map((opt) => {
                          const isSelected = answers[q.id] === opt.key;
                          return (
                            <button
                              key={opt.key}
                              onClick={() => updateAnswer(q.id, opt.key)}
                              className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                isSelected
                                  ? "border-[#002147] bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-[#002147] dark:text-blue-300 font-extrabold"
                                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                              }`}
                            >
                              <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-[#002147] dark:bg-blue-400 text-white dark:text-slate-950"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                              }`}>
                                {opt.key}
                              </span>
                              <span className="text-xs sm:text-sm">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE 6: Vocabulary Part 1 (Q1 - 11) */}
            {currentPage === 6 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Vocabulary Questions: Part 1</h2>
                  <p className="text-sm text-slate-500">Kiểm tra từ vựng trình độ A1, A2 và một phần B1.</p>
                </div>

                <div className="space-y-6">
                  {VOCABULARY_QUESTIONS.slice(0, 11).map((q, idx) => (
                    <div key={q.id} id={`q-block-${q.id}`} className="p-4 bg-slate-50/40 dark:bg-slate-900/45 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black tracking-wide uppercase bg-blue-550/10 text-indigo-650 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400">
                          Level {q.level}
                        </span>
                      </div>
                      <p className="font-bold text-slate-850 dark:text-slate-200 text-sm sm:text-base">
                        {idx + 1}. {q.questionText}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {q.options?.map((opt) => {
                          const isSelected = answers[q.id] === opt.key;
                          return (
                            <button
                              key={opt.key}
                              onClick={() => updateAnswer(q.id, opt.key)}
                              className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                isSelected
                                  ? "border-[#002147] bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-[#002147] dark:text-blue-300 font-extrabold"
                                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                              }`}
                            >
                              <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-[#002147] dark:bg-blue-400 text-white dark:text-slate-950"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                              }`}>
                                {opt.key}
                              </span>
                              <span className="text-xs sm:text-sm">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE 7: Vocabulary Part 2 (Q12 - 22) */}
            {currentPage === 7 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Vocabulary Questions: Part 2</h2>
                  <p className="text-sm text-slate-500">Kiểm tra từ vựng trình độ nâng cao B2 và C1.</p>
                </div>

                <div className="space-y-6">
                  {VOCABULARY_QUESTIONS.slice(11, 22).map((q, idx) => (
                    <div key={q.id} id={`q-block-${q.id}`} className="p-4 bg-slate-50/40 dark:bg-slate-900/45 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black tracking-wide uppercase bg-blue-550/10 text-indigo-650 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400">
                          Level {q.level}
                        </span>
                      </div>
                      <p className="font-bold text-slate-850 dark:text-slate-200 text-sm sm:text-base">
                        {idx + 12}. {q.questionText}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {q.options?.map((opt) => {
                          const isSelected = answers[q.id] === opt.key;
                          return (
                            <button
                              key={opt.key}
                              onClick={() => updateAnswer(q.id, opt.key)}
                              className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                isSelected
                                  ? "border-[#002147] bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-[#002147] dark:text-blue-300 font-extrabold"
                                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                              }`}
                            >
                              <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-[#002147] dark:bg-blue-400 text-white dark:text-slate-950"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                              }`}>
                                {opt.key}
                              </span>
                              <span className="text-xs sm:text-sm">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE 8: Reading Passage & MCQs/TFNGs */}
            {currentPage === 8 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Reading Passage 1</h2>
                  <p className="text-sm text-slate-500">Đọc kỹ đoạn văn dưới đây và trả lời các câu hỏi trắc nghiệm liên quan.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* Left block: Reading Passage */}
                  <div className="p-6 bg-slate-50 dark:bg-slate-900/60 border border-slate-250 dark:border-slate-800 rounded-2xl h-[550px] overflow-y-auto leading-relaxed space-y-4 shadow-inner text-sm text-slate-700 dark:text-slate-300">
                    <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-400 border-b border-indigo-100 dark:border-indigo-950 pb-2">
                      {READING_PASSAGE.title}
                    </h3>
                    {READING_PASSAGE.paragraphs.map((para, idx) => (
                      <p key={idx} className="indent-4 text-justify">
                        {para}
                      </p>
                    ))}
                  </div>

                  {/* Right block: Reading Questions */}
                  <div className="space-y-6 max-h-[550px] overflow-y-auto pr-2">
                    {READING_PASSAGE.questions.map((q, idx) => (
                      <div key={q.id} id={`q-block-${q.id}`} className="p-4 bg-slate-50/40 dark:bg-slate-900/45 border border-slate-150 dark:border-slate-800 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{q.section}</span>
                        </div>
                        <p className="font-bold text-slate-850 dark:text-slate-200 text-xs sm:text-sm">
                          {idx + 1}. {q.questionText}
                        </p>

                        <div className="grid grid-cols-1 gap-2.5">
                          {q.options?.map((opt) => {
                            const isSelected = answers[q.id] === opt.key;
                            return (
                              <button
                                key={opt.key}
                                onClick={() => updateAnswer(q.id, opt.key)}
                                className={`flex items-center gap-4 p-4 border-2 rounded-xl transition text-left cursor-pointer group w-full ${
                                  isSelected
                                    ? "border-[#002147] bg-blue-50/50 dark:bg-slate-800/60 dark:border-blue-400 text-[#002147] dark:text-blue-300 font-extrabold"
                                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                                }`}
                              >
                                <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-[#002147] dark:bg-blue-400 text-white dark:text-slate-950"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                                }`}>
                                  {opt.key}
                                </span>
                                <span className="text-xs sm:text-sm">{opt.text}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PAGE 9: Writing Translation */}
            {currentPage === 9 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Writing: Sentence Translation</h2>
                  <p className="text-sm text-slate-500">
                    Dịch các câu tiếng Việt sau sang tiếng Anh. Đáp án được hệ thống lưu tự động trong quá trình bạn nhập dữ liệu.
                  </p>
                </div>

                <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
                  {WRITING_QUESTIONS.map((q, idx) => (
                    <div key={q.id} id={`q-block-${q.id}`} className="p-4 bg-slate-50/40 dark:bg-slate-900/45 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CÂU HỎI {idx + 1}</span>
                        <p className="font-bold text-slate-850 dark:text-slate-200 text-sm sm:text-base mt-1 italic">
                          &ldquo;{q.vietnamese}&rdquo;
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <textarea
                          placeholder="Type your English translation here..."
                          value={answers[q.id] || ""}
                          onChange={(e) => updateAnswer(q.id, e.target.value)}
                          rows={3}
                          className="w-full p-3.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                          <span>Đáp án của bạn tự động được đồng bộ</span>
                          <span>{(answers[q.id] || "").trim().split(/\s+/).filter(Boolean).length} từ</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE 10: Speaking */}
            {currentPage === 10 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Speaking Evaluation</h2>
                  <p className="text-sm text-slate-500">
                    Phần thi nói bao gồm Đọc đoạn văn (Part 1) và Trả lời 3 câu hỏi phỏng vấn (Part 2).
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Read Aloud */}
                  <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 space-y-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-pink-100 dark:bg-pink-950/20 text-pink-700 dark:text-pink-400 rounded w-fit">
                        Bài 1: Đọc đoạn văn thành tiếng
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        (Chọn độ khó khác nhau dưới đây)
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      {SPEAKING_PART_1.description}
                    </p>

                    {/* Difficulty Selection Tabs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {SPEAKING_PART_1.levels.map((lvl) => {
                        const isSelected = selectedSpeakingLevel === lvl.id;
                        return (
                          <button
                            key={lvl.id}
                            type="button"
                            onClick={() => handleSpeakingLevelChange(lvl.id)}
                            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1 border-2 text-center cursor-pointer ${
                              isSelected
                                ? "bg-indigo-50/70 border-[#002147] text-[#002147] dark:bg-slate-800/60 dark:border-blue-400 dark:text-blue-350"
                                : "bg-white border-slate-200 hover:border-slate-350 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700"
                            }`}
                          >
                            <span>Mức: {lvl.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                            }`}>{lvl.difficulty}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected level details */}
                    {(() => {
                      const activeLvl = SPEAKING_PART_1.levels.find(l => l.id === selectedSpeakingLevel) || SPEAKING_PART_1.levels[1];
                      return (
                        <div className="space-y-4">
                          <div className="p-3 bg-indigo-50/30 dark:bg-slate-900/40 rounded-xl border border-indigo-100/40 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mr-1">Mô tả:</span>
                            {activeLvl.description}
                          </div>
                          
                          <div className="p-5 bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-800 rounded-2xl font-serif text-slate-800 dark:text-slate-200 leading-relaxed text-justify text-base shadow-inner">
                            {activeLvl.passage}
                          </div>

                          <VoiceRecorder
                            questionId="s1_1"
                            hasRecord={answers["speaking_recorded_s1_1"] === "recorded" || (!!answers["speaking_recorded_s1_1"] && answers["speaking_recorded_s1_1"] !== "skipped")}
                            isSkipped={answers["speaking_recorded_s1_1"] === "skipped"}
                            onRecordSaved={handleAudioSaved}
                            onSkip={() => handleSkipVoice("s1_1")}
                            onResetSkip={() => handleResetSkipVoice("s1_1")}
                          />
                        </div>
                      );
                    })()}
                  </div>

                  {/* Interview */}
                  <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 space-y-4 shadow-sm">
                    <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-pink-100 dark:bg-pink-950/20 text-pink-700 dark:text-pink-400 rounded">
                      Bài 2: Ghi âm trả lời 3 câu hỏi phỏng vấn
                    </span>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {SPEAKING_PART_2.description}
                    </p>
 
                     <div className="space-y-4">
                       {SPEAKING_PART_2.questions.map((q, idx) => (
                         <div key={q.id} className="p-3.5 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/60 rounded-xl space-y-2">
                           <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">CÂU HỎI {idx + 1}</p>
                           <VoiceRecorder
                             questionId={q.id}
                             hasRecord={answers[`speaking_recorded_${q.id}`] === "recorded" || (!!answers[`speaking_recorded_${q.id}`] && answers[`speaking_recorded_${q.id}`] !== "skipped")}
                             isSkipped={answers[`speaking_recorded_${q.id}`] === "skipped"}
                             onRecordSaved={handleAudioSaved}
                             onSkip={() => handleSkipVoice(q.id)}
                             onResetSkip={() => handleResetSkipVoice(q.id)}
                             promptText={q.text}
                           />
                         </div>
                       ))}
                     </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PREV/NEXT BUTTON FOOTER */}
          {!customTest && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-400 font-medium italic text-center sm:text-left">
                &ldquo;Không sao nếu bạn chưa biết đáp án. Mỗi câu hỏi đều là một cơ hội để học hỏi.&rdquo;
              </div>

              <div className="flex gap-3 w-full sm:w-auto">
                {currentPage > 1 ? (
                  <button
                    onClick={() => setCurrentPage((prev) => prev - 1)}
                    id="nav-prev-btn"
                    className="flex-1 sm:flex-initial px-5 py-2.5 border border-slate-350 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold text-xs tracking-wide transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 text-slate-700 dark:text-slate-300"
                  >
                    <ChevronLeft size={14} />
                    QUAY LẠI
                  </button>
                ) : (
                  <div className="flex-1 sm:flex-initial" />
                )}

                {currentPage < totalPages ? (
                  <button
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    id="nav-next-btn"
                    className="flex-1 sm:flex-initial px-6 py-2.5 bg-[#002147] hover:bg-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold text-xs tracking-wide rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    TIẾP THEO
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleManualSubmit}
                    id="nav-submit-btn"
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs tracking-wide rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? "ĐANG NỘP BÀI..." : "HOÀN THÀNH & NỘP BÀI"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side: Desktop question status board */}
        {customTest ? (
          <aside className="hidden lg:block w-85 shrink-0 bg-slate-50 dark:bg-slate-950/30 border-l border-slate-250 dark:border-slate-800 p-6 overflow-y-auto">
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-4">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider">THÔNG TIN BÀI THI</h3>
                <span className="text-[10px] font-mono font-black bg-indigo-650 dark:bg-blue-900 text-white px-2.5 py-1 rounded">
                  {(customTest.questions || []).length} CÂU HỎI
                </span>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3.5 text-xs">
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">TÊN THÍ SINH</p>
                  <p className="font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-0.5">{candidate.fullName}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">SỐ ĐIỆN THOẠI</p>
                  <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100 mt-0.5">{candidate.phoneNumber}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">MÃ ĐỀ THI</p>
                  <p className="font-mono font-bold text-sm text-indigo-600 dark:text-blue-400 mt-0.5">{customTest.code}</p>
                </div>
              </div>

              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl flex gap-3 text-xs text-red-700 dark:text-red-300 leading-relaxed font-semibold">
                Thí sinh lưu ý: Không sử dụng từ điển, chuyển tab hoặc nhờ người khác trợ giúp. Tiến trình thi sẽ được tự động đồng bộ liên tục lên máy chủ.
              </div>
              
              <button
                onClick={handleManualSubmit}
                id="sidebar-finish-btn"
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs tracking-widest rounded-xl transition active:scale-95 cursor-pointer uppercase"
              >
                NỘP BÀI THI NGAY
              </button>
            </div>
          </aside>
        ) : (
          <aside className="hidden lg:block w-85 shrink-0 bg-slate-50 dark:bg-slate-950/30 border-l border-slate-250 dark:border-slate-800 p-6 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider">ĐIỀU HƯỚNG CÂU HỎI</h3>
              <span className="text-[10px] font-mono font-black bg-[#002147] dark:bg-blue-900 text-white px-2.5 py-1 rounded">
                75 CÂU
              </span>
            </div>

            {/* Scrollable grid to navigate directly */}
            <div className="grid grid-cols-5 gap-2 max-h-[380px] overflow-y-auto pr-1">
              {allQuestionIds.map((item, idx) => {
                const status = getQuestionNavigationStatus(item.id);
                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentPage(item.page)}
                    className={`h-9 w-9 text-xs font-mono font-bold rounded-lg border-2 flex items-center justify-center cursor-pointer transition ${
                      status === "answered"
                        ? "bg-[#002147] dark:bg-blue-400 border-[#002147] dark:border-blue-400 text-white dark:text-slate-950"
                        : status === "skipped"
                        ? "bg-amber-100 dark:bg-amber-950/30 border-amber-400 dark:border-amber-500/50 text-amber-800 dark:text-amber-400"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700"
                    }`}
                    title={`Chuyển tới Trang ${item.page}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 bg-[#002147] dark:bg-blue-400 rounded border-2 border-[#002147] dark:border-blue-400"></div>
                <span className="text-slate-600 dark:text-slate-450 font-bold">Đã làm bài</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 bg-amber-100 dark:bg-amber-950/30 border-2 border-amber-400 rounded"></div>
                <span className="text-slate-600 dark:text-slate-450 font-bold">Bỏ qua / Chưa điền</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded"></div>
                <span className="text-slate-600 dark:text-slate-450 font-bold">Chưa bắt đầu làm</span>
              </div>
            </div>

            {/* Red warning at sidebar bottom */}
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border-2 border-red-100 dark:border-red-900/30 rounded-xl flex gap-3">
              <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-[10.5px] text-red-700 dark:text-red-400 leading-relaxed font-bold">
                NỘP BÀI SỚM: Toàn bộ đáp án của bạn sẽ được khóa lại để chuyển giao hội đồng kiểm tra trực tiếp.
              </p>
            </div>
            
            <button
              onClick={handleManualSubmit}
              id="sidebar-finish-btn"
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs tracking-widest rounded-xl transition active:scale-95 cursor-pointer uppercase"
            >
              NỘP BÀI THI NGAY
            </button>
          </div>
        </aside>
      )}
      </div>

      {/* 4. MOBILE DRAWER NAVIGATION */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex sm:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="relative flex flex-col w-64 max-w-xs ml-auto bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-850 h-full p-5 space-y-4 animate-slide-in">
            <div className="flex justify-between items-center border-b border-slate-150 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm">Menu Điều Hướng</h3>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 rounded bg-slate-100 dark:bg-slate-850 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 overflow-y-auto shrink p-1 max-h-[400px]">
              {allQuestionIds.map((item, idx) => {
                const status = getQuestionNavigationStatus(item.id);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentPage(item.page);
                      setIsSidebarOpen(false);
                    }}
                    className={`h-8 w-8 text-[11px] font-bold rounded-lg border flex items-center justify-center cursor-pointer transition ${
                      status === "answered"
                        ? "bg-emerald-500 border-emerald-600 text-white shadow"
                        : status === "skipped"
                        ? "bg-amber-400 border-amber-500 text-slate-950 shadow"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-250 dark:border-slate-750 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleManualSubmit}
              className="w-full py-2.5 bg-red-600 text-white font-bold text-xs tracking-wide rounded-xl shadow-lg cursor-pointer"
            >
              Nộp bài thi ngay
            </button>
          </div>
        </div>
      )}

      {/* 5. CUSTOM SUBMISSION CONFIRMATION DIALOG MODAL */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center animate-scale-up">
            <div className="mx-auto w-14 h-14 bg-amber-50 dark:bg-amber-950/20 text-amber-500 rounded-full flex items-center justify-center">
              <AlertCircle size={30} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Xác Nhận Nộp Bài Thi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed">
                Bạn có chắc chắn muốn kết thúc và nộp bài thi? Sau khi nộp, toàn bộ đáp án của bạn sẽ được ghi nhận vĩnh viễn và không thể chỉnh sửa thêm.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                HỦY - LÀM TIẾP
              </button>
              <button
                type="button"
                onClick={executeManualSubmit}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md cursor-pointer animate-pulse"
              >
                XÁC NHẬN NỘP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
