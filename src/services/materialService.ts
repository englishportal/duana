import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface Material {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'image' | 'other';
  url: string;
  description?: string;
  createdAt: string;
}

const MATERIALS_COLLECTION = 'materials';

export async function getMaterials(): Promise<Material[]> {
  try {
    const querySnapshot = await getDocs(collection(db, MATERIALS_COLLECTION));
    const list: Material[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as Material);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, MATERIALS_COLLECTION);
  }
}

export async function addMaterial(material: Partial<Material>): Promise<Material> {
  const id = material.id || Math.random().toString(36).substring(2, 9);
  const docRef = doc(db, MATERIALS_COLLECTION, id);
  const newMaterial: Material = {
    id,
    title: material.title || 'Untitled Material',
    type: material.type || 'other',
    url: material.url || '',
    description: material.description || '',
    createdAt: material.createdAt || new Date().toISOString(),
  };
  try {
    await setDoc(docRef, newMaterial);
    return newMaterial;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${MATERIALS_COLLECTION}/${id}`);
  }
}

export async function deleteMaterial(id: string): Promise<void> {
  const docRef = doc(db, MATERIALS_COLLECTION, id);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${MATERIALS_COLLECTION}/${id}`);
  }
}
