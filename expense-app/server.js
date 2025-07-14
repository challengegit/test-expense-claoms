const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// 1. Expressアプリケーションの初期化
const app = express();
const port = process.env.PORT || 3000;

// 2. APIキーのチェック
if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in the environment variables.");
}

// 3. Google AIの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// 4. ミドルウェアの設定
app.use(express.json());
app.use(express.static('public'));

// 5. 画像アップロードのためのMulter設定
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// ★★★ 429エラーを判定するヘルパー関数を追加 ★★★
const handleApiError = (error, res) => {
    console.error('API Error:', error);

    // 429エラー (Too Many Requests) の場合
    if (error.status === 429) {
        let message = "APIの利用が一時的に制限されています。";
        // エラー詳細に 'PerDay' が含まれているかで1日上限か1分上限かを判断
        if (JSON.stringify(error.errorDetails).includes('PerDay')) {
            message += " 本日の利用上限に達したため、現在ご利用いただけません。明日以降に再度お試しください。";
        } else {
            message += " 1分ほど時間をおいてから、再度お試しください。";
        }
        return res.status(429).json({ error: message });
    }

    // その他の一般的なサーバーエラー
    return res.status(500).json({ error: 'AIとの通信中にサーバー側でエラーが発生しました。' });
};


// --- APIエンドポイントの定義 ---

// ① 金額読み取り専用のAPIエンドポイント
app.post('/api/read-receipt', upload.single('receiptImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '画像ファイルがありません。' });
        }
        const imagePart = {
            inlineData: { data: req.file.buffer.toString("base64"), mimeType: req.file.mimetype },
        };
        const prompt = "この領収書の画像から合計金額だけを読み取り、数字のみを返してください。通貨記号やコンマは含めないでください。読み取れない場合は 'error' とだけ返してください。";
        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text().trim();
        if (text === 'error' || isNaN(text) || text === '') {
            res.status(400).json({ error: '金額を読み取れませんでした。' });
        } else {
            res.json({ amount: text });
        }
    } catch (error) {
        // ▼▼▼ ヘルパー関数を使ってエラー処理 ▼▼▼
        handleApiError(error, res);
    }
});

// ② フォーム全体をチェックする統合APIエンドポイント (ストリーミング対応)
app.post('/analyze', upload.single('receiptImage'), async (req, res) => {
    try {
        console.log("Received a request to /analyze");
        const { applicant, title, amount } = req.body;
        const imageFile = req.file;

        const errorFields = [];
        if (!applicant) errorFields.push('applicant');
        if (!title) errorFields.push('title');
        if (!amount) errorFields.push('amount');
        if (!imageFile) errorFields.push('receiptImage');

        if (errorFields.length > 0) {
            return res.status(400).json({
                message: '入力が不足しています。赤色の項目を確認してください。',
                errorFields: errorFields
            });
        }

        const prompt = `
            あなたは経験豊富な経理担当者です。以下の経費申請の内容と添付された領収書画像を厳しくチェックしてください。
            あなたの回答はマークダウン形式で、リアルタイムに少しずつ表示されます。

            ## 申請内容
            - 申請者: ${applicant}
            - 申請タイトル: ${title}
            - 自己申告金額: ${amount} 円

            ## チェック項目
            1.  **金額の整合性**: 領収書に記載されている合計金額と、自己申告金額が一致しているか確認してください。
            2.  **内容の妥当性**: 領収書の内容（店名、品目など）が、申請タイトルと一致しているか、経費として妥当か判断してください。
            3.  **必須項目の抽出**: 領収書から「合計金額」「発行日」「店名」を抽出してください。

            ## 出力
            上記のチェック結果を基に、以下の形式で診断コメントを生成してください。
            - 金額が不一致の場合や、内容に疑義がある場合は、その点を具体的に指摘してください。
            - 問題がなければ、「申請内容と領収書に問題は見つかりませんでした。」といった肯定的なメッセージを返してください。
        `;

        const imagePart = {
            inlineData: { data: imageFile.buffer.toString("base64"), mimeType: imageFile.mimetype },
        };
        
        const result = await model.generateContentStream([prompt, imagePart]);
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(chunkText);
        }

        res.end();

    } catch (error) {
        // ▼▼▼ ヘルパー関数を使ってエラー処理 ▼▼▼
        console.error("Error in /analyze endpoint:", error);

        if (!res.headersSent) {
            // 429エラーを判定するロジックを修正
            if (error.status === 429) {
                let message = "APIの利用が一時的に制限されています。";
                if (JSON.stringify(error.errorDetails).includes('PerDay')) {
                    message += " 本日の利用上限に達したため、現在ご利用いただけません。明日以降に再度お試しください。";
                } else {
                    message += " 1分ほど時間をおいてから、再度お試しください。";
                }
                res.status(429).json({ message: message, errorFields: [] });
            } else {
                res.status(500).json({ message: 'AIの解析中にサーバー側でエラーが発生しました。', errorFields: [] });
            }
        } else {
            res.end();
        }
    }
});


// 6. サーバーの起動
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
