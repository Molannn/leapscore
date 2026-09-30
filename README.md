# 躍級 LeapScore

國中會考英語自適應學習平台的互動 prototype。學生先完成 6 題程度檢測,系統估計能力值與四項技能掌握度,再依「掌握度低且配分高」的順序安排練習,並提供診斷報告、學生學習分析與家長端週報。

前端使用 HTML、CSS、原生 JavaScript ES modules，無需建置。Gemini 即時單字出題由 Node.js 後端提供；純靜態部署仍可使用原題庫與內建情境複習。

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
│   ├── review.js           興趣與表現適應、內建情境備援
│   └── ui/views.js         畫面渲染
├── server/
│   ├── index.mjs           本機靜態網站與出題 API
│   └── generate.mjs        Gemini 請求與題目格式檢查
├── tests/                 自適應邏輯與 API 測試
├── .env.example           後端金鑰設定範本
├── tools/
│   └── validate-items.mjs  題庫格式檢查
├── package.json            常用指令
└── .gitignore
```

`model.js`、`selector.js` 與 `review.js` 不操作 DOM。後端固定從題庫取得目標單字，不接受任意提示詞或由前端指定的 API 網址。

## 本機執行與 Gemini 設定

需要 Node.js 22.9 以上，沒有額外 npm 套件需要安裝。

1. 將 `.env.example` 複製成 `.env`。
2. 在本機 `.env` 填入 `GEMINI_API_KEY`，可用 `GEMINI_MODEL` 指定模型（預設 `gemini-2.5-flash`）。金鑰只由後端讀取；`.env` 已加入 Git 忽略清單。請勿把金鑰放到前端或貼到對話中。
3. 執行 `npm start`，開啟 http://localhost:8000 。更新 `.env` 後重新啟動伺服器。

```dotenv
GEMINI_API_KEY=你的_Gemini_API_金鑰
GEMINI_MODEL=gemini-2.5-flash
PORT=8000
```

未設定金鑰時，其他學習功能仍可使用。生成失敗後可明確選擇「改用內建情境題」，不會將備援題標示成 AI 生成。每次點擊生成最多呼叫 Gemini 一次，沒有自動付費重試。

伺服器預設只監聽本機 `127.0.0.1`，每分鐘最多 20 次出題、同時最多 2 次。這是本機開發版本；公開服務需補上登入、每人額度及正式部署設定。

## 部署到 GitHub Pages

GitHub Pages 只能提供靜態檔案，**無法執行 Gemini 後端**；此部署方式只支援一般學習與內建情境題。若需公開提供即時生成，須另行部署後端並設定同源 `/api/review` 路由。

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
- 學習紀錄儲存在目前瀏覽器的 localStorage,不會跨裝置同步；清除網站資料會刪除紀錄。共用瀏覽器會共用同一份紀錄。
- 僅涵蓋會考閱讀,聽力列為規劃中。
- 預設考試日期 2027-05-15 為暫定值,請以官方公告為準。

## 學生學習分析

完成程度檢測後，點選「學習分析」可查看累積作答次數、答對率、待加強題數，以及四項技能的作答表現與預估掌握度。最近 10 次檢測／一般練習滿額且有前 10 次資料時，會顯示答對率比較；題目難度不同，變化僅供參考。

錯題紀錄按題目彙整，可依技能及「待加強／最近已答對」篩選，顯示答錯次數、最近錯答時間、錯選答案、正確答案、閱讀文章與詳解。「最近已答對」代表該題或其情境複習最新一次作答正確，不代表已穩定掌握。

每次答題後自動儲存進度，重新整理可繼續未完成的檢測；已完成檢測則直接開啟學習分析。儲存失敗時會顯示提示。

## 興趣自適應單字複習

1. 完成程度檢測，開啟「學習分析」。
2. 選擇運動、遊戲、音樂、動物中的一個或多個興趣。
3. 在單字錯題按「依興趣生成複習題」。第一版支援原題庫的 6 個單字：jacket、kind、quiet、lost、easy、save。
4. Gemini 保留原單字、原義與四個選項，產生新的情境與繁體中文詳解；選項順序會打亂。
5. 最近一次該單字複習答錯時，使用較直接的情境並加入提示；連續答對兩次後，改成線索較間接的挑戰題。多個興趣優先輪替近期較少練習的主題。

複習題以 `sourceItemId` 連回原題；每次題目快照、興趣、支援程度、答案、時間與 AI／內建來源會存入瀏覽器。待加強狀態會隨最新原題或複習答案更新，但一次答對不代表穩定掌握。累積答題與技能答對率包含複習；近期一般練習比較、技能掌握度及預估等級不納入未校準的情境題。家長端目前只統計檢測與一般練習。

後端只傳送原單字、原題、選定的興趣與最多 6 道近期情境題給 Gemini，不傳送姓名或整份學習紀錄。格式檢查會拒絕缺欄位、多空格／無空格、洩漏英文答案、最近重複題目及不完整回應，但不能保證語意完全無歧義；正式教學前仍需題目品質驗證。參考 [Gemini 結構化輸出文件](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)。

內建備援包含 6 單字 × 4 興趣 × 2 情境層級，共 48 題；題目用完會重複並標示。新增可複習單字時，需在 `items.json` 加入 `targetWord`、`reviewHint` 與四種 `reviewContexts`。

```bash
npm run validate
npm test
```

測試涵蓋題目完整性、興趣輪替、答錯支援／連續答對挑戰、舊紀錄遷移、Gemini 模擬回應、HTTP 錯誤與私有檔案存取限制。模擬測試不會呼叫付費 API；真實出題須設定可用的 Gemini 金鑰。
