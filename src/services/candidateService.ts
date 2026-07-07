import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadBase64 } from './storageService';
import { saveResult } from './resultService';

export interface Candidate {
  id: string;
  fullName: string;
  phoneNumber: string;
  testId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  tabViolations: number;
  startTime: string;
  endTime: string | null;
  answers: Record<string, any>;
  speakingFiles?: Record<string, string>; // Maps question ID to audio download URL
  durationSeconds: number;
  createdAt: string;
  isBlocked?: boolean;
  writingGrades?: Record<string, { score: number; comment: string }>;
}

const CANDIDATES_COLLECTION = 'candidates';

// 1. Register or Resume Candidate Session
export async function registerOrResumeCandidate(
  fullName: string,
  phoneNumber: string,
  testId: string = 'exam-test-1'
): Promise<{ message: string; candidate: Candidate; isResume: boolean }> {
  const phone = phoneNumber.trim();
  const name = fullName.trim();
  const targetTestId = testId || 'exam-test-1';

  // Check if phone number is blocked on any test
  const blockedQuery = query(collection(db, CANDIDATES_COLLECTION), where('phoneNumber', '==', phone), where('isBlocked', '==', true));
  const blockedSnap = await getDocs(blockedQuery);
  if (!blockedSnap.empty) {
    throw new Error('Số điện thoại của bạn đã bị khóa trên hệ thống phòng thi. Thí sinh đã khóa không thể tham gia bất kỳ kỳ thi nào.');
  }

  // Find candidate by phone number AND test ID
  const existingQuery = query(collection(db, CANDIDATES_COLLECTION), where('phoneNumber', '==', phone), where('testId', '==', targetTestId));
  const existingSnap = await getDocs(existingQuery);

  if (!existingSnap.empty) {
    // Get the first matching candidate
    const docSnap = existingSnap.docs[0];
    const candidate = { id: docSnap.id, ...docSnap.data() } as Candidate;

    if (candidate.status === 'COMPLETED') {
      const error: any = new Error('You have already completed this exam.');
      error.status = 'COMPLETED';
      throw error;
    } else {
      return {
        message: 'Tìm thấy bài thi đang làm dở. Đang khôi phục tiến trình...',
        candidate,
        isResume: true,
      };
    }
  }

  // Create new candidate
  const newId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const newCandidate: Candidate = {
    id: newId,
    fullName: name,
    phoneNumber: phone,
    testId: targetTestId,
    status: 'IN_PROGRESS',
    tabViolations: 0,
    startTime: new Date().toISOString(),
    endTime: null,
    answers: {},
    speakingFiles: {},
    durationSeconds: 0,
    createdAt: new Date().toISOString(),
    isBlocked: false,
  };

  await setDoc(doc(db, CANDIDATES_COLLECTION, newId), newCandidate);

  return {
    message: 'Đăng ký thành công! Bắt đầu bài thi.',
    candidate: newCandidate,
    isResume: false,
  };
}

// 2. Update Autosave Session State
export async function updateCandidateSession(
  id: string,
  updates: { answers?: Record<string, any>; tabViolations?: number; durationSeconds?: number }
): Promise<Candidate> {
  const docRef = doc(db, CANDIDATES_COLLECTION, id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Thí sinh không tồn tại.');
  }

  const candidate = { id: docSnap.id, ...docSnap.data() } as Candidate;
  if (candidate.isBlocked) {
    throw new Error('Tài khoản của bạn đã bị khóa. Không thể tiếp tục làm bài.');
  }
  if (candidate.status === 'COMPLETED') {
    throw new Error('Bài thi đã được nộp trước đó. Không thể cập nhật thêm.');
  }

  const updateFields: any = {};
  if (updates.answers !== undefined) updateFields.answers = updates.answers;
  if (updates.tabViolations !== undefined) updateFields.tabViolations = updates.tabViolations;
  if (updates.durationSeconds !== undefined) updateFields.durationSeconds = updates.durationSeconds;

  await updateDoc(docRef, updateFields);

  return {
    ...candidate,
    ...updateFields,
  };
}

