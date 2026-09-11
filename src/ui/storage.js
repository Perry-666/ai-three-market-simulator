// 瀏覽器本機儲存：每個瀏覽器／無痕視窗各自獨立，不會改寫網站預設模型。

import { exportScenario, exportSession, importScenario, importSession, defaultView } from '../engine/scenario.js';
import { MARKET_IDS } from '../engine/model.js';

const KEY = 'ai-three-market-simulator.session.v1';

function readView(raw) {
  const view = defaultView();
  if (!raw || typeof raw !== 'object') return view;
  for (const m of MARKET_IDS) {
    const v = raw[m];
    if (!v) continue;
    if (Number.isFinite(v.pMax) && v.pMax > 0) view[m].pMax = v.pMax;
    if (Number.isFinite(v.qMax) && v.qMax > 0) view[m].qMax = v.qMax;
    if (typeof v.nonNegative === 'boolean') view[m].nonNegative = v.nonNegative;
  }
  return view;
}

export function loadStored() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { session: null, error: null, available: false };
  }
  if (!raw) return { session: null, error: null, available: true };
  try {
    const obj = JSON.parse(raw);
    const { session } = importSession(obj.session);
    session.saved = (Array.isArray(obj.saved) ? obj.saved : []).flatMap((item) => {
      try {
        return [{ name: String(item.name), savedAt: item.savedAt ?? null, scenario: importScenario(item.scenario) }];
      } catch {
        return [];
      }
    });
    session.view = readView(obj.view);
    return { session, error: null, available: true };
  } catch (e) {
    return { session: null, error: e.message, available: true };
  }
}

export function saveStored(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      session: exportSession(session),
      saved: session.saved.map((s) => ({ name: s.name, savedAt: s.savedAt, scenario: exportScenario(s.scenario) })),
      view: session.view,
    }));
    return true;
  } catch {
    return false;
  }
}
