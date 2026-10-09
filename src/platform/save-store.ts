// 계정 슬롯 저장소: 비동기 저장소(앱인토스 Storage·localStorage) 위에서 게임이 동기적으로 읽고 쓰게 합니다.
// - 부팅 때 슬롯의 항목을 한 번에 읽어 메모리에 올리고(open), 게임 중에는 메모리에서 바로 읽습니다.
// - 쓰기는 메모리에 즉시 반영하고 저장소에는 순서대로 내보냅니다. 같은 항목이 연달아 바뀌면 마지막 값만 씁니다.
// - 저장에 실패해도 메모리 진행은 유지하고 lastError로 알립니다.
import type { AsyncKeyValueStorage } from './types';

export const LOCAL_SLOT = 'local';
const KEY_PREFIX = 'dbg:v1';
const MIGRATED_ENTRY = '_migrated';

export type SaveStoreOptions<Name extends string> = {
  // 저장 항목 이름 목록(예: release·collection·growth)
  entries: readonly Name[];
  // 사용자 키. 없으면 기기 공용 슬롯(local)을 씁니다.
  playerKey: string | null;
  // 슬롯이 비어 있을 때 옮겨 올 이전 저장 키(이름별). 원본은 지우지 않습니다.
  legacyKeys?: Partial<Record<Name, string>>;
  onError?: (error: unknown) => void;
};

export function slotKey(slot: string, entry: string) {
  return `${KEY_PREFIX}:${slot}:${entry}`;
}

export class SaveStore<Name extends string> {
  private readonly cache = new Map<Name, string | null>();
  private readonly pending = new Map<Name, string | null>();
  private draining?: Promise<void>;
  lastError: unknown = null;

  private constructor(
    private readonly storage: AsyncKeyValueStorage,
    readonly slot: string,
    private readonly onError?: (error: unknown) => void,
  ) {}

  /**
   * 슬롯을 열고 항목을 메모리에 올립니다.
   * 슬롯에 저장된 항목이 하나도 없으면 다음 순서로 한 번 옮겨 옵니다.
   * 1) 사용자 키 슬롯이면 기기 공용 슬롯(local) — 키를 받기 전에 하던 진행
   * 2) 이전 저장 키(legacyKeys) — 계정 슬롯 도입 전 웹 버전 진행
   */
  static async open<Name extends string>(storage: AsyncKeyValueStorage, options: SaveStoreOptions<Name>): Promise<SaveStore<Name>> {
    const slot = options.playerKey || LOCAL_SLOT;
    const store = new SaveStore<Name>(storage, slot, options.onError);
    const read = async (key: string) => {
      try { return await storage.getItem(key); } catch (error) { store.reportError(error); return null; }
    };
    const current = await Promise.all(options.entries.map((entry) => read(slotKey(slot, entry))));
    options.entries.forEach((entry, index) => store.cache.set(entry, current[index]));
    if (current.some((value) => value !== null)) return store;

    const sources: Array<{ label: string; keyOf: (entry: Name) => string | undefined }> = [];
    if (slot !== LOCAL_SLOT) sources.push({ label: LOCAL_SLOT, keyOf: (entry) => slotKey(LOCAL_SLOT, entry) });
    if (options.legacyKeys) sources.push({ label: 'legacy', keyOf: (entry) => options.legacyKeys?.[entry] });

    for (const source of sources) {
      const values = await Promise.all(options.entries.map((entry) => {
        const key = source.keyOf(entry);
        return key ? read(key) : Promise.resolve(null);
      }));
      if (values.every((value) => value === null)) continue;
      options.entries.forEach((entry, index) => {
        if (values[index] !== null) store.set(entry, values[index]);
      });
      store.writeMarker(source.label);
      break;
    }
    return store;
  }

  get(entry: Name): string | null {
    return this.cache.get(entry) ?? null;
  }

  set(entry: Name, value: string) {
    this.cache.set(entry, value);
    this.pending.set(entry, value);
    this.schedule();
  }

  remove(entry: Name) {
    this.cache.set(entry, null);
    this.pending.set(entry, null);
    this.schedule();
  }

  // 대기 중인 쓰기가 모두 끝날 때까지 기다립니다(앱 전환·종료 직전, 테스트).
  async flush() {
    while (this.draining) await this.draining;
  }

  private writeMarker(source: string) {
    void this.storage.setItem(slotKey(this.slot, MIGRATED_ENTRY), JSON.stringify({ from: source, at: new Date().toISOString() }))
      .catch((error) => this.reportError(error));
  }

  private schedule() {
    if (this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = undefined;
      if (this.pending.size > 0) this.schedule();
    });
  }

  private async drain() {
    while (this.pending.size > 0) {
      const [entry, value] = this.pending.entries().next().value as [Name, string | null];
      this.pending.delete(entry);
      const key = slotKey(this.slot, entry);
      try {
        if (value === null) await this.storage.removeItem(key);
        else await this.storage.setItem(key, value);
        this.lastError = null;
      } catch (error) {
        this.reportError(error);
      }
    }
  }

  private reportError(error: unknown) {
    this.lastError = error;
    this.onError?.(error);
  }
}