// 3. Audio upload for Speaking (using Firebase Storage)
export async function uploadCandidateSpeaking(
  id: string,
  questionId: string,
  audioBase64: string
): Promise<{ success: boolean; url: string }> {
  const docRef = doc(db, CANDIDATES_COLLECTION, id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Thí sinh không tồn tại.');
  }

  const candidate = docSnap.data() as Candidate;
  if (candidate.status === 'COMPLETED') {
    throw new Error('Bài thi đã nộp. Không thể upload thêm file ghi âm.');
  }

  // Upload to Firebase Storage
  const path = `recordings/${id}/${questionId}.wav`;
  const downloadUrl = await uploadBase64(audioBase64, path, 'audio/wav');

  // Update Firestore speakingFiles
  const speakingFiles = candidate.speakingFiles || {};
  speakingFiles[questionId] = downloadUrl;

  await updateDoc(docRef, { speakingFiles });

  return { success: true, url: downloadUrl };
}

// 4. Submit Exam Session
export async function submitCandidateExam(id: string, answers?: Record<string, any>): Promise<Candidate> {
  const docRef = doc(db, CANDIDATES_COLLECTION, id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Thí sinh không tồn tại.');
  }

  const candidate = { id: docSnap.id, ...docSnap.data() } as Candidate;
  if (candidate.status === 'COMPLETED') {
    return candidate;
  }

  const finalAnswers = answers !== undefined ? answers : candidate.answers;
  const endTime = new Date().toISOString();

  const finalCandidate: Candidate = {
    ...candidate,
    answers: finalAnswers,
    status: 'COMPLETED',
    endTime,
  };

  await setDoc(docRef, finalCandidate);

  // Calculate objective score for saving to results collection
  const objectiveScore = calculateObjectiveScoreForCandidate(finalCandidate, []);

  // Save to separate results collection
  await saveResult({
    id: finalCandidate.id,
    fullName: finalCandidate.fullName,
    phoneNumber: finalCandidate.phoneNumber,
    testId: finalCandidate.testId,
    status: 'COMPLETED',
    objectiveScore,
    answers: finalAnswers,
    writingGrades: finalCandidate.writingGrades || {},
    speakingFiles: finalCandidate.speakingFiles || {},
    durationSeconds: finalCandidate.durationSeconds,
    tabViolations: finalCandidate.tabViolations,
    startTime: finalCandidate.startTime,
    endTime,
    createdAt: finalCandidate.createdAt,
  });

  return finalCandidate;
}

// 5. Admin Get Candidate List
export async function getCandidatesAdminList(exams: any[] = []): Promise<any[]> {
  const querySnapshot = await getDocs(collection(db, CANDIDATES_COLLECTION));
  const list: any[] = [];
  querySnapshot.forEach((docSnap) => {
    const c = { id: docSnap.id, ...docSnap.data() } as Candidate;
    const objectiveScore = calculateObjectiveScoreForCandidate(c, exams);
    
    // Omit heavy raw speakingFiles but include boolean indicator
    list.push({
      id: c.id,
      fullName: c.fullName,
      phoneNumber: c.phoneNumber,
      testId: c.testId,
      status: c.status,
      tabViolations: c.tabViolations,
      startTime: c.startTime,
      endTime: c.endTime,
      durationSeconds: c.durationSeconds,
      createdAt: c.createdAt,
      isBlocked: !!c.isBlocked,
      writingGrades: c.writingGrades || {},
      hasRecordings: c.speakingFiles ? Object.keys(c.speakingFiles).length > 0 : false,
      objectiveScore,
    });
  });
  return list;
}

// 6. Admin Get Candidate Details
export async function getCandidateDetails(id: string): Promise<Candidate> {
  const docSnap = await getDoc(doc(db, CANDIDATES_COLLECTION, id));
  if (!docSnap.exists()) {
    throw new Error('Không tìm thấy thí sinh.');
  }
  return { id: docSnap.id, ...docSnap.data() } as Candidate;
}

// 7. Admin Grade Writing
export async function gradeCandidateWriting(id: string, grades: Record<string, { score: number; comment: string }>): Promise<Candidate> {
  const docRef = doc(db, CANDIDATES_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Không tìm thấy thí sinh.');
  }

  await updateDoc(docRef, { writingGrades: grades });

  // Update in results collection as well if present
  try {
    const resultDocRef = doc(db, 'results', id);
    const resultSnap = await getDoc(resultDocRef);
    if (resultSnap.exists()) {
      await updateDoc(resultDocRef, { writingGrades: grades });
    }
  } catch (err) {
    console.error('Error updating writing grades in results:', err);
  }

  return {
    id,
    ...(docSnap.data() as Candidate),
    writingGrades: grades,
  };
}

