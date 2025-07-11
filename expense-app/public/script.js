document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const form = document.getElementById('expense-form');
    const applicantInput = document.getElementById('applicant');
    const titleInput = document.getElementById('title');
    const amountInput = document.getElementById('amount');
    const receiptUploadInput = document.getElementById('receipt-upload');
    const uploadBtn = document.getElementById('upload-btn');
    const preview = document.getElementById('receipt-preview');
    const checkBtn = document.getElementById('check-btn');
    const messageField = document.getElementById('ai-message-field');

    // 初期メッセージ設定
    messageField.textContent = '経費申請を始めましょう';

    // 「+」ボタンクリックでファイル選択ダイアログを開く
    uploadBtn.addEventListener('click', () => {
        receiptUploadInput.click();
    });

    // 領収書ファイルが選択されたときの処理
    receiptUploadInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // プレビュー表示
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        
        messageField.textContent = '領収書を読み込み中です...';
        messageField.className = 'message-field';

        const formData = new FormData();
        formData.append('receiptImage', file);

        try {
            const response = await fetch('/api/read-receipt', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (response.ok) {
                amountInput.value = result.amount;
                messageField.textContent = '領収書を読み込みました。';
                messageField.classList.add('message-success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error:', error);
            messageField.textContent = `領収書読み込み失敗しました: ${error.message}`;
            messageField.classList.add('message-error');
        }
    });

    // 「チェック」ボタンがクリックされたときの処理
    checkBtn.addEventListener('click', async () => {
        // エラー表示をリセット
        resetErrors();
        messageField.textContent = 'AIが入力内容をチェック中です...';
        
        const data = {
            applicant: applicantInput.value,
            title: titleInput.value,
            amount: amountInput.value,
        };

        try {
            const response = await fetch('/api/check-expense', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            
            messageField.textContent = result.message;

            if (result.status === 'success') {
                messageField.classList.add('message-success');
            } else {
                messageField.classList.add('message-error');
                // 未入力フィールドを赤枠にする
                if (result.message.includes('申請者')) applicantInput.classList.add('error');
                if (result.message.includes('タイトル')) titleInput.classList.add('error');
                if (result.message.includes('金額')) amountInput.classList.add('error');
            }

        } catch (error) {
            console.error('Error:', error);
            messageField.textContent = 'AI診断中にエラーが発生しました。';
            messageField.classList.add('message-error');
        }
    });

    function resetErrors() {
        applicantInput.classList.remove('error');
        titleInput.classList.remove('error');
        amountInput.classList.remove('error');
        messageField.className = 'message-field';
    }
});