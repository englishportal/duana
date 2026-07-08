import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function isFirstRun(): Promise<boolean> {
  try {
    const docRef = doc(db, 'settings', 'admin_auth');
    const docSnap = await getDoc(docRef);
    return !docSnap.exists();
  } catch (error) {
    console.error('Error checking first run:', error);
    return false;
  }
}

export async function setupAdmin(password: string): Promise<void> {
  const salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const hash = await hashPassword(password, salt);
  
  const docRef = doc(db, 'settings', 'admin_auth');
  await setDoc(docRef, {
    hash,
    salt,
    createdAt: new Date().toISOString()
  });
}

export async function loginAdmin(password: string): Promise<string> {
  const docRef = doc(db, 'settings', 'admin_auth');
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Hệ thống chưa được thiết lập tài khoản Admin. Vui lòng thiết lập trước.');
  }
  
  const authData = docSnap.data();
  const { hash: storedHash, salt, failedAttempts = 0, lockedUntil = null } = authData;

  // Check if account is currently locked
  if (lockedUntil) {
    const lockedTime = new Date(lockedUntil).getTime();
    const now = Date.now();
    if (now < lockedTime) {
      const remainingMs = lockedTime - now;
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / 60000);
      let timeText = '';
      if (hours > 0) {
        timeText = `${hours} giờ ${minutes} phút`;
      } else {
        timeText = `${minutes} phút`;
      }
      throw new Error(`Tài khoản Admin đã bị khóa do nhập sai quá 5 lần. Vui lòng chờ thêm ${timeText}.`);
    }
  }
  
  const computedHash = await hashPassword(password, salt);
  
  if (computedHash === storedHash) {
    // Reset failed attempts on success
    await updateDoc(docRef, {
      failedAttempts: 0,
      lockedUntil: null
    });
    return 'admin-token-authenticated';
  } else {
    const newAttempts = failedAttempts + 1;
    let newLockedUntil = null;
    if (newAttempts >= 5) {
      // Lock for 2 hours (2 * 60 * 60 * 1000 = 7,200,000 ms)
      newLockedUntil = new Date(Date.now() + 7200000).toISOString();
    }
    
    await updateDoc(docRef, {
      failedAttempts: newAttempts,
      lockedUntil: newLockedUntil
    });

    if (newAttempts >= 5) {
      throw new Error('Bạn đã đăng nhập sai quá 5 lần. Tài khoản Admin đã bị khóa trong vòng 2 tiếng.');
    } else {
      throw new Error(`Mật khẩu quản trị viên không chính xác. Bạn còn ${5 - newAttempts} lần thử.`);
    }
  }
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
  const docRef = doc(db, 'settings', 'admin_auth');
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Hệ thống chưa được thiết lập tài khoản Admin.');
  }
  
  const { hash: storedHash, salt } = docSnap.data();
  const computedHash = await hashPassword(currentPassword, salt);
  
  if (computedHash !== storedHash) {
    throw new Error('Mật khẩu hiện tại không chính xác.');
  }
  
  const newSalt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const newHash = await hashPassword(newPassword, newSalt);
  
  await updateDoc(docRef, {
    hash: newHash,
    salt: newSalt,
    updatedAt: new Date().toISOString()
  });
}

export async function logoutAdmin(): Promise<void> {
  localStorage.removeItem('adminToken');
}

export async function getCurrentAdminToken(): Promise<string | null> {
  return localStorage.getItem('adminToken');
}
