// Import necessary libraries
const express = require('express');
const axios = require('axios');

// --- Configuration ---
const PORT = process.env.PORT || 3000; // Port to run the server on
const API_TIMEOUT = 90000; // Increased timeout for potentially longer calls (90 seconds)

// API Endpoint Configuration (Only Gemini)
const GEMINI_API_CONFIG = {
    url: "https://gem-ehsan.vercel.app/gemini/chat", // URL API جمینی
    model: "2" // مشخص کردن مدل جمینی
};

// --- Helper Functions ---

// Helper to safely extract text content from API responses
// ** مهم: این تابع ممکن است نیاز به تنظیم دقیق‌تر بر اساس ساختار واقعی پاسخ API جمینی داشته باشد **
function extractTextFromResult(result) {
    if (!result) {
        return ''; // اگر نتیجه‌ای وجود ندارد، رشته خالی برگردان
    }
    if (typeof result === 'string') {
        return result; // اگر نتیجه خودش رشته است، آن را برگردان
    }
    if (typeof result === 'object') {
        // تلاش برای یافتن متن در فیلدهای رایج پاسخ
        if (result.text) return result.text;
        if (result.response) return result.response;
        if (result.message && result.message.content) return result.message.content;
        if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0] && result.candidates[0].content.parts[0].text) {
             return result.candidates[0].content.parts[0].text; // ساختار رایج Google AI Gemini API
        }
        // فال‌بک: کل شیء را به رشته تبدیل کن (ممکن است خروجی ناخوانا باشد)
        // از تبدیل مستقیم به JSON اجتناب می‌کنیم تا فقط متن اصلی استخراج شود در صورت امکان
        console.warn("Could not find standard text field in Gemini response:", result);
        return JSON.stringify(result); // به عنوان آخرین راه حل
    }
    return ''; // برای انواع دیگر داده، رشته خالی برگردان
}

// Function to call the Gemini API
async function callGeminiApi(prompt) {
    // ساخت پرامپت واضح برای جمینی جهت تولید کد و فقط کد
    const fullPrompt = `
You are an expert front-end developer.
Create a complete single-file website (HTML with embedded CSS and JS) based on the following user request.
Output ONLY the raw, complete HTML code, starting exactly with <!DOCTYPE html> and ending exactly with </html>.
Do not include any explanations, comments before or after the code, or markdown formatting like \`\`\`html or \`\`\`.

User Request: "${prompt}"
`.trim(); // trim() برای حذف فضاهای خالی احتمالی اول و آخر

    const data = {
        prompt: fullPrompt,
        model: GEMINI_API_CONFIG.model
    };
    try {
        console.log(`Calling Gemini API with model ${GEMINI_API_CONFIG.model}`);
        const response = await axios.post(GEMINI_API_CONFIG.url, data, { timeout: API_TIMEOUT });
        console.log("Gemini API Response Status:", response.status);
        // استخراج مستقیم متن/کد از پاسخ
        let extractedCode = extractTextFromResult(response.data);

        // تلاش برای پاک‌سازی بیشتر (حذف احتمالی markdown code blocks اگر API اضافه کرده باشد)
        extractedCode = extractedCode.replace(/^```html\s*|\s*```$/g, '').trim();

        // بررسی اولیه برای اطمینان از اینکه شبیه کد HTML است
        if (!extractedCode.toLowerCase().startsWith('<!doctype html') || !extractedCode.toLowerCase().endsWith('</html>')) {
             console.warn("Gemini response might not be complete HTML:", extractedCode.substring(0, 100) + "...");
             // اینجا می‌توانید تصمیم بگیرید که خطا برگردانید یا همان خروجی ناقص را بفرستید
             // return { error: "Gemini did not return valid HTML code." };
        }

        return extractedCode; // فقط کد استخراج شده را برگردان

    } catch (error) {
        console.error("Error calling Gemini API:", error.response ? error.response.data : error.message);
        // برگرداندن یک شیء خطا برای مدیریت در endpoint
        return { error: "Failed to get response from Gemini API.", details: error.message };
    }
}

// --- Express Application Setup ---
const app = express();
app.use(express.json()); // برای خواندن JSON body در درخواست‌های POST

// --- API Endpoint Definition ---
app.all('/generate', async (req, res) => { // .all برای پذیرش GET و POST
    let userPrompt = '';

    // دریافت پرامپت بر اساس نوع درخواست (GET یا POST)
    if (req.method === 'POST') {
        userPrompt = req.body.prompt;
    } else if (req.method === 'GET') {
        userPrompt = req.query.prompt;
    }

    // اعتبارسنجی پرامپت
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
        return res.status(400).json({ error: "Missing or invalid 'prompt'. Use POST with JSON body {'prompt': '...'} or GET with query parameter ?prompt=..." });
    }

    console.log(`Received generation request via ${req.method} for prompt: "${userPrompt}"`);

    try {
        // --- Step 1: Call Gemini API ---
        const geminiResult = await callGeminiApi(userPrompt);

        // --- Step 2: Handle Response ---
        if (geminiResult && typeof geminiResult === 'object' && geminiResult.error) {
            // اگر تابع callGeminiApi یک شیء خطا برگرداند
            console.error("Gemini API call failed:", geminiResult);
            return res.status(502).json({ // 502 Bad Gateway مناسب است وقتی سرویس خارجی خطا می‌دهد
                error: "Failed to generate code using the AI model.",
                details: geminiResult // شامل جزئیات خطا از API جمینی
            });
        }

        // بررسی مجدد که آیا نتیجه‌ای دریافت شده
        if (!geminiResult || typeof geminiResult !== 'string' || geminiResult.trim() === '') {
             console.error("Received empty or invalid code from Gemini.");
             return res.status(500).json({ error: "AI model returned empty or invalid content." });
        }


        // --- Step 3: Send the generated code directly ---
        // تنظیم هدر برای ارسال مستقیم کد HTML
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(geminiResult); // ارسال مستقیم کد HTML به عنوان پاسخ

    } catch (error) {
        // گرفتن خطاهای غیرمنتظره در طول پردازش
        console.error("Error processing /generate request:", error);
        res.status(500).json({
             error: "An internal server error occurred during code generation.",
             details: error.message
        });
    }
});

// Simple root endpoint
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`AI Code Generation Webservice (using Gemini Model ${GEMINI_API_CONFIG.model}) is running.
Use POST /generate with JSON body {"prompt": "your code request"}
or GET /generate?prompt=your%20code%20request`);
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Webservice listening on port ${PORT}`);
    console.log(`Send POST requests to http://localhost:${PORT}/generate with JSON body`);
    console.log(`Or send GET requests to http://localhost:${PORT}/generate?prompt=...`);
});
