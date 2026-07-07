import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface GlobalSettings {
  backgroundColor: string;
  logoUrl: string;
  externalApiUrl?: string;
  // Contact details
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactZalo?: string;
  contactFacebook?: string;
  contactWebsite?: string;
  contactAddress?: string;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  backgroundColor: '#002147',
  logoUrl: '',
  externalApiUrl: '',
  contactName: 'Trung tâm Tiếng Anh Conquer English',
  contactPhone: '0912 345 678',
  contactEmail: 'info@conquerenglish.edu.vn',
  contactZalo: '0912 345 678',
  contactFacebook: 'https://facebook.com/conquerenglish',
  contactWebsite: 'https://conquerenglish.edu.vn',
  contactAddress: 'Số 123 Đường Cầu Giấy, Quận Cầu Giấy, Hà Nội',
};

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const path = 'settings/global';
  try {
    const docRef = doc(db, 'settings', 'global');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        ...DEFAULT_SETTINGS,
        ...docSnap.data()
      } as GlobalSettings;
    }
  } catch (error) {
    console.error('Error fetching global settings:', error);
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
  return DEFAULT_SETTINGS;
}

export async function updateGlobalSettings(settings: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const path = 'settings/global';
  const docRef = doc(db, 'settings', 'global');
  const currentSettings = await getGlobalSettings();
  const updated = {
    ...currentSettings,
    ...settings,
    backgroundColor: settings.backgroundColor || currentSettings.backgroundColor || '#002147',
    logoUrl: settings.logoUrl !== undefined ? settings.logoUrl : (currentSettings.logoUrl || ''),
  };
  try {
    await setDoc(docRef, updated);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
  return updated;
}
