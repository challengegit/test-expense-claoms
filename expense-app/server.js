const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// APIキーのチェック
if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in the environment variables.");
}

// Google AIの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); // マルチモーダル対応モデル

// ミドルウェアの設定
app.use(express.json());
app.use(express.static('public'));

// 画像アップロードのためのMulter設定
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- APIエンドポイント ---

// ① 領収書画像をアップロードして金額を読み取るAPI
app.post('/api/read-receipt', upload.single('receiptImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '画像ファイルがありません。' });
        }

        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype,
            },
        };

        const prompt = "この領収書の画像から合計金額を読み取り、数字のみを返してください。通貨記号やコンマは含めないでください。読み取れない場合は 'error' とだけ返してください。";
        
        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text().trim();

        if (text === 'error' || isNaN(text) || text === '') {
            res.status(400).json({ error: '金額を読み取れませんでした。' });
        } else {
            res.json({ amount: text });
        }
    } catch (error) {
        console.error('Error reading receipt:', error);
        res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
    }
});

// ② 入力内容をチェックするAPI
app.post('/api/check-expense', async (req, res) => {
    try {
        const { applicant, title, amount } = req.body;

        const prompt = `
            あなたは厳格な経理担当者です。以下の経費申請の内容をチェックしてください。
            - 申請者、申請タイトル、金額の全てのフィールドに入力があるか確認してください。
            - いずれかのフィールドが空の場合、ステータスを"error"とし、どのフィールドが未入力か具体的に指摘するメッセージを日本語で返してください。
            - 全てのフィールドに入力がある場合、ステータスを"success"とし、メッセージを"入力が正しいことを確認しました"としてください。
            
            以下のJSON形式のみで回答してください。説明文は不要です。
            
            入力データ:
            {
              "applicant": "${applicant}",
              "title": "${title}",
              "amount": "${amount}"
            }
        `;
        
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        
        // AIの出力がたまにマークダウン形式になることがあるので整形
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const jsonResponse = JSON.parse(responseText);
        res.json(jsonResponse);

    } catch (error) {
        console.error('Error checking expense:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'AI診断中にエラーが発生しました。入力形式を確認してください。' 
        });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});