// 8. Admin Reset Candidate
export async function resetCandidateStatus(id: string): Promise<Candidate> {
  const docRef = doc(db, CANDIDATES_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Không tìm thấy thí sinh.');
  }

  const currentData = docSnap.data() as Candidate;

  // Clone current completed candidate as a historical attempt to preserve history
  if (currentData.status === 'COMPLETED') {
    const timestamp = Date.now();
    const histId = `${id}_hist_${timestamp}`;
    const histRef = doc(db, CANDIDATES_COLLECTION, histId);

    const historicalCandidate = {
      ...currentData,
      id: histId,
      fullName: `${currentData.fullName} (Lượt 1)`,
      phoneNumber: `${currentData.phoneNumber}_hist_${timestamp}`,
      isHistory: true
    };

    try {
      await setDoc(histRef, historicalCandidate);
    } catch (err) {
      console.error('Error saving historical candidate on reset:', err);
    }

    // Clone matching results document too
    try {
      const activeResultRef = doc(db, 'results', id);
      const activeResultSnap = await getDoc(activeResultRef);
      if (activeResultSnap.exists()) {
        const resultData = activeResultSnap.data();
        const histResultRef = doc(db, 'results', histId);
        await setDoc(histResultRef, {
          ...resultData,
          id: histId,
          fullName: `${resultData.fullName} (Lượt 1)`,
          phoneNumber: `${resultData.phoneNumber}_hist_${timestamp}`,
          isHistory: true
        });
      }
    } catch (err) {
      console.error('Error cloning results to history on reset:', err);
    }
  }

  // Reset active candidate fields for fresh new attempt
  const freshCandidateUpdate = {
    status: 'IN_PROGRESS' as const,
    answers: {},
    speakingFiles: {},
    tabViolations: 0,
    durationSeconds: 0,
    endTime: null,
    startTime: new Date().toISOString(),
    writingGrades: {},
  };

  await updateDoc(docRef, freshCandidateUpdate);

  // Try to remove active result so they can re-submit
  try {
    await deleteDoc(doc(db, 'results', id));
  } catch (err) {
    console.error('Error removing active results on reset:', err);
  }

  return {
    id,
    ...currentData,
    ...freshCandidateUpdate,
  };
}

// 9. Admin Delete Candidate Completely
export async function deleteCandidate(id: string): Promise<void> {
  await deleteDoc(doc(db, CANDIDATES_COLLECTION, id));
  try {
    await deleteDoc(doc(db, 'results', id));
  } catch (err) {
    console.error('Error deleting from results collection:', err);
  }
}

// 10. Admin Toggle Block Candidate
export async function toggleBlockCandidate(id: string): Promise<{ isBlocked: boolean }> {
  const docRef = doc(db, CANDIDATES_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Không tìm thấy thí sinh.');
  }

  const candidate = docSnap.data() as Candidate;
  const phone = candidate.phoneNumber;
  const targetBlockState = !candidate.isBlocked;

  // Find all candidate documents with this phone number and update block status
  const q = query(collection(db, CANDIDATES_COLLECTION), where('phoneNumber', '==', phone));
  const snap = await getDocs(q);
  
  const batchPromises = snap.docs.map((doc) => {
    return updateDoc(doc.ref, { isBlocked: targetBlockState });
  });
  
  await Promise.all(batchPromises);

  // Update in results collection for any submissions by this phone number
  try {
    const resultsQ = query(collection(db, 'results'), where('phoneNumber', '==', phone));
    const resultsSnap = await getDocs(resultsQ);
    const resultsPromises = resultsSnap.docs.map((doc) => {
      return updateDoc(doc.ref, { isBlocked: targetBlockState });
    });
    await Promise.all(resultsPromises);
  } catch (err) {
    console.error('Error updating blocked state in results:', err);
  }

  return { isBlocked: targetBlockState };
}

