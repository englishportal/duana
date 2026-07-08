import { useState, useRef, useEffect } from "react";
import { Mic, Square, Volume2, CheckCircle, RefreshCw, AlertCircle } from "lucide-react";

interface VoiceRecorderProps {
  questionId: string;
  hasRecord: boolean;
  isSkipped?: boolean;
  onRecordSaved: (questionId: string, base64Audio: string) => void;
  onSkip?: () => void;
  onResetSkip?: () => void;
  promptText?: string; // Optional question text to allow reading
}

export default function VoiceRecorder({
  questionId,
  hasRecord,
  isSkipped,
  onRecordSaved,
  onSkip,
  onResetSkip,
  promptText,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);
  const [hasBlocked, setHasBlocked] = useState(hasRecord);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setHasBlocked(hasRecord);
  }, [hasRecord, questionId]);

  // Handle countdown/timer during recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    if (hasBlocked) return;
    audioChunksRef.current = [];
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let options = {};
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm")) {
          options = { mimeType: "audio/webm" };
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          options = { mimeType: "audio/mp4" };
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          options = { mimeType: "audio/ogg" };
        } else if (MediaRecorder.isTypeSupported("audio/wav")) {
          options = { mimeType: "audio/wav" };
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalMimeType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          onRecordSaved(questionId, base64data);
          setHasBlocked(true);
        };

        // Stop all tracks in the stream
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
    } catch (err: any) {
      console.error("Lỗi khởi tạo ghi âm:", err);
      const errMsg = err?.message || err?.name || String(err);
      setError(
        `Không thể khởi động micro (Chi tiết: ${errMsg}). Nếu bạn đang sử dụng chế độ Xem Thử trong khung (Iframe), vui lòng bấm nút "Mở tab mới" (biểu tượng mũi tên ở góc trên bên phải trình duyệt xem thử) để cấp quyền truy cập micro trực tiếp.`
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Speaks the prompt text using browser Speech Synthesis (TTS)
  const speakQuestion = () => {
    if (!promptText || isSpeakingQuestion) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(promptText);
    utterance.lang = "en-US";
    utterance.onstart = () => setIsSpeakingQuestion(true);
    utterance.onend = () => setIsSpeakingQuestion(false);
    utterance.onerror = () => setIsSpeakingQuestion(false);
    window.speechSynthesis.speak(utterance);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? "0" : ""}${remaining}`;
  };

  return (
    <div
      id={`voice-recorder-${questionId}`}
      className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3.5"
    >
      {promptText && (
        <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-slate-800/40 p-3 rounded-lg">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 italic">
            &ldquo;{promptText}&rdquo;
          </p>
          <button
            onClick={speakQuestion}
            disabled={isSpeakingQuestion}
            id={`speak-btn-${questionId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900 transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Volume2 size={14} />
            {isSpeakingQuestion ? "Đang đọc..." : "AI Đọc câu hỏi"}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex gap-2.5 items-start">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <span className="font-bold">Lỗi khởi tạo ghi âm:</span> {error}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isRecording ? (
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-sm font-bold text-red-500 font-mono">
                {formatTime(recordingSeconds)} / Đang ghi âm...
              </span>
            </div>
          ) : isSkipped ? (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-sm font-semibold">
              <AlertCircle size={16} />
              Đã bỏ qua câu hỏi này
            </div>
          ) : hasBlocked ? (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
              <CheckCircle size={16} />
              Đã ghi âm bài nói thành công
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
              <AlertCircle size={14} />
              Chỉ được ghi âm đúng 1 lần. Hãy chuẩn bị kỹ trước khi bấm.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isSkipped ? (
            <button
              onClick={onResetSkip}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#002147] hover:bg-slate-850 dark:bg-slate-800 dark:hover:bg-slate-750 text-white transition cursor-pointer active:scale-95"
            >
              GHI ÂM LẠI
            </button>
          ) : !hasBlocked ? (
            <>
              {!isRecording && onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer active:scale-95"
                >
                  BỎ QUA CÂU NÀY
                </button>
              )}
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  id={`record-start-${questionId}`}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs tracking-wide flex items-center justify-center gap-2 shadow hover:shadow-md transition cursor-pointer active:scale-95"
                >
                  <Mic size={15} />
                  BẮT ĐẦU GHI ÂM
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  id={`record-stop-${questionId}`}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs tracking-wide flex items-center justify-center gap-2 shadow hover:shadow-md transition cursor-pointer active:scale-95 animate-pulse"
                >
                  <Square size={15} />
                  DỪNG & LƯU BÀI
                </button>
              )}
            </>
          ) : (
            <span className="inline-flex items-center px-4 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
              Đã khóa ghi âm
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
