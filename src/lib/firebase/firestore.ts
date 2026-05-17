import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  WhereFilterOp,
  QueryConstraint,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

// ==================== 타입 정의 ====================

interface FirestoreResult<T = undefined> {
  success: boolean;
  error?: string;
  id?: string;
  data?: T;
}

interface QueryFilter {
  field: string;
  operator: WhereFilterOp;
  value: unknown;
}

/** 에러에서 메시지 추출 */
const extractErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

// ==================== CRUD 함수 ====================

/** 문서 생성 (자동 ID) */
export const createDocument = async <T extends object>(
  collectionName: string,
  data: T,
): Promise<FirestoreResult> => {
  try {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error) };
  }
};

/** 문서 생성/덮어쓰기 (커스텀 ID) */
export const setDocument = async <T extends object>(
  collectionName: string,
  docId: string,
  data: T,
  merge = false,
): Promise<FirestoreResult> => {
  try {
    await setDoc(
      doc(db, collectionName, docId),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge },
    );
    return { success: true, id: docId };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error) };
  }
};

/** 단일 문서 읽기 */
export const getDocument = async <T>(
  collectionName: string,
  docId: string,
): Promise<FirestoreResult<T>> => {
  try {
    const docSnap = await getDoc(doc(db, collectionName, docId));
    if (docSnap.exists()) {
      return { success: true, data: { id: docSnap.id, ...docSnap.data() } as T };
    }
    return { success: false, error: 'Document not found' };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error) };
  }
};

/** 컬렉션의 문서 목록 읽기 */
export const getDocuments = async <T>(
  collectionName: string,
  constraints?: QueryConstraint[],
  fromServer?: boolean,
): Promise<FirestoreResult<T[]>> => {
  try {
    const collectionRef = collection(db, collectionName);
    const q = constraints ? query(collectionRef, ...constraints) : collectionRef;
    const snapshot = fromServer ? await getDocsFromServer(q) : await getDocs(q);

    const documents: T[] = [];
    snapshot.forEach((docSnap) => {
      documents.push({ id: docSnap.id, ...docSnap.data() } as T);
    });
    return { success: true, data: documents };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
};

/** 문서 업데이트 (부분) */
export const updateDocument = async <T extends object>(
  collectionName: string,
  docId: string,
  data: Partial<T>,
): Promise<FirestoreResult> => {
  try {
    await updateDoc(doc(db, collectionName, docId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error) };
  }
};

/** 문서 삭제 */
export const deleteDocument = async (
  collectionName: string,
  docId: string,
): Promise<FirestoreResult> => {
  try {
    await deleteDoc(doc(db, collectionName, docId));
    return { success: true };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error) };
  }
};

/** 조건부 쿼리 */
export const queryDocuments = async <T>(
  collectionName: string,
  filters: QueryFilter[],
  orderByField?: string,
  orderDirection: 'asc' | 'desc' = 'desc',
  limitCount?: number,
): Promise<FirestoreResult<T[]>> => {
  try {
    const collectionRef = collection(db, collectionName);
    const constraints: QueryConstraint[] = filters.map(f =>
      where(f.field, f.operator, f.value),
    );

    if (orderByField) constraints.push(orderBy(orderByField, orderDirection));
    if (limitCount) constraints.push(limit(limitCount));

    const snapshot = await getDocs(query(collectionRef, ...constraints));

    const documents: T[] = [];
    snapshot.forEach((docSnap) => {
      documents.push({ id: docSnap.id, ...docSnap.data() } as T);
    });
    return { success: true, data: documents };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
};

// ==================== Timestamp 유틸리티 ====================

export const timestampToDate = (timestamp: Timestamp): Date => timestamp.toDate();
export const dateToTimestamp = (date: Date): Timestamp => Timestamp.fromDate(date);
