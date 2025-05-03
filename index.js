// Import necessary libraries
const express = require('express');
const axios = require('axios');
const crypto = require('crypto'); // For generating a simple user ID

// --- Configuration ---
const PORT = process.env.PORT || 3000; // Port to run the server on
const API_TIMEOUT = 90000; // Increased timeout for potentially longer calls (90 seconds)

// API Endpoint Configurations
const GPT4_API_CONFIG = {
    url: "https://api.binjie.fun/api/generateStream",
    headers: {
        "authority": "api.binjie.fun",
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "origin": "https://chat18.aichatos.xyz",
        "referer": "https://chat18.aichatos.xyz/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
};

const GEMINI_API_CONFIG = {
    url: "https://gem-ehsan.vercel.app/gemini/chat",
    model: "2"
};

const LLAMA3_API_CONFIG = {
    url: "https://lama-ehsan.vercel.app/chat",
    model: "llama3-free"
};

// --- Helper Functions for API Calls ---

function generateUserId() {
    return `web-${crypto.randomBytes(8).toString('hex')}`;
}

// Helper to safely extract text content from potentially varied API responses
function extractTextFromResult(result) {
    if (!result || typeof result === 'string') {
        return result || ''; // Return the string or empty if null/undefined
    }
    if (typeof result === 'object') {
        // ** CRITICAL: Adjust these based on actual API response structures **
        if (result.text) return result.text;
        if (result.response) return result.response;
        if (result.message && result.message.content) return result.message.content; // Common structure
        if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) return result.choices[0].message.content; // Another common structure
        // Fallback: Convert the whole object to string (might be noisy)
        return JSON.stringify(result);
    }
    return ''; // Return empty for other types
}


async function callGpt4Api(prompt, isSynthesis = false) {
    const userId = generateUserId();
    const systemMessage = isSynthesis
        ? "You are an expert front-end developer. Combine the following website ideas into a single, clean, modern HTML/CSS/JS website in one file. Output only the full code of the site."
        : "You are a professional front-end developer. Write a complete single-file website (HTML with embedded CSS and JS) based on the prompt. Output only the full code.";

    const data = {
        prompt: prompt,
        userId: userId,
        network: true,
        system: systemMessage,
        withoutContext: !isSynthesis, // Maintain context if synthesizing
        stream: false
    };

    try {
        console.log(`Calling GPT-4 API (${isSynthesis ? 'Synthesis' : 'Initial'})`);
        const response = await axios.post(GPT4_API_CONFIG.url, data, { headers: GPT4_API_CONFIG.headers, timeout: API_TIMEOUT });
        console.log(`GPT-4 API (${isSynthesis ? 'Synthesis' : 'Initial'}) Response Status:`, response.status);
        return response.data; // Adjust extraction if needed, see extractTextFromResult
    } catch (error) {
        console.error(`Error calling GPT-4 API (${isSynthesis ? 'Synthesis' : 'Initial'}):`, error.response ? error.response.data : error.message);
        return { error: `Failed to get response from GPT-4 API (${isSynthesis ? 'Synthesis' : 'Initial'}).`, details: error.message };
    }
}

async function callGeminiApi(prompt) {
    const data = {
        prompt: prompt,
        model: GEMINI_API_CONFIG.model
    };
    try {
        console.log(`Calling Gemini API`);
        const response = await axios.post(GEMINI_API_CONFIG.url, data, { timeout: API_TIMEOUT });
        console.log("Gemini API Response Status:", response.status);
        return response.data; // Adjust extraction if needed, see extractTextFromResult
    } catch (error) {
        console.error("Error calling Gemini API:", error.response ? error.response.data : error.message);
        return { error: "Failed to get response from Gemini API.", details: error.message };
    }
}

async function callLlama3Api(prompt) {
    const data = {
        model: LLAMA3_API_CONFIG.model,
        prompt: prompt
    };
    try {
        console.log(`Calling Llama3 API`);
        const response = await axios.post(LLAMA3_API_CONFIG.url, data, { timeout: API_TIMEOUT });
        console.log("Llama3 API Response Status:", response.status);
        return response.data; // Adjust extraction if needed, see extractTextFromResult
    } catch (error) {
        console.error("Error calling Llama3 API:", error.response ? error.response.data : error.message);
        return { error: "Failed to get response from Llama3 API.", details: error.message };
    }
}

// --- Express Application Setup ---
const app = express();
app.use(express.json());

