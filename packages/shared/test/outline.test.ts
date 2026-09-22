import { describe, it, expect } from 'vitest';
import { parseOutline, zhNumberToInt } from '../src/outline';

describe('zhNumberToInt', () => {
  it('阿拉伯數字原樣轉換', () => {
    expect(zhNumberToInt('1')).toBe(1);
    expect(zhNumberToInt('12')).toBe(12);
  });

  it('個位中文數字', () => {
    expect(zhNumberToInt('一')).toBe(1);
    expect(zhNumberToInt('九')).toBe(9);
    expect(zhNumberToInt('〇')).toBe(0);
  });

  it('十位與百位', () => {
    expect(zhNumberToInt('十')).toBe(10);
    expect(zhNumberToInt('十一')).toBe(11);
    expect(zhNumberToInt('二十')).toBe(20);
    expect(zhNumberToInt('二十三')).toBe(23);
    expect(zhNumberToInt('一百')).toBe(100);
    expect(zhNumberToInt('一百二十三')).toBe(123);
  });

  it('無法解析回傳 null', () => {
    expect(zhNumberToInt('abc')).toBeNull();
    expect(zhNumberToInt('')).toBeNull();
  });
});

describe('parseOutline — 章的各種寫法', () => {
  it('第一章（中文數字）', () => {
    const { chapters } = parseOutline('第一章 極限');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ number: '1', title: '極限', implicit: false });
  });

  it('第1章（阿拉伯數字，無空格）', () => {
    const { chapters } = parseOutline('第1章 微分');
    expect(chapters[0]).toMatchObject({ number: '1', title: '微分' });
  });

  it('第 2 章（數字前後有空格）', () => {
    const { chapters } = parseOutline('第 2 章 積分');
    expect(chapters[0]).toMatchObject({ number: '2', title: '積分' });
  });

  it('Chapter 3（英文，大小寫皆可）', () => {
    expect(parseOutline('Chapter 3 Integration').chapters[0]).toMatchObject({
      number: '3',
      title: 'Integration',
    });
    expect(parseOutline('CHAPTER 4  Series').chapters[0]).toMatchObject({
      number: '4',
      title: 'Series',
    });
    expect(parseOutline('Ch.5 Vectors').chapters[0]).toMatchObject({
      number: '5',
      title: 'Vectors',
    });
  });

  it('第十一章、第二十章', () => {
    expect(parseOutline('第十一章 向量').chapters[0]?.number).toBe('11');
    expect(parseOutline('第二十章 矩陣').chapters[0]?.number).toBe('20');
  });

  it('「1. 標題」的裸編號形式', () => {
    const { chapters } = parseOutline('1. 極限\n2、連續');
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({ number: '1', title: '極限' });
    expect(chapters[1]).toMatchObject({ number: '2', title: '連續' });
  });

  it('全形冒號與頓號當分隔', () => {
    expect(parseOutline('第一章：極限').chapters[0]).toMatchObject({ title: '極限' });
    expect(parseOutline('第一章、極限').chapters[0]).toMatchObject({ title: '極限' });
  });

  it('只有章標題沒有名稱', () => {
    const { chapters } = parseOutline('第一章');
    expect(chapters[0]).toMatchObject({ number: '1', title: '' });
  });
});

describe('parseOutline — 小節的各種寫法', () => {
  it('1-1 破折號形式', () => {
    const { chapters } = parseOutline('第一章 極限\n  1-1 數列極限\n  1-2 連續');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.sections).toHaveLength(2);
    expect(chapters[0]?.sections[0]).toMatchObject({ number: '1-1', title: '數列極限' });
    expect(chapters[0]?.sections[1]).toMatchObject({ number: '1-2', title: '連續' });
  });

  it('1.1 句點形式，正規化成 1-1', () => {
    const { chapters } = parseOutline('第一章 極限\n  1.1 數列極限');
    expect(chapters[0]?.sections[0]).toMatchObject({ number: '1-1', title: '數列極限' });
  });

  it('編號中間有空白也能解析', () => {
    const { chapters } = parseOutline('第一章 極限\n  1 - 1 數列極限');
    expect(chapters[0]?.sections[0]?.number).toBe('1-1');
  });

  it('§1.1 形式', () => {
    const { chapters } = parseOutline('第一章 極限\n  §1.1 數列極限');
    expect(chapters[0]?.sections[0]).toMatchObject({ number: '1-1', title: '數列極限' });
  });

  it('第一節 形式', () => {
    const { chapters } = parseOutline('第一章 極限\n  第一節 數列極限');
    expect(chapters[0]?.sections[0]).toMatchObject({ number: '1', title: '數列極限' });
  });

  it('三層以上的編號壓成小節，不再長一層', () => {
    const { chapters } = parseOutline('第一章 極限\n  1.1.2 夾擠定理');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.sections).toHaveLength(1);
    expect(chapters[0]?.sections[0]).toMatchObject({ number: '1-1-2', title: '夾擠定理' });
  });

  it('小節編號決定歸屬的章，即使順序交錯', () => {
    const text = ['第一章 極限', '第二章 微分', '1-1 數列極限'].join('\n');
    const { chapters } = parseOutline(text);
    expect(chapters[0]?.sections.map((s) => s.number)).toEqual(['1-1']);
    expect(chapters[1]?.sections).toHaveLength(0);
  });

  it('小節出現在任何章之前，會補一個隱含章', () => {
    const { chapters } = parseOutline('1-1 數列極限\n1-2 連續');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ number: '1', title: '', implicit: true });
    expect(chapters[0]?.sections).toHaveLength(2);
  });

  it('隱含章之後出現真正的章標題，會補上去而不是再開一章', () => {
    const { chapters } = parseOutline('1-1 數列極限\n第一章 極限');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ number: '1', title: '極限', implicit: false });
    expect(chapters[0]?.sections).toHaveLength(1);
  });
});

