// 계정 슬롯 저장소 단위 테스트
// 앱인토스 Storage처럼 비동기인 저장소 위에서 읽기·쓰기 순서, 저장 실패, 계정 분리, 이전 저장 옮기기를 확인합니다.
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_SLOT, SaveStore, slotKey } from '../src/platform/save-store';
import { createAsyncStorage } from '../src/platform/browser-platform';
import type { AsyncKeyValueStorage } from '../src/platform/types';

const ENTRIES = ['release', 'collection', 'growth'] as const;
const LEGACY = { release: 'dbg-lab-mvp-release-integration-v1', collection: 'dbg-lab-meta-collection', growth: 'dbg-lab-meta-growth' };

// 쓰기마다 한 틱 늦게 끝나는 메모리 저장소. failKeys에 든 키는 쓰기가 실패합니다.
class MemoryStorage implements AsyncKeyValueStorage {
  readonly data = new Map<string, string>();
  readonly writes: Array<[string, string | null]> = [];
  failKeys = new Set<string>();
  async getItem(key: string) { return this.data.get(key) ?? null; }
  async setItem(key: string, value: string) {
    await Promise.resolve();
    if (this.failKeys.has(key)) throw new Error(`쓰기 실패: ${key}`);
    this.writes.push([key, value]);
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    await Promise.resolve();
    this.writes.push([key, null]);
    this.data.delete(key);
  }
}

describe('SaveStore 읽기·쓰기', () => {
  it('열 때 슬롯 항목을 메모리에 올리고, 이후에는 동기적으로 읽는다', async () => {
    const storage = new MemoryStorage();
    storage.data.set(slotKey(LOCAL_SLOT, 'release'), '{"coins":10}');
    const store = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null });
    expect(store.slot).toBe(LOCAL_SLOT);
    expect(store.get('release')).toBe('{"coins":10}');
    expect(store.get('growth')).toBeNull();
  });

  it('쓰기는 메모리에 바로 반영되고, 같은 항목을 연달아 쓰면 저장소에는 마지막 값만 간다', async () => {
    const storage = new MemoryStorage();
    const store = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null });
    store.set('release', 'a');
    store.set('release', 'b');
    store.set('release', 'c');
    expect(store.get('release')).toBe('c');
    await store.flush();
    expect(storage.data.get(slotKey(LOCAL_SLOT, 'release'))).toBe('c');
    // 첫 쓰기는 즉시 시작되므로 a, 그 사이 쌓인 b·c는 c 하나로 합쳐짐
    expect(storage.writes.map(([, value]) => value)).toEqual(['a', 'c']);
  });

  it('삭제도 순서대로 반영된다', async () => {
    const storage = new MemoryStorage();
    const store = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null });
    store.set('growth', 'x');
    store.remove('growth');
    expect(store.get('growth')).toBeNull();
    await store.flush();
    expect(storage.data.has(slotKey(LOCAL_SLOT, 'growth'))).toBe(false);
  });

  it('저장에 실패해도 메모리 진행은 유지하고 오류를 알린다', async () => {
    const storage = new MemoryStorage();
    storage.failKeys.add(slotKey(LOCAL_SLOT, 'release'));
    const onError = vi.fn();
    const store = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null, onError });
    store.set('release', 'progress');
    store.set('collection', 'ok');
    await store.flush();
    expect(store.get('release')).toBe('progress');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(storage.data.get(slotKey(LOCAL_SLOT, 'collection'))).toBe('ok');
    // 다음 쓰기가 성공하면 마지막 오류를 지운다
    storage.failKeys.clear();
    store.set('release', 'progress-2');
    await store.flush();
    expect(store.lastError).toBeNull();
  });
});

describe('SaveStore 계정 슬롯과 이전 저장', () => {
  it('사용자 키마다 다른 슬롯을 쓴다', async () => {
    const storage = new MemoryStorage();
    const a = await SaveStore.open(storage, { entries: ENTRIES, playerKey: 'hash-a' });
    a.set('release', 'A');
    await a.flush();
    const b = await SaveStore.open(storage, { entries: ENTRIES, playerKey: 'hash-b' });
    expect(b.get('release')).toBeNull();
    b.set('release', 'B');
    await b.flush();
    const again = await SaveStore.open(storage, { entries: ENTRIES, playerKey: 'hash-a' });
    expect(again.get('release')).toBe('A');
  });

  it('빈 슬롯이면 계정 슬롯 도입 전 저장 키를 옮겨 오고 원본은 남긴다', async () => {
    const storage = new MemoryStorage();
    storage.data.set(LEGACY.release, 'old-release');
    storage.data.set(LEGACY.growth, 'old-growth');
    const store = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null, legacyKeys: LEGACY });
    expect(store.get('release')).toBe('old-release');
    expect(store.get('growth')).toBe('old-growth');
    expect(store.get('collection')).toBeNull();
    await store.flush();
    expect(storage.data.get(slotKey(LOCAL_SLOT, 'release'))).toBe('old-release');
    expect(storage.data.get(LEGACY.release)).toBe('old-release');
    expect(JSON.parse(storage.data.get(slotKey(LOCAL_SLOT, '_migrated')) ?? '{}').from).toBe('legacy');
  });

  it('슬롯에 진행이 있으면 이전 저장을 덮어쓰지 않는다', async () => {
    const storage = new MemoryStorage();
    storage.data.set(slotKey(LOCAL_SLOT, 'release'), 'current');
    storage.data.set(LEGACY.release, 'old');
    const store = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null, legacyKeys: LEGACY });
    expect(store.get('release')).toBe('current');
  });

  it('사용자 키를 처음 받으면 키 없이 하던 공용 슬롯 진행을 이어받는다', async () => {
    const storage = new MemoryStorage();
    const local = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null, legacyKeys: LEGACY });
    local.set('release', 'played-without-key');
    await local.flush();
    const keyed = await SaveStore.open(storage, { entries: ENTRIES, playerKey: 'hash-a', legacyKeys: LEGACY });
    expect(keyed.slot).toBe('hash-a');
    expect(keyed.get('release')).toBe('played-without-key');
  });

  it('읽기 오류는 빈 값으로 보고 게임을 시작한다', async () => {
    const storage = new MemoryStorage();
    storage.getItem = async () => { throw new Error('읽기 실패'); };
    const onError = vi.fn();
    const store = await SaveStore.open(storage, { entries: ENTRIES, playerKey: null, onError });
    expect(store.get('release')).toBeNull();
    expect(onError).toHaveBeenCalled();
  });
});

describe('브라우저 저장소 어댑터', () => {
  it('localStorage 형태의 동기 저장소를 비동기로 감싼다', async () => {
    const map = new Map<string, string>();
    const storage = createAsyncStorage(() => ({
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
      removeItem: (key: string) => { map.delete(key); },
    }));
    await storage.setItem('k', 'v');
    expect(await storage.getItem('k')).toBe('v');
    await storage.removeItem('k');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('저장소가 없으면 읽기는 null, 쓰기는 실패로 알린다', async () => {
    const storage = createAsyncStorage(() => undefined);
    expect(await storage.getItem('k')).toBeNull();
    await expect(storage.setItem('k', 'v')).rejects.toThrow();
  });

  it('용량 초과 등 쓰기 예외를 그대로 전달해 SaveStore가 알릴 수 있게 한다', async () => {
    const storage = createAsyncStorage(() => ({
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    }));
    await expect(storage.setItem('k', 'v')).rejects.toThrow('QuotaExceededError');
  });
});
