import { describe, it, expect } from 'vitest';
import { parseKeywords, KEYWORD_SEPARATORS } from '../src/keywords';

describe('parseKeywords — 四種分隔符號', () => {
  it('分隔符號清單就是規格指定的四種', () => {
    expect([...KEYWORD_SEPARATORS]).toEqual(['｜', '|', '\t', '、']);
  });

  it('全形直線', () => {
    expect(parseKeywords('導數｜函數在某點的瞬時變化率')).toEqual([
      { term: '導數', description: '函數在某點的瞬時變化率' },
    ]);
  });

  it('半形直線', () => {
    expect(parseKeywords('導數|瞬時變化率')).toEqual([
      { term: '導數', description: '瞬時變化率' },
    ]);
  });

  it('Tab', () => {
    expect(parseKeywords('導數\t瞬時變化率')).toEqual([
      { term: '導數', description: '瞬時變化率' },
    ]);
  });

  it('頓號', () => {
    expect(parseKeywords('導數、瞬時變化率')).toEqual([
      { term: '導數', description: '瞬時變化率' },
    ]);
  });

  it('同一份貼上可以混用不同分隔符號', () => {
    const text = ['導數｜瞬時變化率', '積分|面積', '極限\t逼近值', '連續、無斷點'].join('\n');
    expect(parseKeywords(text)).toEqual([
      { term: '導數', description: '瞬時變化率' },
      { term: '積分', description: '面積' },
      { term: '極限', description: '逼近值' },
      { term: '連續', description: '無斷點' },
    ]);
  });
});

describe('parseKeywords — 只切第一個分隔符號', () => {
  it('說明欄裡的直線保留下來，不會再被切開', () => {
    expect(parseKeywords('絕對值｜\\left| x \\right| 恆非負')).toEqual([
      { term: '絕對值', description: '\\left| x \\right| 恆非負' },
    ]);
  });

  it('說明欄裡的頓號保留下來', () => {
    expect(parseKeywords('三角函數｜sin、cos、tan')).toEqual([
      { term: '三角函數', description: 'sin、cos、tan' },
    ]);
  });

  it('最早出現的分隔符號才是切點，與清單順序無關', () => {
    // 頓號在前、全形直線在後，應以頓號為切點。
    expect(parseKeywords('甲、乙｜丙')).toEqual([{ term: '甲', description: '乙｜丙' }]);
  });

  it('LaTeX 說明欄原樣保留', () => {
    const latex = '$\\frac{dy}{dx} = \\frac{dy}{du}\\cdot\\frac{du}{dx}$';
    expect(parseKeywords(`連鎖律｜${latex}`)).toEqual([
      { term: '連鎖律', description: latex },
    ]);
  });
});

describe('parseKeywords — 空白與空行', () => {
  it('空行被略過', () => {
    expect(parseKeywords('\n\n導數｜變化率\n\n\n積分｜面積\n\n')).toHaveLength(2);
  });

  it('前後空白被去掉', () => {
    expect(parseKeywords('  導數  ｜  變化率  ')).toEqual([
      { term: '導數', description: '變化率' },
    ]);
  });

  it('全形空白視為空白', () => {
    expect(parseKeywords('　導數　｜　變化率　')).toEqual([
      { term: '導數', description: '變化率' },
    ]);
  });

  it('沒有分隔符號時說明為空字串', () => {
    expect(parseKeywords('導數')).toEqual([{ term: '導數', description: '' }]);
  });

  it('只有關鍵字沒有說明（分隔符號後面是空的）', () => {
    expect(parseKeywords('導數｜')).toEqual([{ term: '導數', description: '' }]);
  });

  it('關鍵字為空的行被略過', () => {
    expect(parseKeywords('｜只有說明\n導數｜變化率')).toEqual([
      { term: '導數', description: '變化率' },
    ]);
  });

  it('完全空白的輸入回傳空陣列', () => {
    expect(parseKeywords('')).toEqual([]);
    expect(parseKeywords('  \n　\n\t')).toEqual([]);
  });

  it('只有 Tab 的行不會產生空關鍵字', () => {
    expect(parseKeywords('\t')).toEqual([]);
  });
});

describe('parseKeywords — 換行符號', () => {
  it('支援 CRLF 與 CR', () => {
    expect(parseKeywords('導數｜變化率\r\n積分｜面積')).toHaveLength(2);
    expect(parseKeywords('導數｜變化率\r積分｜面積')).toHaveLength(2);
  });

  it('重複的關鍵字保留，不做去重', () => {
    expect(parseKeywords('導數｜A\n導數｜B')).toHaveLength(2);
  });
});