describe('parseOutline — 空白與雜訊', () => {
  it('空行被略過', () => {
    const { chapters } = parseOutline('\n\n第一章 極限\n\n\n  1-1 數列極限\n\n');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.sections).toHaveLength(1);
  });

  it('全形空白與 Tab 視為空白', () => {
    const { chapters } = parseOutline('第一章　極限\n\t1-1　數列極限');
    expect(chapters[0]).toMatchObject({ title: '極限' });
    expect(chapters[0]?.sections[0]).toMatchObject({ title: '數列極限' });
  });

  it('連續空白壓成一個', () => {
    expect(parseOutline('第一章     極限').chapters[0]?.title).toBe('極限');
    expect(parseOutline('第一章 極  限').chapters[0]?.title).toBe('極 限');
  });

  it('目錄的點線與頁碼被移除', () => {
    const { chapters } = parseOutline('第一章 極限 .......... 12\n  1-1 數列極限……15');
    expect(chapters[0]?.title).toBe('極限');
    expect(chapters[0]?.sections[0]?.title).toBe('數列極限');
  });

  it('項目符號被移除', () => {
    expect(parseOutline('• 第一章 極限').chapters[0]?.title).toBe('極限');
  });

  it('只有分隔線的行被略過', () => {
    const { chapters } = parseOutline('第一章 極限\n--------\n====\n  1-1 數列極限');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.sections).toHaveLength(1);
  });

  it('全空白的輸入回傳空結果', () => {
    expect(parseOutline('   \n\n　\n').chapters).toHaveLength(0);
    expect(parseOutline('').nodeCount).toBe(0);
  });
});

describe('parseOutline — 無編號的行靠縮排判斷', () => {
  it('有縮排且章已開著 → 小節', () => {
    const { chapters } = parseOutline('第一章 極限\n  數列極限\n  連續');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.sections.map((s) => s.title)).toEqual(['數列極限', '連續']);
  });

  it('沒有縮排 → 章', () => {
    const { chapters } = parseOutline('極限\n微分');
    expect(chapters).toHaveLength(2);
    expect(chapters.map((c) => c.title)).toEqual(['極限', '微分']);
  });

  it('有縮排但還沒有章 → 章', () => {
    const { chapters } = parseOutline('  極限');
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.title).toBe('極限');
  });
});

describe('parseOutline — 整段貼上', () => {
  const pasted = [
    '第一章　極限',
    '  1-1 數列極限',
    '  1-2 連續',
    '',
    '第2章 微分',
    '  2.1 導數定義',
    '  2.2 連鎖律',
    'Chapter 3  Integration',
  ].join('\n');

  it('解析出 3 章 4 節，共 7 個節點', () => {
    const result = parseOutline(pasted);
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[0]?.sections).toHaveLength(2);
    expect(result.chapters[1]?.sections).toHaveLength(2);
    expect(result.chapters[2]?.sections).toHaveLength(0);
    expect(result.nodeCount).toBe(7);
  });

  it('保留正規化後的原始文字供 UI 顯示', () => {
    const result = parseOutline(pasted);
    expect(result.chapters[0]?.raw).toBe('第一章 極限');
    expect(result.chapters[1]?.raw).toBe('第2章 微分');
    expect(result.chapters[0]?.sections[0]?.raw).toBe('1-1 數列極限');
  });

  it('同一份輸入解析兩次結果相同', () => {
    expect(parseOutline(pasted)).toEqual(parseOutline(pasted));
  });
});
