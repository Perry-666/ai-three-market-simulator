// 示範校準：令截距為 0 求值，再反推截距使各式通過選定基準點。
// 這是示範用的校準，不是市場估計；求解器不讀這個基準點，由測試驗證能獨立找回。

import { CALIBRATION, INTERCEPTS } from './model.js';
import { relResidual } from './solver.js';

export function calibrationGoals(target = CALIBRATION) {
  const { H, C, A } = target.quantities;
  // 占比以百分數儲存；此處 ÷100 只用於把占比轉成分群目標量，明示於此。
  const share = (k) => (target.shares[k] / 100) * A;
  return {
    Q_H_S: H, Q_H_D: H,
    Q_C_S: C, Q_C_D: C,
    Q_A_S: A, Q_A_D: A,
    Q_E_D: share('E'), Q_U_D: share('U'), Q_G_D: share('G'),
  };
}

export function calibrateIntercepts(model, values, target = CALIBRATION) {
  const shareSum = target.shares.E + target.shares.U + target.shares.G;
  if (Math.abs(shareSum - 100) > 1e-9) throw new Error(`使用量占比合計須為 100%，目前 ${shareSum}%`);

  const goals = calibrationGoals(target);
  const zeroed = { ...values };
  for (const { id } of INTERCEPTS) zeroed[id] = 0;
  const env = model.evaluate(zeroed, target.prices);

  const intercepts = {};
  for (const { id, eq } of INTERCEPTS) intercepts[id] = goals[eq] - env[eq];

  const check = model.evaluate({ ...values, ...intercepts }, target.prices);
  for (const [eq, goal] of Object.entries(goals)) {
    if (relResidual(check[eq], goal) > 1e-9) throw new Error(`截距無法以加法校準：${eq}`);
  }
  return intercepts;
}
