import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface Question {
  id: string;
  type: string;
  questionText: string;
  options?: Array<{ key: string; text: string }>;
  correctAnswer?: string;
}

export interface Exam {
  id: string;
  name: string;
  code: string;
  category: string;
  status: string;
  createdAt: string;
  questions: Question[];
  themeBgColor: string;
  logoUrl: string;
  audioUrl: string;
  durationLimit: number;
  attempts?: number;
}

const EXAMS_COLLECTION = 'exams';
const CANDIDATES_COLLECTION = 'candidates';

// Get active public exams (status === "Đang mở")
export async function getPublicActiveExams(): Promise<Exam[]> {
  try {
    const q = query(collection(db, EXAMS_COLLECTION), where('status', '==', 'Đang mở'));
    const querySnapshot = await getDocs(q);
    const exams: Exam[] = [];
    querySnapshot.forEach((doc) => {
      exams.push({ id: doc.id, ...doc.data() } as Exam);
    });

    // Ensure we always have exam-test-1 prepended if not in list
    if (!exams.some((e) => e.id === 'exam-test-1')) {
      const docRef = doc(db, EXAMS_COLLECTION, 'exam-test-1');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Exam;
        if (data.status === 'Đang mở') {
          exams.unshift({ id: 'exam-test-1', ...data });
        }
      } else {
        exams.unshift({
          id: 'exam-test-1',
          name: 'Test 1 On The Go (IELTS)',
          code: 'exam-test-1',
          category: 'IELTS',
          status: 'Đang mở',
          createdAt: '01/01/2026',
          questions: [],
          themeBgColor: '',
          logoUrl: '',
          audioUrl: '',
          durationLimit: 45
        });
      }
    }
    return exams;
  } catch (error) {
    console.error('Error fetching public active exams:', error);
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.GET, EXAMS_COLLECTION);
    }
    return [];
  }
}

