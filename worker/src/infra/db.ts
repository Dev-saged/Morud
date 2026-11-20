// واجهة قاعدة البيانات التي يتعامل معها منطق الخادم؛ التنفيذ الحقيقي Firestore REST، وللاختبار ذاكرة.
export type Data = Record<string, unknown>;

export interface Doc {
  id: string;
  path: string;
  data: Data;
  updateTime?: string;
}

export type Op = '==' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'array-contains-any' | '!=';
export interface Query {
  collection: string; // مسار المجموعة الكامل مثل orders أو orders/X/history
  where?: Array<[string, Op, unknown]>;
  orderBy?: Array<[string, 'asc' | 'desc']>;
  limit?: number;
  startAfter?: unknown[];
}

export type Write =
  | { kind: 'set'; path: string; data: Data; merge?: boolean }
  | { kind: 'create'; path: string; data: Data } // يفشل إن وُجدت الوثيقة
  | { kind: 'update'; path: string; data: Data } // يفشل إن لم توجد
  | { kind: 'delete'; path: string }
  | { kind: 'increment'; path: string; field: string; by: number };

export interface Tx {
  get(path: string): Promise<Doc | null>;
  query(q: Query): Promise<Doc[]>;
  write(w: Write): void;
}

export interface Db {
  get(path: string): Promise<Doc | null>;
  getMany(paths: string[]): Promise<Array<Doc | null>>;
  query(q: Query): Promise<Doc[]>;
  commit(writes: Write[]): Promise<void>;
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export class ConflictError extends Error {
  constructor(public readonly path: string) {
    super(`conflict at ${path}`);
  }
}

export const SERVER_TIME = '__server_time__';
