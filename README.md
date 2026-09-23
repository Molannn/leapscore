# 躍級 LeapScore

國中會考英語自適應學習平台的互動 prototype。學生先完成 6 題程度檢測,系統估計能力值與四項技能掌握度,再依「掌握度低且配分高」的順序安排練習,並提供診斷報告與家長端週報。

純前端靜態網站(HTML、CSS、原生 JavaScript ES modules),不需要建置步驟,可直接部署到 GitHub Pages。

## 目錄結構

```
leapscore/
├── index.html              頁面骨架(各畫面的 HTML 結構)
├── assets/
│   └── css/style.css       樣式與淺色、深色主題色彩
├── data/
│   └── items.json          題庫與閱讀文章
├── src/
│   ├── main.js             進入點:載入題庫、串接事件與流程
│   ├── config.js           設定:技能、配分權重、等級、預設值
│   ├── state.js            學習者狀態的資料結構
│   ├── model.js            學習者模型(能力值、掌握度、等級換算)
│   ├── selector.js         選題邏輯
│   └── ui/views.js         畫面渲染
├── tools/
│   └── validate-items.mjs  題庫格式檢查
├── package.json            常用指令
├── .nojekyll               讓 GitHub Pages 原樣提供檔案
└── .gitignore
```

各模組的依賴方向為單向:`main.js` 呼叫 `selector.js`、`model.js` 與 `ui/views.js`,三者都只讀取 `config.js`。`model.js` 與 `selector.js` 不操作 DOM,可以單獨測試或替換演算法。

## 本機執行

因為使用 ES modules 並以 `fetch` 讀取題庫,不能直接雙擊 `index.html` 開啟,需要啟動本機伺服器:

```bash
python3 -m http.server 8000
# 或 npm start
```

然後開啟 http://localhost:8000 。

## 部署到 GitHub Pages

1. 將整個資料夾 push 到 GitHub repository。
2. 進入 repository 的 Settings,選 Pages。
3. Source 選 Deploy from a branch,Branch 選 `main`,資料夾選 `/ (root)`。
4. 儲存後約一分鐘,網站會出現在 `https://<帳號>.github.io/<repository 名稱>/`。

所有路徑皆為相對路徑,放在子路徑下也能正常運作。

## 維護指南

### 新增或修改題目

只需編輯 `data/items.json`。每一題的格式:

```json
{
  "id": "V07",
  "skill": "vocab",
  "difficulty": 0.5,
  "passage": "school-phone-rule",
  "question": "Please be ____ in the library.",
  "options": ["noisy", "busy", "angry", "quiet"],
  "answer": 3,
  "explanation": "圖書館裡有人在看書,要保持 quiet。"
}
```

| 欄位 | 說明 |
|---|---|
| `id` | 唯一代碼。建議以技能字首加流水號:V 詞彙、G 文法、R 閱讀、D 篇章 |
| `skill` | `vocab`、`gram`、`read`、`disc` 其中之一 |
| `difficulty` | IRT 難度參數,約 -3 到 3。0 為中等,數字越大越難 |
| `passage` | 選填。閱讀題對應 `passages` 中的文章 key |
| `options` | 固定 4 個選項 |
| `answer` | 正確選項的索引,0 到 3 分別對應 A 到 D |
| `explanation` | 答題後顯示的詳解 |

閱讀文章放在同一檔案的 `passages` 物件中,多題可共用同一篇文章。

修改後執行檢查:

```bash
node tools/validate-items.mjs
# 或 npm run validate
```

### 調整配分權重、等級或預設值

編輯 `src/config.js`。例如改成學測版本時,修改 `LEVELS`、`WEIGHTS`、`EXAM_LABEL` 與 `DEFAULT_EXAM_DATE`,並替換題庫。

### 替換演算法

- 能力值與掌握度的更新公式在 `src/model.js`。
- 選題規則在 `src/selector.js`。

兩者的輸入輸出為純資料,替換為正式的 IRT 校準參數或知識追蹤模型時,不需改動畫面程式。

## 目前限制

- 題庫為 20 題自編範例,難度參數為人工設定,尚未以歷屆試題校準。
- 學習紀錄只存在瀏覽器記憶體中,重新整理即重置。
- 僅涵蓋會考閱讀,聽力列為規劃中。
- 預設考試日期 2027-05-15 為暫定值,請以官方公告為準。