// --- API Endpoint Definition ---
app.post('/generate', async (req, res) => {
    const userPrompt = req.body.prompt;

    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
        return res.status(400).json({ error: "Missing or invalid 'prompt' in request body." });
    }

    console.log(`Received synthesis request for prompt: "${userPrompt}"`);

    let initialResults;
    let initialGpt4Output, initialGeminiOutput, initialLlama3Output;
    let gpt4Text = 'No response or error.', geminiText = 'No response or error.', llama3Text = 'No response or error.';

    try {
        // --- Step 1: Get initial responses ---
        console.log("--- Starting Initial Generation Phase ---");
        initialResults = await Promise.all([
            callGpt4Api(userPrompt, false), // Initial call
            callGeminiApi(userPrompt),
            callLlama3Api(userPrompt)
        ]);
        console.log("--- Finished Initial Generation Phase ---");

        initialGpt4Output = initialResults[0];
        initialGeminiOutput = initialResults[1];
        initialLlama3Output = initialResults[2];

        // Extract text from initial results - ** Adjust logic based on actual API responses **
        gpt4Text = extractTextFromResult(initialGpt4Output);
        geminiText = extractTextFromResult(initialGeminiOutput);
        llama3Text = extractTextFromResult(initialLlama3Output);

        // Check if all initial calls failed
        if (initialGpt4Output?.error && initialGeminiOutput?.error && initialLlama3Output?.error) {
             return res.status(502).json({
                error: "All initial AI models failed to respond.",
                details: {
                    gpt4: initialGpt4Output,
                    gemini: initialGeminiOutput,
                    llama3: initialLlama3Output
                }
             });
        }

        // --- Step 2: Synthesize the results ---
        console.log("--- Starting Synthesis Phase ---");
        const synthesisPrompt = `
User Request:
"${userPrompt}"

--- Initial Suggestions ---

From GPT-4:
${gpt4Text}

From Gemini:
${geminiText}

From LLaMA3:
${llama3Text}

--- Task ---
Based on the above suggestions, build a **single-page website** using modern HTML, CSS, and JavaScript. Include everything in one HTML file. Prioritize design quality, responsiveness, and code clarity. Do not include explanation, just return the complete HTML code.
`;

        const synthesisResult = await callGpt4Api(synthesisPrompt, true); // Synthesis call

        console.log("--- Finished Synthesis Phase ---");

        // Extract final synthesized text - ** Adjust logic based on actual API response **
        const synthesizedCode = extractTextFromResult(synthesisResult);

        // --- Step 3: Format and Send Response ---
        const responsePayload = {
            prompt: userPrompt,
            synthesized_output: synthesisResult?.error ? { error: "Synthesis failed.", details: synthesisResult } : synthesizedCode,
            initial_outputs: { // Include initial outputs for reference
                gpt4: initialGpt4Output,
                gemini: initialGeminiOutput,
                llama3: initialLlama3Output
            },
            timestamp: new Date().toISOString()
        };

        const acceptHeader = req.headers.accept || '';
        const outputFormat = req.query.format || (acceptHeader.includes('text/plain') ? 'txt' : 'json');

        if (outputFormat.toLowerCase() === 'txt') {
            let txtOutput = `--- Prompt ---\n${responsePayload.prompt}\n\n`;
            txtOutput += `--- Synthesized Output ---\n${JSON.stringify(responsePayload.synthesized_output, null, 2)}\n\n`;
            txtOutput += `--- Initial GPT-4 Output ---\n${JSON.stringify(responsePayload.initial_outputs.gpt4, null, 2)}\n\n`;
            txtOutput += `--- Initial Gemini Output ---\n${JSON.stringify(responsePayload.initial_outputs.gemini, null, 2)}\n\n`;
            txtOutput += `--- Initial Llama3 Output ---\n${JSON.stringify(responsePayload.initial_outputs.llama3, null, 2)}\n\n`;
            txtOutput += `Timestamp: ${responsePayload.timestamp}`;

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.send(txtOutput);
        } else {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.json(responsePayload);
        }

    } catch (error) {
        // Catch unexpected errors during the process
        console.error("Error processing /generate-synthesized-code request:", error);
        res.status(500).json({
             error: "An internal server error occurred during synthesis.",
             details: error.message,
             initial_outputs_received: { // Include whatever was received before the error
                gpt4: initialGpt4Output || "Not retrieved",
                gemini: initialGeminiOutput || "Not retrieved",
                llama3: initialLlama3Output || "Not retrieved"
             }
        });
    }
});

// Simple root endpoint
app.get('/', (req, res) => {
    res.send('AI Code Synthesis Webservice is running. Use POST /generate with a JSON body like {"prompt": "your code request"}');
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Webservice listening on port ${PORT}`);
    console.log(`Send POST requests to http://localhost:${PORT}/generate-synthesized-code`);
});
