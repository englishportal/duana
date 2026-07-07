import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsing middleware with a larger limit for base64 images
  app.use(express.json({ limit: '10mb' }));

  // API routes FIRST
  app.post("/api/parse-image", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body || {};
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: "Thiếu dữ liệu hình ảnh hoặc mimeType." });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({
          error: "Vui lòng cấu hình API Key cho Gemini (GEMINI_API_KEY) trong cài đặt ứng dụng."
        });
      }

      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const prompt = `Bạn là một chuyên gia ngôn ngữ tiếng Anh. Hãy phân tích hình ảnh đề thi này và trích xuất tất cả các câu hỏi trắc nghiệm dưới dạng cấu trúc JSON chi tiết.
Chuyển đổi từng câu hỏi tìm thấy thành định dạng đối tượng sau:
{
  "id": "q_" + một chuỗi số ngẫu nhiên độc nhất (ví dụ "q_38271"),
  "type": "mcq",
  "questionText": "Nội dung câu hỏi bằng tiếng Anh",
  "options": [
    { "key": "A", "text": "Lựa chọn A" },
    { "key": "B", "text": "Lựa chọn B" },
    { "key": "C", "text": "Lựa chọn C" },
    { "key": "D", "text": "Lựa chọn D" }
  ],
  "correctAnswer": "A hoặc B hoặc C hoặc D tùy thuộc đáp án đúng"
}
Lưu ý: Chỉ trả về mảng các câu hỏi hợp lệ trích xuất từ ảnh. Đảm bảo đúng định dạng JSON yêu cầu.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType
              }
            },
            {
              text: prompt
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING },
                questionText: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      text: { type: Type.STRING }
                    },
                    required: ['key', 'text']
                  }
                },
                correctAnswer: { type: Type.STRING }
              },
              required: ['id', 'type', 'questionText', 'options', 'correctAnswer']
            }
          }
        }
      });

      if (!response.text) {
        throw new Error('Không nhận được kết quả phân tích từ AI.');
      }

      const questions = JSON.parse(response.text.trim());
      return res.json({ success: true, questions });
    } catch (error: any) {
      console.error('Gemini parse error:', error);
      return res.status(500).json({
        error: `Lỗi khi phân tích đề thi bằng AI: ${error.message || error}`
      });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
