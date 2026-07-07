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
  
  const { hash: storedHash, salt } = docSnap.data();
  const computedHash = await hashPassword(password, salt);
  
  if (computedHash === storedHash) {
    return 'admin-token-authenticated';
  } else {
    throw new Error('Mật khẩu quản trị viên không chính xác.');
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
