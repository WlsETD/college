/**
 * 「我修的科目」的過濾。
 *
 * 安全規則讓檢視者讀得到整個群組的資料，只在前端依這份清單過濾
 * （決策：2026-09-22，逐科目檢查會讓讀取成本與規則複雜度大幅上升）。
 */

/**
 * 依「我修的科目」過濾。
 *
 * 清單是空的或還沒載入，代表使用者還沒選過，這時回傳全部——
 * 給一個空白畫面只會讓人以為壞掉了。
 */
export function filterEnrolled<T extends { id: string }>(
  subjects: readonly T[],
  enrolled: readonly string[] | null | undefined,
): T[] {
  if (!enrolled || enrolled.length === 0) return [...subjects];
  const set = new Set(enrolled);
  return subjects.filter((subject) => set.has(subject.id));
}
