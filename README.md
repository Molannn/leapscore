# 躍級 LeapScore

國中會考英語自適應學習平台的互動 prototype。學生先完成 6 題程度檢測,系統估計能力值與四項技能掌握度,再依「掌握度低且配分高」的順序安排練習,並提供診斷報告、學生學習分析與家長端週報。

前端使用 HTML、CSS、原生 JavaScript ES modules，無需建置。Gemini 即時單字出題由 Node.js 後端提供；GitHub Pages 前端可透過 HTTPS 連接 Render 後端。未設定後端網址時仍可使用原題庫與內建情境複習。

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
│   ├── deployment.js       公開的 Render 後端網址（不含金鑰）
│   ├── api.js              跨來源 API 與服務喚醒
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
├── render.yaml            Render 一鍵部署範本
├── .nojekyll              GitHub Pages 靜態檔案部署
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

本機預設監聽 `127.0.0.1`；Render 設定為 `0.0.0.0` 並使用平台提供的 `PORT`。每分鐘最多 20 次出題、同時最多 2 次。

## GitHub Pages ＋ Render 部署

學生網址：<https://molannn.github.io/leapscore/>。GitHub Pages 提供前端；Render 保管 Gemini 金鑰並執行 `/api/review`。

### 1. 建立 Render 後端

[部署到 Render](https://render.com/deploy?repo=https://github.com/Molannn/leapscore)

登入 Render 後，從以上連結建立 Blueprint。範本使用 Free web service，填入 `GEMINI_API_KEY` 後部署，金鑰不要填入 GitHub 檔案。部署成功後複製服務網址，例如 `https://leapscore-api-xxxx.onrender.com`；實際名稱由 Render 決定。

`render.yaml` 已提供以下設定：

| 設定 | 值 |
|---|---|
| Build command | `npm run validate && npm test` |
| Start command | `npm start` |
| 健康檢查 | `/api/health` |
| `HOST` | `0.0.0.0` |
| `ALLOWED_ORIGINS` | `https://molannn.github.io` |
| `GEMINI_MODEL` | `gemini-3.1-pro-preview` |
| `REVIEW_DAILY_LIMIT` | `100` |

也可以手動建立 Node Web Service，連接此 repo 的 `main`，套用上述設定及 `GEMINI_API_KEY`。Blueprint 設定推送 `main` 時自動部署，方便此專案同步更新。

### 2. 設定前端 API 網址

在 `src/deployment.js` 填入 **Render 實際服務網址**，只填 HTTPS origin，不加 `/api/review`：

```js
export const API_BASE_URL = "https://你的服務.onrender.com";
```

提交並推送到 GitHub。此設定會公開，不能放 API 金鑰。localhost 開發會自動忽略這個網址，繼續使用本機後端。

### 3. GitHub Pages

Repository → Settings → Pages：Source 選 Deploy from a branch，Branch 選 `main`，資料夾選 `/ (root)`。已啟用者不需變更。部署完成後重新整理學生網址。

打開 `https://你的服務.onrender.com/api/health` 應得到 `{"status":"ok"}`；這只代表後端可用，實際 Gemini 金鑰與額度在生成時驗證。到學生端選興趣、從單字錯題生成一題，才是完整驗證。

### 連線與額度

前端會先以健康檢查喚醒遠端服務，最多等待 90 秒，再送出一次生成請求（35 秒逾時）。生成不自動重試，以免重複計費；服務失敗時可使用內建題。後端只對明確列出的 origin 回應跨來源請求，`ALLOWED_ORIGINS` 可用逗號分隔；origin 不包含 `/leapscore/` 路徑。Render 自身網站 origin 由 `RENDER_EXTERNAL_URL` 納入。

目前為公開展示版，沒有學生登入。CORS 是瀏覽器來源限制，不等於身分驗證。每日 100 次為整個執行個體共用的記憶體上限，UTC 換日或伺服器重啟會重置，不是帳務硬上限；正式多人服務需持久化每人額度與登入控制。學習紀錄仍保存在各瀏覽器，從 localhost 改用 GitHub Pages 不會自動帶入舊紀錄。

部署設定參考：[Render Blueprint](https://render.com/docs/blueprint-spec)、[Render Web Services](https://render.com/docs/web-services)。

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
3. 在「學習分析」上方選擇練習單字，按「依興趣出題」；即使沒有單字錯題也可使用。下方單字錯題仍保留「依興趣生成複習題」入口。第一版支援原題庫的 6 個單字：jacket、kind、quiet、lost、easy、save。
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

## 前測彩蛋加分題

本次 6 題前測全部答錯時，第 6 題回饋會出現「挑戰加分題」，答題或略過後進入診斷報告。正解為 A「皇額娘她推了熹娘娘」，答對獲得獨立的彩蛋 1 分，不改變英語能力、掌握度、答對率或錯題紀錄。待作答狀態會保存，重新整理能接續，不會重複加分。

題目設定在 `src/bonus.js`，圖片在 `assets/images/palace-bonus.jpg`。目前使用使用者提供的[新聞文章](https://tw.news.yahoo.com/皇后推甄嬛-朧月為何-開始說沒看見-090004810.html)中的同場景劇照，與對話附圖的截圖影格不同；檔案可直接替換為原附圖。來源圖網址：`https://media.zenfs.com/zh-tw/setn.com.tw/d3e0fc9b5626f3da9d19728c761a55de`。
