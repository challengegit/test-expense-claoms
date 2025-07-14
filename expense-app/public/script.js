document.addEventListener('DOMContentLoaded', () => {

    // --- DOM要素の取得 ---
    const expenseForm = document.getElementById('expense-form');
    const applicantInput = document.getElementById('applicant');
    const titleInput = document.getElementById('title');
    const amountInput = document.getElementById('amount');
    const uploadInput = document.getElementById('receipt-upload');
    const uploadBtn = document.getElementById('upload-btn');
    const receiptPreview = document.getElementById('receipt-preview');
    const checkBtn = document.getElementById('check-btn');
    const aiMessageField = document.getElementById('ai-message-field');
    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const closeModalBtn = document.querySelector('.modal-close-btn');

    let uploadedImageFile = null;

    // --- 金額フォーマット関連の機能 ---
    const formatAmount = (value) => {
        if (value == null) return '';
        const numStr = String(value).replace(/[^0-9]/g, '');
        if (numStr === '') return '';
        return Number(numStr).toLocaleString();
    };

    const unformatAmount = (value) => {
        if (typeof value !== 'string') return '';
        return value.replace(/,/g, '');
    };
    
    amountInput.addEventListener('input', () => {
        amountInput.value = formatAmount(amountInput.value);
    });

    // --- 領収書アップロード関連の機能 ---
    uploadBtn.addEventListener('click', () => {
        uploadInput.click();
    });

    uploadInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            uploadedImageFile = null;
            return;
        }
        uploadedImageFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            receiptPreview.src = e.target.result;
            receiptPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        aiMessageField.textContent = '領収書から金額を読み取っています...';
        checkBtn.disabled = true;
        amountInput.value = '';
        uploadBtn.classList.remove('input-error');

        const formData = new FormData();
        formData.append('receiptImage', uploadedImageFile);

        try {
            const response = await fetch('/api/read-receipt', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || '金額の読み取りに失敗しました。');
            }
            amountInput.value = formatAmount(result.amount);
            aiMessageField.textContent = `金額「${amountInput.value}円」を読み取りました。内容を確認し、問題なければ「チェック」ボタンを押してください。`;
        } catch (error) {
            console.error('金額読み取りエラー:', error);
            aiMessageField.textContent = `エラー: ${error.message} 手動で金額を入力してください。`;
        } finally {
            checkBtn.disabled = false;
        }
    });

    // --- AIチェックボタンの機能 ---
    checkBtn.addEventListener('click', async () => {
        applicantInput.classList.remove('input-error');
        titleInput.classList.remove('input-error');
        amountInput.classList.remove('input-error');
        uploadBtn.classList.remove('input-error');

        checkBtn.disabled = true;
        checkBtn.textContent = 'チェック中...';
        aiMessageField.textContent = '';

        let currentAmount = unformatAmount(amountInput.value);
        
        if (currentAmount === '' && uploadedImageFile) {
            aiMessageField.textContent = '金額を領収書から読み取ってチェックします...';
            try {
                const receiptFormData = new FormData();
                receiptFormData.append('receiptImage', uploadedImageFile);
                const response = await fetch('/api/read-receipt', { method: 'POST', body: receiptFormData });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '金額の再読み取りに失敗');
                currentAmount = unformatAmount(result.amount);
                amountInput.value = formatAmount(currentAmount);
            } catch (error) {
                console.error('金額の再読み取りエラー:', error);
                aiMessageField.textContent = `エラー: ${error.message}。手動で金額を入力してください。`;
                amountInput.classList.add('input-error');
                checkBtn.disabled = false;
                checkBtn.textContent = 'チェック';
                return;
            }
        }

        // ▼▼▼ この部分を修正 ▼▼▼
        // 空のFormDataを作成し、手動でデータを追加する
        const formData = new FormData();
        formData.append('applicant', applicantInput.value);
        formData.append('title', titleInput.value);
        formData.append('amount', currentAmount);
        if (uploadedImageFile) {
            formData.append('receiptImage', uploadedImageFile);
        }
        // ▲▲▲ この部分を修正 ▲▲▲

        try {
            const response = await fetch('/analyze', { method: 'POST', body: formData });
            if (!response.ok) {
                const errorResult = await response.json();
                if (errorResult.errorFields && errorResult.errorFields.length > 0) {
                    errorResult.errorFields.forEach(field => {
                        if (field === 'applicant') applicantInput.classList.add('input-error');
                        if (field === 'title') titleInput.classList.add('input-error');
                        if (field === 'amount') amountInput.classList.add('input-error');
                        if (field === 'receiptImage') uploadBtn.classList.add('input-error');
                    });
                }
                throw new Error(errorResult.message || `サーバーエラー: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            aiMessageField.innerHTML = '';
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const formattedHtml = buffer.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
                aiMessageField.innerHTML = formattedHtml;
            }
        } catch (error) {
            console.error('チェック処理エラー:', error);
            aiMessageField.textContent = `エラーが発生しました: ${error.message}`;
        } finally {
            checkBtn.disabled = false;
            checkBtn.textContent = 'チェック';
        }
    });

    // --- 画像モーダル関連の機能 ---
    receiptPreview.addEventListener('click', () => {
        if (receiptPreview.src) {
            imageModal.style.display = "block";
            modalImage.src = receiptPreview.src;
        }
    });

    closeModalBtn.addEventListener('click', () => {
        imageModal.style.display = "none";
    });

    window.addEventListener('click', (event) => {
        if (event.target == imageModal) {
            imageModal.style.display = "none";
        }
    });
});