// Get single exam details (clearing correctAnswer for non-admin requests)
export async function getExamById(id: string, isAdmin: boolean = false): Promise<Exam | null> {
  try {
    const docRef = doc(db, EXAMS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const exam = { id: docSnap.id, ...docSnap.data() } as Exam;
      
      // Clear correct answers for student security
      if (!isAdmin && exam.questions) {
        exam.questions = exam.questions.map(({ correctAnswer, ...q }) => q as Question);
      }
      return exam;
    }

    // Fallback only if the document does not exist in Firestore
    if (id === 'exam-test-1') {
      return {
        id: 'exam-test-1',
        name: 'Test 1 On The Go (IELTS)',
        code: 'exam-test-1',
        category: 'IELTS',
        status: 'Đang mở',
        createdAt: '01/01/2026',
        questions: [],
        themeBgColor: '',
        logoUrl: '',
        audioUrl: '',
        durationLimit: 45
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching exam ${id}:`, error);
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.GET, `${EXAMS_COLLECTION}/${id}`);
    }
    
    // Fallback for exam-test-1 even if there was a connection error
    if (id === 'exam-test-1') {
      return {
        id: 'exam-test-1',
        name: 'Test 1 On The Go (IELTS)',
        code: 'exam-test-1',
        category: 'IELTS',
        status: 'Đang mở',
        createdAt: '01/01/2026',
        questions: [],
        themeBgColor: '',
        logoUrl: '',
        audioUrl: '',
        durationLimit: 45
      };
    }
    return null;
  }
}

// Get single exam details by its ID or custom alphanumeric Code
export async function getExamByCodeOrId(codeOrId: string, isAdmin: boolean = false): Promise<Exam | null> {
  if (codeOrId === 'exam-test-1') {
    return getExamById('exam-test-1', isAdmin);
  }

  try {
    // 1. Try to get by document ID
    const directDoc = await getExamById(codeOrId, isAdmin);
    if (directDoc) {
      return directDoc;
    }

    // 2. Query by code field
    const q = query(collection(db, EXAMS_COLLECTION), where('code', '==', codeOrId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      const exam = { id: docSnap.id, ...docSnap.data() } as Exam;
      if (!isAdmin && exam.questions) {
        exam.questions = exam.questions.map(({ correctAnswer, ...q }) => q as Question);
      }
      return exam;
    }
  } catch (error) {
    console.error(`Error querying exam by code/id ${codeOrId}:`, error);
  }
  return null;
}

// Get all exams for Admin Panel (with attempts count)
export async function getAdminExams(): Promise<Exam[]> {
  try {
    const querySnapshot = await getDocs(collection(db, EXAMS_COLLECTION));
    const exams: Exam[] = [];
    querySnapshot.forEach((docSnap) => {
      exams.push({ id: docSnap.id, ...docSnap.data() } as Exam);
    });

    // Check if default placement test is in the list, if not we add it so it shows in the table
    if (!exams.some((e) => e.id === 'exam-test-1')) {
      exams.push({
        id: 'exam-test-1',
        name: 'Test 1 On The Go (IELTS) (Mặc định)',
        code: 'exam-test-1',
        category: 'IELTS',
        status: 'Đang mở',
        createdAt: '01/01/2026',
        questions: [],
        themeBgColor: '',
        logoUrl: '',
        audioUrl: '',
        durationLimit: 45
      });
    }

    // Map attempts counts for each exam
    const candidatesSnap = await getDocs(collection(db, CANDIDATES_COLLECTION));
    const counts: Record<string, number> = {};
    candidatesSnap.forEach((doc) => {
      const data = doc.data();
      const tId = data.testId || 'exam-test-1';
      counts[tId] = (counts[tId] || 0) + 1;
    });

    return exams.map((exam) => ({
      ...exam,
      attempts: counts[exam.id] || 0,
    }));
  } catch (error) {
    console.error('Error fetching admin exams:', error);
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.GET, EXAMS_COLLECTION);
    }
    return [];
  }
}

// Create new Exam
export async function createExam(examData: Partial<Exam>): Promise<Exam> {
  const code = examData.code || examData.id;
  if (!code) {
    throw new Error('Mã bài thi không được trống.');
  }

  const examDocRef = doc(db, EXAMS_COLLECTION, code);
  let docSnap;
  try {
    docSnap = await getDoc(examDocRef);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.GET, `${EXAMS_COLLECTION}/${code}`);
    }
    throw error;
  }

  if (docSnap.exists() && code !== 'exam-test-1') {
    throw new Error('Mã bài thi đã tồn tại.');
  }

  const newExam: Exam = {
    id: code,
    name: examData.name || '',
    code: code,
    category: examData.category || 'GENERAL',
    status: examData.status || 'Đang mở',
    createdAt: examData.createdAt || new Date().toLocaleDateString('vi-VN'),
    questions: examData.questions || [],
    themeBgColor: examData.themeBgColor || '',
    logoUrl: examData.logoUrl || '',
    audioUrl: examData.audioUrl || '',
    durationLimit: examData.durationLimit !== undefined ? Number(examData.durationLimit) : 45,
  };

  try {
    await setDoc(examDocRef, newExam);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${EXAMS_COLLECTION}/${code}`);
  }
  return newExam;
}

// Update existing Exam
export async function updateExam(id: string, examData: Partial<Exam>): Promise<Exam> {
  const examDocRef = doc(db, EXAMS_COLLECTION, id);
  let docSnap;
  try {
    docSnap = await getDoc(examDocRef);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.GET, `${EXAMS_COLLECTION}/${id}`);
    }
    throw error;
  }

  if (!docSnap.exists() && id !== 'exam-test-1') {
    throw new Error('Không tìm thấy bài thi.');
  }

  const existing = docSnap.exists() ? (docSnap.data() as Exam) : {
    id: 'exam-test-1',
    name: 'Test 1 On The Go (IELTS)',
    code: 'exam-test-1',
    category: 'IELTS',
    status: 'Đang mở',
    createdAt: '01/01/2026',
    questions: [],
    themeBgColor: '',
    logoUrl: '',
    audioUrl: '',
    durationLimit: 45
  };

  const updatedExam: Exam = {
    ...existing,
    ...examData,
    id: id, // Keep original ID
  };

  try {
    await setDoc(examDocRef, updatedExam);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${EXAMS_COLLECTION}/${id}`);
  }
  return updatedExam;
}

// Delete Exam
export async function deleteExam(id: string): Promise<void> {
  if (id === 'exam-test-1') {
    throw new Error('Không thể xóa bài thi mặc định.');
  }
  const examDocRef = doc(db, EXAMS_COLLECTION, id);
  try {
    await deleteDoc(examDocRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${EXAMS_COLLECTION}/${id}`);
  }
}
