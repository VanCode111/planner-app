import { parseState } from '../model/actions';
import type { AppState } from '../model/types';
import { supports, tg, type TgCloudStorage } from './webapp';

/**
 * Хранение: localStorage (мгновенный старт, работает вне Telegram) + Telegram CloudStorage
 * (синхронизация между устройствами). В CloudStorage значение ограничено 4096 символами,
 * поэтому JSON режется на куски s0…sN, а в `meta` лежит их число и время изменения.
 */

const LOCAL_KEY = 'kladovka:state';
const META_KEY = 'meta';
const CHUNK = 4000;
const BATCH = 50;

const cloud: TgCloudStorage | undefined = supports('6.9') ? tg!.CloudStorage : undefined;

/** Только ASCII: длина куска одинакова в символах и в байтах, лимит не превысим. */
const toAscii = (json: string) =>
  json.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function cloudGet(keys: string[]): Promise<Record<string, string>> {
  return new Promise((resolve, reject) =>
    cloud!.getItems(keys, (err, values) => (err ? reject(new Error(err)) : resolve(values ?? {}))));
}

function cloudSet(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) =>
    cloud!.setItem(key, value, (err) => (err ? reject(new Error(err)) : resolve())));
}

function cloudRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    cloud!.removeItems(keys, (err) => (err ? reject(new Error(err)) : resolve())));
}

function readLocal(): AppState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? parseState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(state: AppState) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    // Хранилище недоступно (приватный режим) — остаётся CloudStorage.
  }
}

/** Куски, которые сейчас лежат в облаке, — чтобы перезаписывать только изменившиеся. */
let cloudChunks: string[] = [];
let queue: Promise<void> = Promise.resolve();

export async function loadState(): Promise<AppState | null> {
  const local = readLocal();
  if (!cloud) return local;
  try {
    const { [META_KEY]: metaRaw } = await cloudGet([META_KEY]);
    if (!metaRaw) return local;
    const meta = JSON.parse(metaRaw) as { n: number; updatedAt: number };
    const keys = Array.from({ length: meta.n }, (_, i) => `s${i}`);
    const values: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += BATCH) Object.assign(values, await cloudGet(keys.slice(i, i + BATCH)));
    cloudChunks = keys.map((k) => values[k] ?? '');
    if (local && local.updatedAt >= meta.updatedAt) return local;
    const remote = parseState(JSON.parse(cloudChunks.join('')));
    if (remote) writeLocal(remote);
    return remote ?? local;
  } catch {
    return local;
  }
}

async function saveCloud(state: AppState) {
  const json = toAscii(JSON.stringify(state));
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  await Promise.all(chunks.map((c, i) => (c !== cloudChunks[i] ? cloudSet(`s${i}`, c) : null)));
  if (cloudChunks.length > chunks.length) {
    await cloudRemove(cloudChunks.slice(chunks.length).map((_, i) => `s${chunks.length + i}`));
  }
  await cloudSet(META_KEY, JSON.stringify({ n: chunks.length, updatedAt: state.updatedAt }));
  cloudChunks = chunks;
}

export function saveState(state: AppState) {
  writeLocal(state);
  if (!cloud) return;
  queue = queue.then(() => saveCloud(state)).catch(() => {
    // Сеть пропала — сохраним при следующем изменении; локальная копия уже есть.
    cloudChunks = [];
  });
}