// Auxiliary Scoring Function (Ported from server-side)
export function calculateObjectiveScoreForCandidate(candidate: any, exams: any[] = []): number {
  const { answers, testId } = candidate;
  if (!answers) return 0;

  const tId = testId || 'exam-test-1';

  if (tId === 'exam-test-1') {
    return calculateDefaultObjectiveScore(answers);
  }

  // Look up custom exam/test
  const exam = exams ? exams.find((t) => t.id === tId) : null;
  if (!exam || !exam.questions) return 0;

  let correct = 0;
  exam.questions.forEach((q: any) => {
    const ans = String(answers[q.id] || '').trim().toUpperCase();
    const correctAns = String(q.correctAnswer || '').trim().toUpperCase();
    if (ans === correctAns) {
      correct++;
    }
  });

  return correct;
}

function calculateDefaultObjectiveScore(answers: any): number {
  if (!answers) return 0;
  let correct = 0;

  // 1. Listening Part 1
  const l1Answers: Record<string, string> = {
    l1_1: 'A', l1_2: 'C', l1_3: 'C', l1_4: 'C', l1_5: 'A', l1_6: 'A', l1_7: 'B'
  };
  Object.keys(l1Answers).forEach((key) => {
    if (answers[key]?.toUpperCase() === l1Answers[key]) {
      correct++;
    }
  });

  // 2. Listening Part 2 (Fill-in-the-blank)
  const l2Answers: Record<string, string[]> = {
    l2_1: ['MAY 5TH', '5TH MAY', 'MAY 5'],
    l2_2: ['1700', '$1700', '1,700', '$1,700'],
    l2_3: ['15', '$15'],
    l2_4: ['KITCHEN'],
    l2_5: ['DISHWASHER'],
    l2_6: ['GARAGE'],
    l2_7: ['WATER'],
    l2_8: ['RECYCLING'],
    l2_9: ['WINDOW'],
    l2_10: ['DRESSLER']
  };
  Object.keys(l2Answers).forEach((key) => {
    const val = String(answers[key] || '').trim().toUpperCase();
    if (l2Answers[key].includes(val)) {
      correct++;
    }
  });

  // 3. Grammar MCQ and Blank Fills
  const grammarCorrect: Record<string, string[]> = {
    g_1: ['VISITED'],
    g_2: ['WENT'],
    g_3: ['HAVE NEVER TRIED', 'NEVER TRIED'],
    g_4: ['GOES'],
    g_5: ['BEAUTIFUL'],
    g_6: ['CAREFULLY'],
    g_7: ['B'],
    g_8: ['C'],
    g_9: ['READING'],
    g_10: ['C'],
    g_11: ['B'],
    g_12: ['C'],
    g_13: ['A'],
    g_14: ['A'],
    g_15: ['B'],
    g_16: ['C'],
    g_17: ['D'],
    g_18: ['A'],
    g_19: ['C'],
    g_20: ['B'],
    g_21: ['B'],
    g_22: ['C'],
    g_23: ['B'],
    g_24: ['B'],
    g_25: ['B'],
    g_26: ['C'],
    g_27: ['B'],
    g_28: ['A'],
    g_29: ['B'],
    g_30: ['B']
  };
  Object.keys(grammarCorrect).forEach((key) => {
    const val = String(answers[key] || '').trim().toUpperCase();
    if (grammarCorrect[key].includes(val)) {
      correct++;
    }
  });

  // 4. Vocabulary (22 questions)
  const vocabCorrect: Record<string, string> = {
    v_1: 'A', v_2: 'A', v_3: 'A', v_4: 'A', v_5: 'A', v_6: 'B', v_7: 'A', v_8: 'C', v_9: 'B',
    v_10: 'A', v_11: 'A', v_12: 'D', v_13: 'A', v_14: 'B', v_15: 'C', v_16: 'B', v_17: 'A',
    v_18: 'B', v_19: 'A', v_20: 'B', v_21: 'C', v_22: 'B'
  };
  Object.keys(vocabCorrect).forEach((key) => {
    if (answers[key]?.toUpperCase() === vocabCorrect[key]) {
      correct++;
    }
  });

  // 5. Reading (6 questions)
  const readingCorrect: Record<string, string> = {
    r_1: 'B', r_2: 'C', r_3: 'F', r_4: 'T', r_5: 'NG', r_6: 'T'
  };
  Object.keys(readingCorrect).forEach((key) => {
    if (answers[key]?.toUpperCase() === readingCorrect[key]) {
      correct++;
    }
  });

  return correct;
}
