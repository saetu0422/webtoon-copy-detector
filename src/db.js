// 원본 갤러리 저장소 (IndexedDB). 이미지와 특징은 브라우저 밖으로 나가지 않는다.
const NAME = 'webtoon-copy-detector', VERSION = 1;

const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(NAME, VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    db.createObjectStore('works', { keyPath: 'id' });
    db.createObjectStore('panels', { keyPath: 'id' }).createIndex('workId', 'workId');
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

let dbp;
const db = () => (dbp ??= open());
const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });

export async function loadAll() {
  const d = await db(), tx = d.transaction(['works', 'panels']);
  const [works, panels] = await Promise.all([wrap(tx.objectStore('works').getAll()), wrap(tx.objectStore('panels').getAll())]);
  return { works: works.sort((a, b) => a.createdAt - b.createdAt), panels };
}
export async function putWork(work) {
  const d = await db(), tx = d.transaction('works', 'readwrite');
  tx.objectStore('works').put(work);
  return done(tx);
}
export async function putPanels(panels) {
  const d = await db(), tx = d.transaction('panels', 'readwrite');
  for (const p of panels) tx.objectStore('panels').put(p);
  return done(tx);
}
export async function deleteWork(workId) {
  const d = await db(), tx = d.transaction(['works', 'panels'], 'readwrite');
  tx.objectStore('works').delete(workId);
  const idx = tx.objectStore('panels').index('workId');
  const keys = await wrap(idx.getAllKeys(workId));
  for (const k of keys) tx.objectStore('panels').delete(k);
  await done(tx);
  return keys;
}
