import React, { useState, useEffect, FormEvent } from "react";
import {
  Users,
  CheckCircle,
  Clock,
  Award,
  Search,
  Eye,
  Trash2,
  RefreshCw,
  Lock,
  Unlock,
  ChevronLeft,
  Volume2,
  Check,
  X,
  FileSpreadsheet,
  LogOut,
  Edit,
  Save,
  AlertTriangle,
  FileText,
  Settings,
  Plus,
  Image,
  Sparkles,
  Link,
  Copy,
  FolderOpen
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { loginAdmin, logoutAdmin, getCurrentAdminToken, isFirstRun, setupAdmin, changeAdminPassword } from "../services/auth";
import { getGlobalSettings, updateGlobalSettings } from "../services/settingsService";
import { getAdminExams, createExam, updateExam, deleteExam } from "../services/examService";
import { getMaterials, addMaterial, deleteMaterial, Material } from "../services/materialService";
import {
  getCandidatesAdminList,
  getCandidateDetails,
  gradeCandidateWriting,
  resetCandidateStatus,
  deleteCandidate,
  toggleBlockCandidate
} from "../services/candidateService";
import { parseImageWithAI } from "../services/aiService";
import {
  LISTENING_PART_1,
  LISTENING_PART_2,
  GRAMMAR_QUESTIONS,
  VOCABULARY_QUESTIONS,
  READING_PASSAGE,
  SPEAKING_PART_1,
  SPEAKING_PART_2
} from "../data/questions";

// Static Placement Test Scorer for backward-compatibility
export function calculateObjectiveScore(answers: Record<string, any> | undefined): number {
  if (!answers) return 0;
  let score = 0;

  // Listening Part 1
  const l1Answers: Record<string, string> = {
    l1_1: "A", l1_2: "C", l1_3: "C", l1_4: "C", l1_5: "A", l1_6: "A", l1_7: "B"
  };
  Object.entries(l1Answers).forEach(([qId, correct]) => {
    if (answers[qId]?.toString().trim().toUpperCase() === correct) {
      score++;
    }
  });

  // Listening Part 2
  const l2Answers: Record<string, string[]> = {
    l2_1: ["MAY 5TH", "5TH MAY", "MAY 5"],
    l2_2: ["1700", "$1700", "1,700", "$1,700"],
    l2_3: ["15", "$15"],
    l2_4: ["KITCHEN"],
    l2_5: ["DISHWASHER"],
    l2_6: ["GARAGE"],
    l2_7: ["WATER"],
    l2_8: ["RECYCLING"],
    l2_9: ["WINDOW"],
    l2_10: ["DRESSLER"]
  };
  Object.entries(l2Answers).forEach(([qId, correctList]) => {
    const student = (answers[qId] || "").toString().trim().toUpperCase();
    if (correctList.includes(student)) {
      score++;
    }
  });

  // Grammar (g_1 to g_30)
  const gAnswers: Record<string, string> = {
    g_1: "visited", g_2: "went", g_3: "have never tried", g_4: "goes", g_5: "beautiful", g_6: "carefully",
    g_7: "B", g_8: "C", g_9: "reading", g_10: "C", g_11: "B", g_12: "C", g_13: "A", g_14: "A", g_15: "B",
    g_16: "C", g_17: "D", g_18: "A", g_19: "C", g_20: "B", g_21: "B", g_22: "C", g_23: "B", g_24: "B",
    g_25: "B", g_26: "C", g_27: "B", g_28: "A", g_29: "B", g_30: "B"
  };
  Object.entries(gAnswers).forEach(([qId, correct]) => {
    const student = (answers[qId] || "").toString().trim().toLowerCase();
    if (student === correct.toLowerCase()) {
      score++;
    }
  });

  // Vocabulary (v_1 to v_22)
  const vAnswers: Record<string, string> = {
    v_1: "B", v_2: "A", v_3: "C", v_4: "D", v_5: "A",
    v_6: "B", v_7: "C", v_8: "D", v_9: "A", v_10: "B",
    v_11: "C", v_12: "C", v_13: "B", v_14: "A", v_15: "D",
    v_16: "C", v_17: "B", v_18: "A", v_19: "D", v_20: "C",
    v_21: "A", v_22: "B"
  };
  Object.entries(vAnswers).forEach(([qId, correct]) => {
    if (answers[qId]?.toString().trim().toUpperCase() === correct) {
      score++;
    }
  });

  // Reading (r_1 to r_6)
  const rAnswers: Record<string, string> = {
    r_1: "B", r_2: "C", r_3: "A", r_4: "TRUE", r_5: "FALSE", r_6: "NOT GIVEN"
  };
  Object.entries(rAnswers).forEach(([qId, correct]) => {
    if (answers[qId]?.toString().trim().toUpperCase() === correct) {
      score++;
    }
  });

  return score;
}

// Calculate score dynamically based on test configuration
export function calculateCandidateScore(candidate: any, tests: any[]): number {
  if (!candidate || !candidate.answers) return 0;
  const tId = candidate.testId || "exam-test-1";

  if (tId === "exam-test-1") {
    return calculateObjectiveScore(candidate.answers);
  }

  const test = tests.find((t) => t.id === tId);
  if (!test || !test.questions) return 0;

  let correct = 0;
  test.questions.forEach((q: any) => {
    const ans = String(candidate.answers[q.id] || "").trim().toUpperCase();
    const correctAns = String(q.correctAnswer || "").trim().toUpperCase();
    if (ans === correctAns) {
      correct++;
    }
  });
  return correct;
}

interface AdminPanelProps {
  isDarkMode: boolean;
  onThemeToggle: () => void;
  onClose: () => void;
  onLoginAsStudent?: (student: any) => void;
}

export default function AdminPanel({ isDarkMode, onThemeToggle, onClose, onLoginAsStudent }: AdminPanelProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ total: 0, completed: 0, inProgress: 0, avgScore: 0 });
  const [candidates, setCandidates] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [candidateExamFilter, setCandidateExamFilter] = useState("all");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // First run state
  const [isFirstAdminRun, setIsFirstAdminRun] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");

  // Materials states
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialForm, setMaterialForm] = useState<Partial<Material>>({
    title: "",
    type: "pdf",
    url: "",
    description: ""
  });
  const [materialFormOpen, setMaterialFormOpen] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);

  // CEFR Stats States
  const [selectedStatsTestId, setSelectedStatsTestId] = useState("all");

  // Change Password state
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordChangeSaving, setPasswordChangeSaving] = useState(false);

  // Full-screen answers modal states
  const [showFullScreenAnswers, setShowFullScreenAnswers] = useState(false);
  const [ansFilter, setAnsFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  // Tab State: "candidates" | "tests" | "materials" | "settings"
  const [activeTab, setActiveTab] = useState<"candidates" | "tests" | "materials" | "settings">("candidates");

  // Global branding settings
  const [globalSettings, setGlobalSettings] = useState<any>({
    backgroundColor: "#002147",
    logoUrl: "",
    externalApiUrl: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactZalo: "",
    contactFacebook: "",
    contactWebsite: "",
    contactAddress: ""
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Custom toast and confirm modal states
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: "reset_session" | "delete_candidate" | "delete_test" | "delete_material";
    title: string;
    description: string;
    targetId: string;
    actionLabel: string;
    actionClass: string;
  }>({
    isOpen: false,
    type: "reset_session",
    title: "",
    description: "",
    targetId: "",
    actionLabel: "",
    actionClass: ""
  });

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleToggleBlock = async (candidateId: string) => {
    try {
      const result = await toggleBlockCandidate(candidateId);
      showToast(
        result.isBlocked
          ? "Đã khóa thí sinh thành công! Thí sinh này sẽ không thể dự thi kỳ thi nào nữa."
          : "Đã mở khóa thí sinh thành công!",
        "success"
      );
      fetchAdminData();
    } catch (err: any) {
      showToast(err.message || "Không thể kết nối máy chủ.", "error");
    }
  };

  const triggerResetSession = (candidateId: string, candidateName: string) => {
    setConfirmModal({
      isOpen: true,
      type: "reset_session",
      title: "Cấp quyền thi tiếp (Reset)",
      description: `Thầy cô có chắc chắn muốn khôi phục trạng thái làm bài cho học sinh "${candidateName}"? Trạng thái sẽ chuyển về "Đang thi" (IN_PROGRESS), giúp học sinh tiếp tục bài làm mà không bị mất dữ liệu trước đó.`,
      targetId: candidateId,
      actionLabel: "CHO THI TIẾP",
      actionClass: "bg-amber-600 hover:bg-amber-700 text-white"
    });
  };

  const triggerDeleteCandidate = (candidateId: string, candidateName: string) => {
    setConfirmModal({
      isOpen: true,
      type: "delete_candidate",
      title: "Xóa vĩnh viễn học sinh",
      description: `Học sinh "${candidateName}" cùng toàn bộ kết quả trắc nghiệm, bài viết (Writing) và file ghi âm nói (Speaking) sẽ bị xóa vĩnh viễn khỏi hệ thống phòng thi. Thầy cô chắc chắn muốn thực hiện?`,
      targetId: candidateId,
      actionLabel: "XÓA VĨNH VIỄN",
      actionClass: "bg-red-600 hover:bg-red-750 text-white"
    });
  };

  const triggerDeleteTest = (testId: string, testName: string) => {
    setConfirmModal({
      isOpen: true,
      type: "delete_test",
      title: "Xóa đề thi tuyển sinh",
      description: `Đề thi "${testName}" (Mã: ${testId}) sẽ bị loại bỏ hoàn toàn khỏi hệ thống. Thí sinh sẽ không thể truy cập link phòng thi này nữa. Hành động không thể hoàn tác.`,
      targetId: testId,
      actionLabel: "XÁC NHẬN XÓA",
      actionClass: "bg-red-600 hover:bg-red-750 text-white"
    });
  };

  const handleConfirmAction = async () => {
    const { type, targetId } = confirmModal;
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    
    if (type === "reset_session") {
      try {
        await resetCandidateStatus(targetId);
        showToast("Đã reset trạng thái, cho phép học sinh thi tiếp thành công!", "success");
        fetchAdminData();
        if (selectedCandidate && selectedCandidate.id === targetId) {
          handleViewDetails(targetId);
        }
      } catch (err: any) {
        showToast(err.message || "Có lỗi xảy ra khi reset trạng thái học sinh.", "error");
      }
    } else if (type === "delete_candidate") {
      try {
        await deleteCandidate(targetId);
        showToast("Đã xóa học sinh khỏi hệ thống thành công!", "success");
        setSelectedCandidate(null);
        fetchAdminData();
      } catch (err: any) {
        showToast(err.message || "Có lỗi xảy ra khi xóa học sinh.", "error");
      }
    } else if (type === "delete_test") {
      try {
        await deleteExam(targetId);
        showToast("Đã xóa đề thi tuyển sinh thành công!", "success");
        fetchAdminData();
      } catch (err: any) {
        showToast(err.message || "Không thể xóa đề thi.", "error");
      }
    } else if (type === "delete_material") {
      try {
        await deleteMaterial(targetId);
        showToast("Đã xóa tài liệu học tập thành công!", "success");
        fetchAdminData();
      } catch (err: any) {
        showToast(err.message || "Không thể xóa tài liệu.", "error");
      }
    }
  };

  // Custom Test Editor State
  const [editingTest, setEditingTest] = useState<any | null>(null);
  const [testForm, setTestForm] = useState({
    name: "",
    code: "",
    category: "GENERAL",
    status: "Đang mở",
    audioUrl: "",
    durationLimit: 45,
    questions: [] as any[]
  });
  const [aiParsing, setAiParsing] = useState(false);
  const [selectedImageBase64, setSelectedImageBase64] = useState("");
  const [imageMimeType, setImageMimeType] = useState("");

  // Manual grading state
  const [writingGrades, setWritingGrades] = useState<Record<string, { score: number; comment: string }>>({});

  const writingReferences: Record<string, string> = {
    w_1: "Doing exercise every day helps people keep/stay in good health.",
    w_2: "The teacher allows students to use dictionaries during the lesson.",
    w_3: "Many families spend time participating in outdoor activities at weekends.",
    w_4: "Cities should plant more trees to improve air quality.",
    w_5: "Smartphones, which can be used for communication, are also distracting.",
    w_6: "Students who love history often visit museums at weekends.",
    w_7: "Students participating in clubs often develop communication skills faster.",
    w_8: "People should preserve traditional festivals, which reflect local history and culture.",
    w_9: "Although artificial intelligence saves time, people still need to learn how to use it smartly/wisely.",
    w_10: "Reducing the use of single-use plastic can protect the ocean for future generations."
  };

  const writingVietnamese: Record<string, string> = {
    w_1: "Tập thể dục mỗi ngày giúp mọi người giữ gìn sức khỏe tốt.",
    w_2: "Giáo viên cho phép học sinh sử dụng từ điển trong giờ học.",
    w_3: "Nhiều gia đình dành thời gian tham gia các hoạt động ngoài trời vào cuối tuần.",
    w_4: "Các thành phố nên trồng thêm cây để cải thiện chất lượng không khí.",
    w_5: "Điện thoại thông minh, cái mà có thể sử dụng để liên lạc, cũng gây mất tập trung.",
    w_6: "Những học sinh yêu thích lịch sử thường tham quan các bảo tàng vào cuối tuần.",
    w_7: "Học sinh tham gia các câu lạc bộ thường phát triển kỹ năng giao tiếp nhanh hơn.",
    w_8: "Mọi người nên bảo tồn các lễ hội truyền thống, vốn phản ánh lịch sử và văn hóa địa phương.",
    w_9: "Mặc dù trí tuệ nhân tạo tiết kiệm thời gian, con người vẫn cần học cách sử dụng nó một cách thông minh/khôn khéo.",
    w_10: "Việc giảm sử dụng nhựa dùng một lần có thể bảo vệ đại dương cho các thế hệ tương lai."
  };

  useEffect(() => {
    isFirstRun().then((firstRun) => {
      setIsFirstAdminRun(firstRun);
    });

    getCurrentAdminToken().then((token) => {
      if (token) {
        setIsLoggedIn(true);
        fetchAdminData();
      } else {
        // Fallback to local storage token for session persistent state
        const adminToken = localStorage.getItem("adminToken");
        if (adminToken) {
          setIsLoggedIn(true);
          fetchAdminData();
        }
      }
    });
    // Fetch global settings even if not logged in to render branding accurately
    fetchBranding();
  }, []);

  const fetchBranding = () => {
    getGlobalSettings()
      .then((data) => {
        setGlobalSettings(data);
      })
      .catch((err) => console.error("Error loading branding settings:", err));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setError("");
    try {
      const token = await loginAdmin(password);
      localStorage.setItem("adminToken", token);
      setIsLoggedIn(true);
      fetchAdminData();
    } catch (err: any) {
      setError(err.message || "Mật khẩu không đúng");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutAdmin();
    } catch (err) {
      console.error("Logout failed:", err);
    }
    localStorage.removeItem("adminToken");
    setIsLoggedIn(false);
    setSelectedCandidate(null);
  };

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // Fetch both exams and candidates list
      const testsData = await getAdminExams();
      const listData = await getCandidatesAdminList(testsData);
      
      // Calculate stats locally from the fetched lists
      const total = listData.length;
      const completed = listData.filter(c => c.status === "COMPLETED").length;
      const inProgress = total - completed;
      
      let totalScoreSum = 0;
      let scoredCount = 0;
      listData.forEach(c => {
        if (c.status === "COMPLETED") {
          totalScoreSum += c.objectiveScore || 0;
          scoredCount++;
        }
      });
      const avgScore = scoredCount > 0 ? Number((totalScoreSum / scoredCount).toFixed(1)) : 0;
      
      setStats({
        total,
        completed,
        inProgress,
        avgScore
      });
      setCandidates(listData);
      setTests(testsData);

      // Fetch study materials
      const materialsData = await getMaterials();
      setMaterials(materialsData);
    } catch (err) {
      console.error("Error fetching admin metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (candidateId: string) => {
    try {
      const fullCandidate = await getCandidateDetails(candidateId);
      setSelectedCandidate(fullCandidate);
      const initialGrades: Record<string, { score: number; comment: string }> = {};
      Object.keys(writingReferences).forEach((key) => {
        initialGrades[key] = fullCandidate.writingGrades?.[key] || { score: 0, comment: "" };
      });
      setWritingGrades(initialGrades);
    } catch (err) {
      showToast("Không thể tải chi tiết thí sinh", "error");
    }
  };

  const handleSaveWritingGrades = async () => {
    if (!selectedCandidate) return;
    try {
      const updatedCandidate = await gradeCandidateWriting(selectedCandidate.id, writingGrades);
      showToast("Đã cập nhật điểm Writing và nhận xét thành công!", "success");
      setSelectedCandidate(updatedCandidate);
      fetchAdminData();
    } catch (err) {
      showToast("Có lỗi xảy ra khi lưu điểm.", "error");
    }
  };

  const handleResetSession = async (candidateId: string) => {
    const cand = candidates.find((c) => c.id === candidateId) || selectedCandidate;
    triggerResetSession(candidateId, cand?.fullName || "Thí sinh");
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    const cand = candidates.find((c) => c.id === candidateId) || selectedCandidate;
    triggerDeleteCandidate(candidateId, cand?.fullName || "Thí sinh");
  };

  const handleSaveBrandingSettings = async () => {
    setSettingsSaving(true);
    try {
      await updateGlobalSettings(globalSettings);
      showToast("Đã cập nhật cấu hình hệ thống & giao diện thành công!", "success");
      fetchBranding();
    } catch (err) {
      showToast("Không thể lưu cài đặt.", "error");
    } finally {
      setSettingsSaving(false);
    }
  };

  // Custom Test handling
  const handleCreateTestBtn = () => {
    setEditingTest("new");
    setTestForm({
      name: "",
      code: "",
      category: "GENERAL",
      status: "Đang mở",
      audioUrl: "",
      durationLimit: 45,
      questions: []
    });
  };

  const handleEditTest = (test: any) => {
    setEditingTest(test.id);
    setTestForm({
      name: test.name,
      code: test.code || test.id,
      category: test.category || "GENERAL",
      status: test.status || "Đang mở",
      audioUrl: test.audioUrl || "",
      durationLimit: test.durationLimit !== undefined ? test.durationLimit : 45,
      questions: test.questions || []
    });
  };

  const handleDeleteTest = async (testId: string) => {
    const testObj = tests.find((t) => t.id === testId);
    triggerDeleteTest(testId, testObj?.name || testId);
  };

  const handleSaveTest = async () => {
    if (!testForm.name || !testForm.code) {
      showToast("Tên bài thi và Mã bài thi không được để trống.", "error");
      return;
    }

    try {
      const isNew = editingTest === "new";
      if (isNew) {
        await createExam(testForm);
        showToast("Tạo đề thi mới thành công!", "success");
      } else {
        await updateExam(editingTest, testForm);
        showToast("Lưu đề thi thành công!", "success");
      }
      setEditingTest(null);
      fetchAdminData();
    } catch (err: any) {
      showToast(err.message || "Có lỗi xảy ra.", "error");
    }
  };

  // Parse questions from image
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageMimeType("image/jpeg");
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);
          setSelectedImageBase64(compressedBase64);
          setImageMimeType("image/jpeg");
        } else {
          setSelectedImageBase64(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleParseImage = async () => {
    if (!selectedImageBase64) {
      showToast("Vui lòng chọn hoặc kéo thả ảnh đề thi trước.", "info");
      return;
    }
    setAiParsing(true);
    try {
      const parsedQuestions = await parseImageWithAI(selectedImageBase64, imageMimeType);
      if (parsedQuestions && parsedQuestions.length > 0) {
        showToast(`Thành công! Đã trích xuất được ${parsedQuestions.length} câu hỏi trắc nghiệm từ hình ảnh đề thi.`, "success");
        setTestForm((prev) => ({
          ...prev,
          questions: [...prev.questions, ...parsedQuestions]
        }));
        setSelectedImageBase64("");
      } else {
        showToast("Không thể trích xuất được câu hỏi nào từ hình ảnh này.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Lỗi kết nối AI.", "error");
    } finally {
      setAiParsing(false);
    }
  };

  const addManualQuestion = () => {
    const newQ = {
      id: `q_manual_${Date.now()}`,
      type: "mcq",
      questionText: "New English Question text...",
      options: [
        { key: "A", text: "Option A" },
        { key: "B", text: "Option B" },
        { key: "C", text: "Option C" },
        { key: "D", text: "Option D" }
      ],
      correctAnswer: "A"
    };
    setTestForm((prev) => ({
      ...prev,
      questions: [...prev.questions, newQ]
    }));
  };

  const removeQuestion = (qId: string) => {
    setTestForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== qId)
    }));
  };

  const updateQuestionText = (qId: string, val: string) => {
    setTestForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === qId ? { ...q, questionText: val } : q))
    }));
  };

  const updateQuestionOption = (qId: string, optKey: string, val: string) => {
    setTestForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id === qId) {
          const updatedOpts = q.options.map((o: any) => (o.key === optKey ? { ...o, text: val } : o));
          return { ...q, options: updatedOpts };
        }
        return q;
      })
    }));
  };

  const updateQuestionCorrect = (qId: string, val: string) => {
    setTestForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === qId ? { ...q, correctAnswer: val } : q))
    }));
  };

  const handleExportCSV = () => {
    let csvContent = "\ufeff";
    csvContent += "Họ và tên,Số điện thoại,Bài thi,Trạng thái,Số lần chuyển tab,Thời gian bắt đầu,Thời gian nộp bài,Thời gian làm bài,Điểm số trắc nghiệm\n";

    candidates.forEach((c) => {
      const duration = formatDuration(c.durationSeconds);
      const testName = tests.find((t) => t.id === c.testId)?.name || "IELTS default";
      const score = calculateCandidateScore(c, tests);
      const row = [
        `"${c.fullName}"`,
        `"${c.phoneNumber}"`,
        `"${testName}"`,
        `"${c.status === "COMPLETED" ? "Đã nộp" : "Đang làm"}"`,
        c.tabViolations,
        `"${new Date(c.startTime).toLocaleString("vi-VN")}"`,
        c.endTime ? `"${new Date(c.endTime).toLocaleString("vi-VN")}"` : '"-"',
        `"${duration}"`,
        score
      ].join(",");
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `DanhSachThiSinh_AdminExport_${new Date().toLocaleDateString("vi-VN")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rSecs = secs % 60;
    return `${mins}m ${rSecs}s`;
  };

  const handleFirstRunSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassword) {
      showToast("Vui lòng nhập mật khẩu quản trị mới", "error");
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      showToast("Mật khẩu xác nhận không khớp", "error");
      return;
    }
    setLoginLoading(true);
    try {
      await setupAdmin(newAdminPassword);
      showToast("Khởi tạo tài khoản quản trị thành công! Vui lòng đăng nhập với mật khẩu mới.", "success");
      setIsFirstAdminRun(false);
      setPassword(newAdminPassword);
    } catch (err: any) {
      showToast(err.message || "Lỗi khởi tạo tài khoản.", "error");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialForm.title || !materialForm.url) {
      showToast("Vui lòng nhập đầy đủ tiêu đề và liên kết học tập", "error");
      return;
    }
    setMaterialsSaving(true);
    try {
      await addMaterial(materialForm as Omit<Material, "id">);
      showToast("Đã thêm tài liệu học tập mới thành công!", "success");
      setMaterialForm({ title: "", type: "pdf", url: "", description: "" });
      setMaterialFormOpen(false);
      fetchAdminData();
    } catch (err: any) {
      showToast(err.message || "Không thể lưu tài liệu.", "error");
    } finally {
      setMaterialsSaving(false);
    }
  };

  const handleDeleteMaterialTrigger = (materialId: string, title: string) => {
    setConfirmModal({
      isOpen: true,
      type: "delete_material",
      title: "Xóa tài liệu học tập",
      description: `Tài liệu "${title}" sẽ bị xóa vĩnh viễn khỏi danh sách bài tự học của học sinh. Thầy cô chắc chắn muốn thực hiện?`,
      targetId: materialId,
      actionLabel: "XÁC NHẬN XÓA",
      actionClass: "bg-red-600 hover:bg-red-750 text-white"
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changePasswordForm.currentPassword || !changePasswordForm.newPassword) {
      showToast("Vui lòng điền đầy đủ các trường mật khẩu", "error");
      return;
    }
    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      showToast("Mật khẩu xác nhận không khớp", "error");
      return;
    }
    setPasswordChangeSaving(true);
    try {
      await changeAdminPassword(changePasswordForm.currentPassword, changePasswordForm.newPassword);
      showToast("Thay đổi mật khẩu quản trị thành công!", "success");
      setChangePasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err: any) {
      showToast(err.message || "Có lỗi xảy ra khi đổi mật khẩu.", "error");
    } finally {
      setPasswordChangeSaving(false);
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    const matchSearch =
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phoneNumber.includes(searchQuery);
    const matchExam = candidateExamFilter === "all" || c.testId === candidateExamFilter;
    return matchSearch && matchExam;
  });

  const brandBgColor = globalSettings.backgroundColor || "#002147";
  const brandBgStyle = { backgroundColor: brandBgColor };
  const brandTextStyle = { color: brandBgColor };

  if (!isLoggedIn) {
    if (isFirstAdminRun) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center px-4 transition-colors duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                <Sparkles size={32} className="animate-bounce" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">KHỞI TẠO QUẢN TRỊ VIÊN</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Chào mừng thầy cô! Đây là lần đầu tiên hệ thống hoạt động. Vui lòng thiết lập mật khẩu Admin an toàn cho phòng thi.
              </p>
            </div>

            <form onSubmit={handleFirstRunSetup} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  MẬT KHẨU ADMIN MỚI
                </label>
                <input
                  type="password"
                  placeholder="Nhập ít nhất 6 ký tự..."
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  XÁC NHẬN MẬT KHẨU ADMIN
                </label>
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu trên..."
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 text-white font-bold rounded-xl shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
                style={brandBgStyle}
              >
                {loginLoading ? "Đang khởi tạo..." : "KÍCH HOẠT HỆ THỐNG"}
              </button>
            </form>

            <div className="text-center pt-2">
              <button
                onClick={onClose}
                className="text-xs text-slate-500 hover:underline cursor-pointer"
              >
                Quay lại Trang Chủ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center px-4 transition-colors duration-200">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <Lock size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">TRANG QUẢN TRỊ VIÊN</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vui lòng nhập mật khẩu quản trị để cấu hình đề thi, thay đổi giao diện, chấm điểm và xem tiến trình thi.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-pass" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                MẬT KHẨU QUẢN TRỊ
              </label>
              <input
                id="admin-pass"
                type="password"
                placeholder="Nhập mật khẩu (Mặc định: Admin@2026)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                required
              />
            </div>

            {error && (
              <div className="p-3 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-center gap-2">
                <AlertTriangle size={15} />
                {error}
              </div>
            )}

            <button
              id="admin-login-submit"
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 text-white font-bold rounded-xl shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              style={brandBgStyle}
            >
              {loginLoading ? "Đang xác minh..." : "ĐĂNG NHẬP HỆ THỐNG"}
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              onClick={onClose}
              id="admin-exit-btn"
              className="text-xs font-bold hover:underline cursor-pointer"
              style={brandTextStyle}
            >
              Quay lại Trang Chủ
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex flex-col transition-colors duration-200">
      {/* Admin Header */}
      <header className="sticky top-0 z-45 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="text-white p-2.5 rounded-xl font-extrabold text-xs tracking-widest flex items-center justify-center shadow"
            style={brandBgStyle}
          >
            PORTAL
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-850 dark:text-slate-100 tracking-tight">
              Hệ Thống Đánh Giá & Cấu Hình Đề Thi
            </h1>
            <p className="text-[10px] text-slate-450 uppercase tracking-widest font-bold">English Entrance Exams Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle isDarkMode={isDarkMode} onToggle={onThemeToggle} />
          <button
            onClick={fetchAdminData}
            id="admin-refresh-btn"
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 transition cursor-pointer"
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleLogout}
            id="admin-logout-btn"
            className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-bold text-xs flex items-center gap-1.5 border border-red-200/50 dark:border-red-900/35 transition cursor-pointer active:scale-95"
          >
            <LogOut size={13} />
            Đăng xuất
          </button>
          <button
            onClick={onClose}
            id="admin-backtohome-btn"
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-350 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs transition cursor-pointer shadow-sm active:scale-95"
          >
            Về Trang Chủ
          </button>
        </div>
      </header>

      {/* Tabs Row */}
      {!selectedCandidate && !editingTest && (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6">
          <div className="max-w-7xl mx-auto flex gap-6">
            <button
              onClick={() => setActiveTab("candidates")}
              className={`py-4 px-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "candidates"
                  ? "border-indigo-650 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-850"
              }`}
            >
              <Users size={15} />
              Quản lý Thí sinh
            </button>
            <button
              onClick={() => setActiveTab("tests")}
              className={`py-4 px-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "tests"
                  ? "border-indigo-650 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-850"
              }`}
            >
              <FileText size={15} />
              Quản lý Đề thi & Thống kê
            </button>
            <button
              onClick={() => setActiveTab("materials")}
              className={`py-4 px-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "materials"
                  ? "border-indigo-650 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-850"
              }`}
            >
              <BookOpen size={15} />
              Tài liệu học tập
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`py-4 px-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "settings"
                  ? "border-indigo-650 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-850"
              }`}
            >
              <Settings size={15} />
              Cấu hình Hệ thống
            </button>
          </div>
        </div>
      )}

      {/* Main Admin Workspace */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Candidate Detail grading sub-panel */}
        {selectedCandidate && (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedCandidate(null)}
              id="detail-back-btn"
              className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition cursor-pointer active:scale-95"
            >
              <ChevronLeft size={15} />
              Quay lại danh sách thí sinh
            </button>

            {/* Candidate Header Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="text-white p-6 rounded-2xl shadow-md space-y-3 flex flex-col justify-between" style={brandBgStyle}>
                <div className="space-y-3">
                  <span className="px-2 py-0.5 bg-yellow-400 text-slate-900 rounded font-black text-[10px] tracking-wider uppercase">
                    THÔNG TIN THÍ SINH
                  </span>
                  <h2 className="text-xl font-bold">{selectedCandidate.fullName}</h2>
                  <div className="space-y-1.5 text-xs text-indigo-100">
                    <p>Số điện thoại: <span className="font-mono text-white font-semibold">{selectedCandidate.phoneNumber}</span></p>
                    <p>Bắt đầu: {new Date(selectedCandidate.startTime).toLocaleString("vi-VN")}</p>
                    {selectedCandidate.endTime && (
                      <p>Nộp bài: {new Date(selectedCandidate.endTime).toLocaleString("vi-VN")}</p>
                    )}
                    <p>Thời gian làm bài: <span className="text-yellow-400 font-bold">{formatDuration(selectedCandidate.durationSeconds)}</span></p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onLoginAsStudent) {
                      onLoginAsStudent(selectedCandidate);
                    }
                  }}
                  className="w-full mt-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[10.5px] font-black transition active:scale-95 cursor-pointer uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <Users size={12} /> Đăng nhập vai học sinh
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 rounded-lg text-xs font-bold uppercase tracking-wider">
                  BẢO MẬT & CHỐNG GIAN LẬN
                </span>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Số lần chuyển tab:</span>
                    <span className={`font-black ${selectedCandidate.tabViolations > 0 ? "text-red-600" : "text-slate-650 dark:text-slate-300"}`}>
                      {selectedCandidate.tabViolations} lần
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-500">
                    {selectedCandidate.tabViolations > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-bold">
                        ⚠ Chú ý: Thí sinh có hành vi chuyển đổi tab khi đang làm bài. Giáo viên nên kiểm duyệt kỹ đáp án.
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        ✓ Tuyệt vời: Thí sinh không chuyển tab trong suốt quá trình làm bài.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 rounded-lg text-xs font-bold uppercase tracking-wider">
                    ĐIỂM SỐ TRẮC NGHIỆM
                  </span>
                  <div className="mt-3 flex items-baseline gap-2">
                    <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400" style={brandTextStyle}>
                      {calculateCandidateScore(selectedCandidate, tests)}
                    </p>
                    <p className="text-sm text-slate-400">/ {selectedCandidate.testId === "exam-test-1" ? "75" : (tests.find(t=>t.id === selectedCandidate.testId)?.questions?.length || 0)} câu</p>
                  </div>
                  <button
                    onClick={() => setShowFullScreenAnswers(true)}
                    className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer uppercase tracking-wider"
                  >
                    <Eye size={13} />
                    Xem chi tiết đáp án đúng/sai (Toàn màn hình)
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-150 dark:border-slate-800 flex items-center justify-between gap-2 mt-4">
                  <div className="text-xs text-slate-500">
                    Bài thi: <span className="font-bold text-slate-750 dark:text-slate-300">{tests.find(t => t.id === selectedCandidate.testId)?.name || "IELTS Default"}</span>
                  </div>
                  <button
                    onClick={() => handleResetSession(selectedCandidate.id)}
                    className="text-xs text-amber-600 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <RefreshCw size={12} /> Cho thi tiếp
                  </button>
                </div>
              </div>
            </div>

            {/* Speaking & Writing check results inside candidate detail screen */}
            {selectedCandidate.testId === "exam-test-1" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Writing translations grading list */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="text-md font-bold text-slate-850 dark:text-slate-100 uppercase tracking-tight flex items-center gap-1.5">
                      Phần Chấm Điểm Writing (Translation)
                    </h3>
                    <button
                      onClick={handleSaveWritingGrades}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1"
                    >
                      <Save size={13} />
                      Lưu điểm Writing
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {Object.keys(writingReferences).map((key, idx) => {
                      const studentText = selectedCandidate.answers[key] || "";
                      return (
                        <div key={key} className="p-4 bg-slate-50/55 dark:bg-slate-900/35 border border-slate-150 dark:border-slate-800/80 rounded-xl space-y-2">
                          <p className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">Câu hỏi {idx + 1}: {writingVietnamese[key]}</p>
                          <div className="p-2.5 bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
                            <p className="font-semibold text-slate-400 uppercase text-[9px] tracking-wider">Bài làm của thí sinh:</p>
                            <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{studentText || <span className="italic text-red-400">Bỏ trống không làm</span>}</p>
                          </div>
                          <div className="p-2 bg-slate-100/60 dark:bg-slate-800/40 rounded-lg text-xs border border-transparent">
                            <p className="font-semibold text-slate-400 uppercase text-[9px] tracking-wider">Gợi ý đáp án:</p>
                            <p className="mt-0.5 text-slate-600 dark:text-slate-300 font-mono text-[10.5px] leading-relaxed">{writingReferences[key]}</p>
                          </div>

                          <div className="flex items-center gap-4 pt-1">
                            <div className="flex-1 flex items-center gap-2 text-xs">
                              <span className="font-bold text-slate-500">Điểm:</span>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                step="0.5"
                                value={writingGrades[key]?.score || 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setWritingGrades(prev => ({ ...prev, [key]: { ...prev[key], score: val } }));
                                }}
                                className="w-16 px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded focus:ring-1 focus:ring-indigo-500 text-center font-bold"
                              />
                              <span className="text-slate-400">/ 10 điểm</span>
                            </div>

                            <div className="flex-[3]">
                              <input
                                type="text"
                                placeholder="Nhận xét câu dịch này..."
                                value={writingGrades[key]?.comment || ""}
                                onChange={(e) => {
                                  setWritingGrades(prev => ({ ...prev, [key]: { ...prev[key], comment: e.target.value } }));
                                }}
                                className="w-full px-3 py-1 text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Speaking recordings panel */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <h3 className="text-md font-bold text-slate-850 dark:text-slate-100 uppercase tracking-tight border-b border-slate-100 dark:border-slate-800 pb-3">
                    Phần Kiểm tra Speaking (Ghi âm)
                  </h3>

                  <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2">
                    {/* Speaking Passage */}
                    {(() => {
                      const levelId = selectedCandidate.answers?.speaking_level || "medium";
                      const activeLvl = SPEAKING_PART_1.levels.find(l => l.id === levelId) || SPEAKING_PART_1.levels[1];
                      const passageAudio = selectedCandidate.speakingFiles?.s1_1 || selectedCandidate.speakingFiles?.passage;

                      return (
                        <div className="p-4 bg-slate-50/55 dark:bg-slate-900/35 border border-slate-150 dark:border-slate-800/80 rounded-xl space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                            <p className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                              Task 1: Đọc đoạn văn thành tiếng (Passage)
                            </p>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100/30">
                              Mức: {activeLvl.name} ({activeLvl.difficulty})
                            </span>
                          </div>
                          
                          <div className="text-xs space-y-1 text-slate-500">
                            <p className="font-semibold text-slate-600 dark:text-slate-450">Đoạn văn học sinh nhận được:</p>
                            <blockquote className="p-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 italic text-xs leading-relaxed text-slate-650 dark:text-slate-300">
                              &ldquo;{activeLvl.passage}&rdquo;
                            </blockquote>
                          </div>

                          {passageAudio ? (
                            <div className="space-y-2">
                              <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                ✓ Đã nộp file ghi âm giọng đọc
                              </p>
                              <audio src={passageAudio} controls className="w-full h-8" />
                            </div>
                          ) : (
                            <p className="text-xs text-red-400 italic">Thí sinh chưa nộp ghi âm câu này.</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Interview Audio */}
                    <div className="p-4 bg-slate-50/55 dark:bg-slate-900/35 border border-slate-150 dark:border-slate-800/80 rounded-xl space-y-4">
                      <p className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                        Task 2: Trả lời 3 câu hỏi phỏng vấn (Interview)
                      </p>
                      
                      <div className="space-y-4">
                        {SPEAKING_PART_2.questions.map((q, idx) => {
                          const qAudio = selectedCandidate.speakingFiles?.[q.id] || (idx === 0 ? selectedCandidate.speakingFiles?.interview : undefined);
                          return (
                            <div key={q.id} className="p-3 bg-white dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800/70 space-y-2.5">
                              <div className="text-xs">
                                <p className="font-bold text-slate-700 dark:text-slate-300">Câu hỏi {idx + 1}:</p>
                                <p className="italic text-slate-600 dark:text-slate-400 font-medium">&ldquo;{q.text}&rdquo;</p>
                              </div>

                              {qAudio ? (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    ✓ Đã nộp file ghi âm câu trả lời
                                  </p>
                                  <audio src={qAudio} controls className="w-full h-8" />
                                </div>
                              ) : (
                                <p className="text-[11px] text-red-400 italic">Thí sinh chưa nộp ghi âm câu này.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="text-md font-bold text-slate-850 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                  KẾT QUẢ ĐÁP ÁN BÀI THI CHI TIẾT
                </h3>
                <div className="p-4 bg-slate-50/40 dark:bg-slate-800/20 rounded-xl max-h-[400px] overflow-y-auto space-y-2">
                  {Object.keys(selectedCandidate.answers || {}).map((qId, idx) => {
                    const ans = selectedCandidate.answers[qId];
                    const matchedTest = tests.find(t=>t.id === selectedCandidate.testId);
                    const qObj = matchedTest?.questions?.find((q:any) => q.id === qId);
                    if (!qObj) return null;
                    const isCorrect = String(ans || "").toUpperCase() === String(qObj.correctAnswer || "").toUpperCase();

                    return (
                      <div key={qId} className="p-3 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs">
                        <div className="space-y-1">
                          <p className="font-bold">Câu hỏi {idx+1}: {qObj.questionText}</p>
                          <p className="text-slate-500">
                            Thí sinh chọn: <span className="font-black text-indigo-650 dark:text-blue-400">{ans || "Không trả lời"}</span> | Đáp án đúng: <span className="font-bold text-emerald-600">{qObj.correctAnswer}</span>
                          </p>
                        </div>
                        <div>
                          {isCorrect ? (
                            <span className="p-1 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600"><Check size={14} /></span>
                          ) : (
                            <span className="p-1 rounded-full bg-red-50 dark:bg-red-950/20 text-red-500"><X size={14} /></span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Test Creator Page or Slideover */}
        {editingTest && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-150 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-850 dark:text-slate-100">
                  {editingTest === "new" ? "TẠO ĐỀ THI ĐÁNH GIÁ NĂNG LỰC MỚI" : `CHỈNH SỬA ĐỀ THI: ${editingTest}`}
                </h2>
                <p className="text-xs text-slate-450 mt-1">
                  Nhập cấu hình đề thi hoặc trích xuất đề thi siêu tốc bằng trí tuệ nhân tạo Gemini AI.
                </p>
              </div>
              <button
                onClick={() => setEditingTest(null)}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 dark:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Test Settings Left Form panel */}
              <div className="lg:col-span-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Tên Đề Thi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Đánh giá tiếng Anh lớp 10 chất lượng cao"
                    value={testForm.name}
                    onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Mã Đề Thi (Test Code) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: test-lop-10"
                    value={testForm.code}
                    disabled={editingTest !== "new"}
                    onChange={(e) => setTestForm({ ...testForm, code: e.target.value.toLowerCase().trim() })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Thể loại
                    </label>
                    <select
                      value={testForm.category}
                      onChange={(e) => setTestForm({ ...testForm, category: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none text-xs font-bold"
                    >
                      <option value="GENERAL">General English</option>
                      <option value="IELTS">IELTS Mock</option>
                      <option value="TOEIC">TOEIC Exam</option>
                      <option value="CAMBRIDGE">Cambridge Exam</option>
                      <option value="MIDTERM">Giữa kỳ</option>
                      <option value="FINAL">Cuối kỳ</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Trạng thái bài thi
                    </label>
                    <select
                      value={testForm.status}
                      onChange={(e) => setTestForm({ ...testForm, status: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none text-xs font-bold"
                    >
                      <option value="Đang mở">Đang mở (Được dự thi)</option>
                      <option value="Đã đóng">Đã đóng (Ẩn)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Thời gian làm bài (Phút) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    placeholder="Nhập số phút làm bài, ví dụ: 45"
                    value={testForm.durationLimit}
                    onChange={(e) => setTestForm({ ...testForm, durationLimit: Math.max(1, parseInt(e.target.value) || 0) })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Audio Link (Đoạn băng Listening)
                  </label>
                  <input
                    type="text"
                    placeholder="Nhập link file âm thanh (mp3) nếu có..."
                    value={testForm.audioUrl}
                    onChange={(e) => setTestForm({ ...testForm, audioUrl: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                {/* AI Question Extraction Panel */}
                <div className="p-4 bg-indigo-50/25 dark:bg-indigo-950/20 border border-indigo-150 dark:border-indigo-900/40 rounded-2xl space-y-3">
                  <h3 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                    <Sparkles size={14} className="animate-pulse" />
                    AI CẢM BIẾN & TRÍCH XUẤT ĐỀ THI
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tải lên ảnh chụp đề thi trắc nghiệm tiếng Anh của bạn (JPG, PNG). AI sẽ nhận diện chữ và tự động tạo danh sách câu hỏi.
                  </p>

                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="text-xs text-slate-500 block w-full file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />

                    {selectedImageBase64 && (
                      <div className="space-y-2">
                        <img
                          src={selectedImageBase64}
                          alt="Đề thi"
                          className="h-20 w-auto object-cover rounded-lg border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={handleParseImage}
                          disabled={aiParsing}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg shadow transition flex items-center justify-center gap-1.5"
                        >
                          {aiParsing ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              AI Đang phân tích đề thi...
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              Trích xuất Đề thi bằng Gemini AI
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={handleSaveTest}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs tracking-wider rounded-xl shadow transition"
                  >
                    LƯU BÀI THI & ĐỀ
                  </button>
                  <button
                    onClick={() => setEditingTest(null)}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-650 dark:text-slate-350 font-bold text-xs rounded-xl"
                  >
                    HỦY BỎ
                  </button>
                </div>
              </div>

              {/* Question list management right panel */}
              <div className="lg:col-span-8 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    DANH SÁCH CÂU HỎI TRONG ĐỀ THI ({testForm.questions.length} CÂU)
                  </h3>
                  <button
                    onClick={addManualQuestion}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-650 dark:text-indigo-400 font-extrabold text-xs rounded-lg flex items-center gap-1"
                  >
                    <Plus size={13} />
                    Thêm câu hỏi mới
                  </button>
                </div>

                <div className="space-y-4 max-h-[580px] overflow-y-auto pr-2">
                  {testForm.questions.map((q, idx) => (
                    <div key={`${q.id}-${idx}`} className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 relative group">
                      <button
                        onClick={() => removeQuestion(q.id)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-70 hover:opacity-100 transition"
                        title="Xóa câu hỏi này"
                      >
                        <Trash2 size={14} />
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded">
                          Câu {idx + 1}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-bold">{q.id}</span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-slate-450">Nội dung câu hỏi</label>
                        <textarea
                          rows={2}
                          value={q.questionText}
                          onChange={(e) => updateQuestionText(q.id, e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        {(q.options || []).map((opt: any) => (
                          <div key={opt.key} className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-400">{opt.key}.</span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => updateQuestionOption(q.id, opt.key, e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2.5 pt-2">
                        <span className="text-[10px] font-bold uppercase text-slate-450">ĐÁP ÁN ĐÚNG:</span>
                        <select
                          value={q.correctAnswer}
                          onChange={(e) => updateQuestionCorrect(q.id, e.target.value)}
                          className="px-3 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs font-bold text-emerald-600 focus:outline-none"
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                        </select>
                      </div>
                    </div>
                  ))}

                  {testForm.questions.length === 0 && (
                    <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 font-medium">
                      Bài thi này chưa có câu hỏi nào. Bạn có thể thêm thủ công hoặc tải ảnh đề thi lên để AI tự phân tích.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Candidates Management */}
        {!selectedCandidate && !editingTest && activeTab === "candidates" && (
          <div className="space-y-6">
            {/* Dashboard Overview Widgets */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <Users size={22} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tổng Thí Sinh</p>
                  <p className="text-2xl font-black text-slate-805 dark:text-slate-100 mt-0.5">{stats.total}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={22} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Đã Hoàn Thành</p>
                  <p className="text-2xl font-black text-slate-805 dark:text-slate-100 mt-0.5">{stats.completed}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                  <Clock size={22} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Đang Làm Bài</p>
                  <p className="text-2xl font-black text-slate-805 dark:text-slate-100 mt-0.5">{stats.inProgress}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-slate-800 text-indigo-650 dark:text-indigo-400" style={{ color: brandBgColor, backgroundColor: `${brandBgColor}15` }}>
                  <Award size={22} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Số câu trắc nghiệm TB</p>
                  <p className="text-2xl font-black text-slate-805 dark:text-slate-100 mt-0.5">{stats.avgScore}</p>
                </div>
              </div>
            </div>

            {/* Candidate List Container */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center gap-3 max-w-2xl">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      id="candidate-search"
                      type="text"
                      placeholder="Tìm theo Tên hoặc Số điện thoại..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>

                  <select
                    value={candidateExamFilter}
                    onChange={(e) => setCandidateExamFilter(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tất cả kỳ thi</option>
                    <option value="exam-test-1">IELTS Placement</option>
                    {tests.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      fetchAdminData();
                      showToast("Đã cập nhật kết quả tìm kiếm mới nhất", "info");
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs tracking-wider rounded-xl shadow transition active:scale-95 cursor-pointer"
                  >
                    TÌM KIẾM
                  </button>
                  {(searchQuery || candidateExamFilter !== "all") && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCandidateExamFilter("all");
                      }}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-400 font-extrabold text-xs tracking-wider rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      RESET
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExportCSV}
                    id="admin-export-csv"
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <FileSpreadsheet size={15} />
                    XUẤT BÁO CÁO EXCEL (CSV)
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="py-20 text-center text-slate-400 font-semibold">Đang tải cơ sở dữ liệu học sinh...</div>
              ) : filteredCandidates.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-semibold">Không có học sinh nào dự thi phù hợp.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-150 dark:border-slate-800">
                        <th className="py-3.5 px-5">Học sinh</th>
                        <th className="py-3.5 px-5">Bài thi dự tuyển</th>
                        <th className="py-3.5 px-5">Bắt đầu lúc</th>
                        <th className="py-3.5 px-5">Thời gian làm bài</th>
                        <th className="py-3.5 px-5">An ninh (Tab)</th>
                        <th className="py-3.5 px-5">Điểm trắc nghiệm</th>
                        <th className="py-3.5 px-5">Trạng thái</th>
                        <th className="py-3.5 px-5 text-right">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredCandidates.map((c) => {
                        const testObj = tests.find((t) => t.id === c.testId);
                        const isStaticTest = (c.testId || "exam-test-1") === "exam-test-1";
                        const testMaxQuestions = isStaticTest ? 75 : (testObj?.questions?.length || 0);
                        const candidateScore = calculateCandidateScore(c, tests);

                        return (
                          <tr
                            key={c.id}
                            className="hover:bg-slate-50/55 dark:hover:bg-slate-800/25 transition-colors"
                          >
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-2">
                                <p className="font-extrabold text-slate-800 dark:text-slate-200">{c.fullName}</p>
                                {c.isBlocked && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-red-600 text-white uppercase tracking-wider">
                                    <Lock size={8} /> Đã khóa
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono font-semibold text-slate-400 mt-0.5">{c.phoneNumber}</p>
                            </td>
                            <td className="py-4 px-5">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 border border-slate-200 dark:border-slate-700/60">
                                {testObj ? testObj.name : "IELTS Placement"}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-xs text-slate-500">
                              {new Date(c.startTime).toLocaleString("vi-VN")}
                            </td>
                            <td className="py-4 px-5 text-xs font-bold text-slate-700 dark:text-slate-300">
                              {formatDuration(c.durationSeconds)}
                            </td>
                            <td className="py-4 px-5">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  c.tabViolations > 0
                                    ? "bg-red-50 text-red-600 border-red-150 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30"
                                    : "bg-emerald-50 text-emerald-600 border-emerald-150 dark:bg-emerald-950/10 dark:text-emerald-400 dark:border-emerald-900/20"
                                }`}
                              >
                                {c.tabViolations} lần rời tab
                              </span>
                            </td>
                            <td className="py-4 px-5">
                              {c.status === "COMPLETED" ? (
                                <div className="flex items-center gap-1 font-bold text-sm" style={brandTextStyle}>
                                  <span>{candidateScore}</span>
                                  <span className="text-slate-400 text-xs font-normal">/ {testMaxQuestions} câu</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Đang làm bài...</span>
                              )}
                            </td>
                            <td className="py-4 px-5">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                                  c.status === "COMPLETED"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40"
                                }`}
                              >
                                {c.status === "COMPLETED" ? "Đã nộp bài" : "Đang thi"}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right space-x-1.5">
                              <button
                                onClick={() => handleToggleBlock(c.id)}
                                className={`p-2 rounded-xl transition cursor-pointer inline-flex items-center justify-center ${
                                  c.isBlocked
                                    ? "bg-red-500 hover:bg-red-600 text-white"
                                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-400"
                                }`}
                                title={c.isBlocked ? "Mở khóa thí sinh" : "Khóa thí sinh"}
                              >
                                {c.isBlocked ? <Lock size={14} /> : <Unlock size={14} />}
                              </button>
                              <button
                                onClick={() => handleViewDetails(c.id)}
                                className="p-2 rounded-xl bg-indigo-50/50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 transition cursor-pointer inline-flex items-center justify-center"
                                title="Xem và chấm bài"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                onClick={() => triggerResetSession(c.id, c.fullName)}
                                className="p-2 rounded-xl bg-amber-50/50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-600 dark:text-amber-400 transition cursor-pointer inline-flex items-center justify-center"
                                title="Cho thi lại"
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button
                                onClick={() => triggerDeleteCandidate(c.id, c.fullName)}
                                className="p-2 rounded-xl bg-red-50/50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition cursor-pointer inline-flex items-center justify-center"
                                title="Xóa"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Config dynamic tests management */}
        {!selectedCandidate && !editingTest && activeTab === "tests" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-850 dark:text-slate-100">DANH SÁCH BÀI THI & ĐỀ THI ĐÃ TẠO</h2>
                <p className="text-xs text-slate-450 mt-1">
                  Quản lý các đợt thi tuyển sinh, kích hoạt bài thi, hoặc cấu hình đề thi trắc nghiệm.
                </p>
              </div>

              <button
                onClick={handleCreateTestBtn}
                className="px-5 py-3 text-white font-extrabold text-xs tracking-wider rounded-xl shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                style={brandBgStyle}
              >
                <Plus size={15} />
                TẠO ĐỀ THI TUYỂN SINH MỚI
              </button>
            </div>

            {/* List of custom tests */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Default Placement Test Card */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 uppercase">Hệ thống</span>
                    <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">● Đang mở</span>
                  </div>
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg leading-snug">
                    IELTS Entrance Placement Test
                  </h3>
                  <p className="text-xs text-slate-450">
                    Standardized 75-question diagnostic test from Cambridge Assessment Vietnam (includes Reading, Writing, Vocabulary, Grammar, Listening, and Speaking).
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    Duration: <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{(tests.find(t=>t.id === "exam-test-1")?.durationLimit || 45)} minutes</span>
                  </p>
                </div>

                <div className="space-y-3.5 pt-4 border-t border-slate-150 dark:border-slate-800">
                  {/* Copy Exam URL */}
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-850">
                    <span className="font-mono text-[10.5px] text-slate-400 truncate max-w-[150px]">{`${window.location.origin}/?test=exam-test-1`}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/?test=exam-test-1`);
                        showToast("Đã sao chép link phòng thi mặc định vào khay nhớ tạm!", "success");
                      }}
                      className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                      title="Sao chép link phòng thi mặc định"
                    >
                      <Copy size={13} />
                    </button>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-500">Mã: <code className="font-mono text-indigo-650">exam-test-1</code></span>
                    <button
                      onClick={() => {
                        const defaultTestObj = tests.find(t => t.id === "exam-test-1") || {
                          id: "exam-test-1",
                          name: "IELTS Entrance Placement Test",
                          code: "exam-test-1",
                          category: "IELTS",
                          status: "Đang mở",
                          questions: [],
                          durationLimit: 45
                        };
                        handleEditTest(defaultTestObj);
                      }}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold transition flex items-center gap-0.5 text-[11px]"
                    >
                      <Edit size={12} /> Cấu hình
                    </button>
                  </div>
                </div>
              </div>

              {/* Created Dynamic Tests list */}
              {tests.filter(t=>t.id !== "exam-test-1").map((test) => {
                const testUrl = `${window.location.origin}/?test=${test.id}`;

                return (
                  <div
                    key={test.id}
                    className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition"
                  >
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 uppercase tracking-wider">
                          {test.category || "General"}
                        </span>
                        <span className={`text-[11px] font-extrabold flex items-center gap-1 ${test.status === "Đang mở" ? "text-emerald-600" : "text-slate-400"}`}>
                          ● {test.status || "Đang mở"}
                        </span>
                      </div>
                      <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg leading-snug">
                        {test.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        This test consists of <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{(test.questions || []).length} questions</span>. Total attempts so far: <span className="font-extrabold">{test.attempts || 0} candidates</span>.
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        Duration: <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{test.durationLimit || 45} minutes</span>
                      </p>
                    </div>

                    <div className="space-y-3.5 pt-4 border-t border-slate-150 dark:border-slate-800">
                      {/* Copy Exam URL */}
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-850">
                        <span className="font-mono text-[10.5px] text-slate-400 truncate max-w-[150px]">{testUrl}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(testUrl);
                            showToast("Đã sao chép link phòng thi này vào khay nhớ tạm!", "success");
                          }}
                          className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                          title="Sao chép link phòng thi riêng biệt"
                        >
                          <Copy size={13} />
                        </button>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-500">Mã: <code className="font-mono text-indigo-650 dark:text-blue-400">{test.id}</code></span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditTest(test)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold transition flex items-center gap-0.5 text-[11px]"
                          >
                            <Edit size={12} />
                            Sửa
                          </button>
                          <button
                            onClick={() => handleDeleteTest(test.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-bold transition flex items-center gap-0.5 text-[11px]"
                          >
                            <Trash2 size={12} />
                            Xóa
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {tests.filter(t=>t.id !== "exam-test-1").length === 0 && (
                <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-850 rounded-3xl text-slate-400 font-semibold space-y-2">
                  <FolderOpen size={36} className="mx-auto text-slate-350" />
                  <p>Bạn chưa khởi tạo đề thi tuyển sinh tự chọn nào.</p>
                  <p className="text-xs font-normal text-slate-400 max-w-sm mx-auto">Click nút &ldquo;Tạo đề thi tuyển sinh mới&rdquo; ở góc trên bên phải để bắt đầu số hóa đề thi của riêng thầy cô.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: settings and customization */}
        {!selectedCandidate && !editingTest && activeTab === "settings" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-850 dark:text-slate-100">CẤU HÌNH GIAO DIỆN & LOGO HỆ THỐNG</h2>
              <p className="text-xs text-slate-450 mt-1">
                Thay đổi logo thương hiệu trường học, màu nền thương hiệu chủ đạo để cá nhân hóa phòng thi chuyên nghiệp.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-650 dark:text-slate-400 block">Màu nền thương hiệu chủ đạo (Theme Background Override)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={globalSettings.backgroundColor}
                    onChange={(e) => setGlobalSettings({ ...globalSettings, backgroundColor: e.target.value })}
                    className="h-12 w-16 p-1 border border-slate-250 dark:border-slate-800 rounded-xl bg-transparent cursor-pointer"
                  />
                  <div>
                    <input
                      type="text"
                      value={globalSettings.backgroundColor}
                      onChange={(e) => setGlobalSettings({ ...globalSettings, backgroundColor: e.target.value })}
                      className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl font-mono text-sm font-bold w-32 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-450 mt-1">Màu này sẽ áp dụng lên tiêu đề, nút bấm chính, và phù hiệu ở trang thi.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-650 dark:text-slate-400">Đường dẫn Logo Trường học (Logo URL)</label>
                <input
                  type="text"
                  placeholder="https://example.com/logo.png"
                  value={globalSettings.logoUrl}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, logoUrl: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-450">Tải ảnh logo lên các trang lưu trữ ảnh rồi dán trực tiếp đường dẫn vào đây để thay thế biểu tượng EPT mặc định.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-650 dark:text-slate-400">Đường dẫn API Backend cho AI (External API URL)</label>
                <input
                  type="text"
                  placeholder="https://your-backend-app.onrender.com"
                  value={globalSettings.externalApiUrl || ""}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, externalApiUrl: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-450">
                  Nhập địa chỉ máy chủ Node.js/Express của bạn (ví dụ trên Render, Railway hoặc Vercel). Chỉ cần thiết khi chạy trên môi trường tĩnh như GitHub Pages để hỗ trợ tính năng AI quét ảnh đề thi. Để trống nếu chạy trực tiếp fullstack local.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-150 dark:border-slate-800">
                <button
                  onClick={handleSaveBrandingSettings}
                  disabled={settingsSaving}
                  className="w-full py-3.5 text-white font-extrabold text-xs tracking-wider rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                  style={brandBgStyle}
                >
                  {settingsSaving ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Đang lưu cấu hình...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      CẬP NHẬT CẤU HÌNH & GIAO DIỆN HỆ THỐNG
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Full Screen Answers Overlay */}
      {showFullScreenAnswers && selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-sm flex flex-col p-4 md:p-6 text-slate-100 overflow-hidden select-none animate-fade-in">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFullScreenAnswers(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                >
                  <ChevronLeft size={18} />
                </button>
                <h2 className="text-xl font-black tracking-tight">XEM CHI TIẾT ĐÁP ÁN BÀI LÀM</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500 text-white uppercase tracking-wider">
                  Toàn màn hình
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Thí sinh: <span className="font-extrabold text-slate-200">{selectedCandidate.fullName}</span> • SĐT: <span className="font-mono text-slate-200">{selectedCandidate.phoneNumber}</span> • Đợt thi: <span className="font-semibold text-indigo-400">{tests.find((t: any)=>t.id === selectedCandidate.testId)?.name || "IELTS Entrance"}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-center">
                <p className="text-[9px] text-slate-500 font-extrabold uppercase">TỔNG ĐIỂM TRẮC NGHIỆM</p>
                <p className="text-base font-black text-emerald-400">
                  {calculateCandidateScore(selectedCandidate, tests)} <span className="text-xs text-slate-500 font-normal">/ {selectedCandidate.testId === "exam-test-1" ? "75" : (tests.find((t: any)=>t.id === selectedCandidate.testId)?.questions?.length || 0)} câu</span>
                </p>
              </div>

              <div className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-center">
                <p className="text-[9px] text-slate-500 font-extrabold uppercase">CẢNH BÁO CHUYỂN TAB</p>
                <p className={`text-base font-black ${selectedCandidate.tabViolations > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {selectedCandidate.tabViolations} lần
                </p>
              </div>

              <button
                onClick={() => setShowFullScreenAnswers(false)}
                className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition shadow active:scale-95 flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
              >
                <X size={15} />
                ĐÓNG TOÀN MÀN HÌNH
              </button>
            </div>
          </div>

          {/* Subheader Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-slate-800/60 bg-slate-950">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "all", label: "Tất cả" },
                { key: "correct", label: "Đúng" },
                { key: "incorrect", label: "Sai" },
                { key: "unanswered", label: "Chưa trả lời" }
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => setAnsFilter(s.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    ansFilter === s.key
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Phần thi:</span>
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold text-slate-350 focus:outline-none"
              >
                <option value="all">Tất cả phần</option>
                {selectedCandidate.testId === "exam-test-1" ? (
                  <>
                    <option value="listening_p1">Nghe - Phần 1</option>
                    <option value="listening_p2">Nghe - Phần 2 (Đánh số 8+)</option>
                    <option value="grammar">Ngữ pháp</option>
                    <option value="vocabulary">Từ vựng</option>
                    <option value="reading">Đọc hiểu</option>
                  </>
                ) : (
                  <option value="custom">Trắc nghiệm tổng hợp</option>
                )}
              </select>
            </div>
          </div>

          {/* Questions Grid/Scroll */}
          <div className="flex-1 overflow-y-auto py-6 pr-1 max-h-[calc(100vh-200px)]">
            {(() => {
              const getQuestionsList = () => {
                if (selectedCandidate.testId === "exam-test-1" || !selectedCandidate.testId) {
                  return [
                    ...(LISTENING_PART_1.questions || []).map((q: any) => ({
                      ...q,
                      section: "Nghe - Phần 1",
                      sectionKey: "listening_p1",
                      checkCorrect: (studentAns: string) => studentAns === String(q.correctAnswer || "").trim().toUpperCase()
                    })),
                    ...Object.entries(LISTENING_PART_2.correctAnswers || {}).map(([key, value], idx) => {
                      const displayNum = 8 + idx;
                      const acceptListMap: Record<string, string[]> = {
                        l2_1: ["MAY 5TH", "5TH MAY", "MAY 5"],
                        l2_2: ["1700", "$1700", "1,700", "$1,700"],
                        l2_3: ["15", "$15"],
                        l2_4: ["KITCHEN"],
                        l2_5: ["DISHWASHER"],
                        l2_6: ["GARAGE"],
                        l2_7: ["WATER", "WATER THE GRASS"],
                        l2_8: ["RECYCLING"],
                        l2_9: ["WINDOW", "WINDOW AC", "WINDOW UNIT"],
                        l2_10: ["DRESSLER"]
                      };
                      const qTextMap: Record<string, string> = {
                        l2_1: "Available date: (May 5th)",
                        l2_2: "Rent amount: ($1700/month)",
                        l2_3: "Credit check fee: ($15)",
                        l2_4: "A remodelled (Kitchen)",
                        l2_5: "No (Dishwasher)",
                        l2_6: "Parking: A (Garage)",
                        l2_7: "Tenants must (Water) the grass.",
                        l2_8: "Tenants pay $15 for trashing and (Recycling) service.",
                        l2_9: "There is a (Window) AC unit.",
                        l2_10: "Student's surname: Sam (Dressler)"
                      };

                      return {
                        id: key,
                        questionText: qTextMap[key] || `Điền vào chỗ trống (${value})`,
                        section: `Nghe - Phần 2 (Câu ${displayNum})`,
                        sectionKey: "listening_p2",
                        correctAnswer: value,
                        checkCorrect: (studentAns: string) => {
                          const list = acceptListMap[key] || [value.toUpperCase()];
                          return list.includes(studentAns.toUpperCase().trim());
                        }
                      };
                    }),
                    ...GRAMMAR_QUESTIONS.map((q: any) => ({
                      ...q,
                      section: "Ngữ pháp & Cấu trúc",
                      sectionKey: "grammar",
                      checkCorrect: (studentAns: string) => {
                        if (q.type === "text") {
                          const list = q.acceptList || [q.correctAnswer];
                          return list.map((x: any) => String(x || "").toUpperCase().trim()).includes(studentAns);
                        }
                        return studentAns === String(q.correctAnswer || "").trim().toUpperCase();
                      }
                    })),
                    ...VOCABULARY_QUESTIONS.map((q: any) => ({
                      ...q,
                      section: "Từ vựng (Vocabulary)",
                      sectionKey: "vocabulary",
                      checkCorrect: (studentAns: string) => studentAns === String(q.correctAnswer || "").trim().toUpperCase()
                    })),
                    ...(READING_PASSAGE.questions || []).map((q: any) => ({
                      ...q,
                      section: "Đọc hiểu (Reading)",
                      sectionKey: "reading",
                      checkCorrect: (studentAns: string) => studentAns === String(q.correctAnswer || "").trim().toUpperCase()
                    }))
                  ];
                } else {
                  const matchedTest = tests.find((t: any) => t.id === selectedCandidate.testId);
                  if (!matchedTest || !matchedTest.questions) return [];
                  return matchedTest.questions.map((q: any) => ({
                    ...q,
                    section: "Trắc nghiệm tổng hợp",
                    sectionKey: "custom",
                    checkCorrect: (studentAns: string) => studentAns === String(q.correctAnswer || "").trim().toUpperCase()
                  }));
                }
              };

              const allQs = getQuestionsList();
              const filteredQs = allQs.filter(q => {
                const studentValue = String(selectedCandidate.answers?.[q.id] || "").trim().toUpperCase();
                const isCorrect = q.checkCorrect(studentValue);
                const hasAnswered = !!studentValue;

                if (ansFilter === "correct" && !isCorrect) return false;
                if (ansFilter === "incorrect" && (isCorrect || !hasAnswered)) return false;
                if (ansFilter === "unanswered" && hasAnswered) return false;

                if (sectionFilter !== "all" && q.sectionKey !== sectionFilter) return false;

                return true;
              });

              if (filteredQs.length === 0) {
                return (
                  <div className="py-20 text-center text-slate-500 space-y-3">
                    <FolderOpen size={48} className="mx-auto opacity-40 text-slate-500" />
                    <p className="font-extrabold text-sm">Không tìm thấy câu hỏi nào trùng khớp với bộ lọc.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredQs.map((q: any, idx: number) => {
                    const studentValue = String(selectedCandidate.answers?.[q.id] || "").trim();
                    const isCorrect = q.checkCorrect(studentValue.toUpperCase());
                    const hasAnswered = !!studentValue;

                    return (
                      <div
                        key={`${q.id}-${idx}`}
                        className={`p-5 rounded-2xl border transition duration-150 flex flex-col justify-between ${
                          !hasAnswered
                            ? "bg-slate-900/40 border-slate-800/80"
                            : isCorrect
                            ? "bg-emerald-950/20 border-emerald-900/30 hover:border-emerald-900/50"
                            : "bg-red-950/15 border-red-950/40 hover:border-red-950/60"
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-800 text-slate-350 uppercase tracking-wider">
                              {q.section || "Trắc nghiệm"}
                            </span>
                            {hasAnswered ? (
                              isCorrect ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                                  <Check size={12} className="stroke-[3]" /> CHÍNH XÁC
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400">
                                  <X size={12} className="stroke-[3]" /> SAI
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                <AlertTriangle size={12} /> BỎ QUA
                              </span>
                            )}
                          </div>

                          <div className="text-sm font-bold text-slate-200 leading-relaxed">
                            <span className="text-indigo-400 mr-1.5 font-mono">Q.{q.id.replace(/[a-z_]/gi, "")}</span>
                            {q.questionText}
                          </div>

                          {q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {q.options.map((opt: any) => {
                                const isCurrentOptSelected = studentValue.toUpperCase() === opt.key.toUpperCase();
                                const isCurrentOptCorrect = String(q.correctAnswer || "").toUpperCase() === opt.key.toUpperCase();

                                return (
                                  <div
                                    key={opt.key}
                                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                                      isCurrentOptCorrect
                                        ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                                        : isCurrentOptSelected
                                        ? "bg-red-950/40 border-red-500/50 text-red-300"
                                        : "bg-slate-900/60 border-slate-800/80 text-slate-400"
                                    }`}
                                  >
                                    <span className="font-black text-[10px] uppercase">{opt.key}.</span>
                                    <span className="truncate">{opt.text}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {(!q.options || q.options.length === 0) && (
                            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 mt-2">
                              <p className="text-xs">
                                <span className="text-slate-450">Thí sinh điền:</span>{" "}
                                <span className={`font-extrabold font-mono text-xs ${!hasAnswered ? "text-slate-500 italic" : isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                                  {studentValue || "(Không trả lời)"}
                                </span>
                              </p>
                              <p className="text-xs">
                                <span className="text-slate-450">Đáp án đúng / Chấp nhận:</span>{" "}
                                <span className="font-extrabold font-mono text-xs text-emerald-400">
                                  {q.acceptList ? q.acceptList.join(" | ") : q.correctAnswer}
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-650 dark:text-red-400 mt-0.5">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-850 dark:text-slate-100">{confirmModal.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{confirmModal.description}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-400 font-bold text-xs rounded-xl cursor-pointer transition"
              >
                HỦY BỎ
              </button>
              <button
                onClick={handleConfirmAction}
                className={`px-4 py-2 font-bold text-xs rounded-xl cursor-pointer shadow transition active:scale-95 ${confirmModal.actionClass}`}
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
