import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

function getGeminiClient(customKey?: string): GoogleGenAI {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please add it to your environment or settings.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 25mb limit for multimodal base64 image uploads
  app.use(express.json({ limit: '25mb' }));

  // API Route: AI Task Deconstruction ("✨ AI Rã Nhỏ")
  app.post('/api/gemini/deconstruct', async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskTitle, quadrant, customKey } = req.body;
      if (!taskTitle) {
        res.status(400).json({ error: 'taskTitle is required' });
        return;
      }

      const ai = getGeminiClient(customKey);
      const prompt = `Bạn là chuyên gia quản lý thời gian và kỷ luật thép của deepflower.
Hãy rã nhỏ nhiệm vụ sau thành đúng 3 đến 4 bước hành động cụ thể, khả thi, mỗi bước dưới 25 phút (Micro-actions):
Nhiệm vụ: "${taskTitle}"
Phân loại Eisenhower: "${quadrant || 'do_first'}"

Yêu cầu trả về định dạng JSON thuần túy (không markdown, không bọc \`\`\`json):
[
  { "text": "Hành động cụ thể 1", "estimatedMinutes": 20 },
  { "text": "Hành động cụ thể 2", "estimatedMinutes": 25 },
  { "text": "Hành động cụ thể 3", "estimatedMinutes": 15 }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: 'Bạn là trợ lý phân rã nhiệm vụ chuyên nghiệp cho hệ thống deepflower. Luôn trả lời bằng tiếng Việt ngắn gọn, dứt khoát và thực tế.',
        },
      });

      const text = response.text || '[]';
      try {
        const subtasks = JSON.parse(text);
        res.json({ subtasks });
      } catch (parseErr) {
        console.error('Failed to parse subtasks JSON:', parseErr, text);
        res.json({
          subtasks: [
            { text: `Bước 1: Chuẩn bị tài liệu cho: ${taskTitle}`, estimatedMinutes: 15 },
            { text: `Bước 2: Thực hiện cốt lõi giai đoạn 1`, estimatedMinutes: 25 },
            { text: `Bước 3: Hoàn thiện và nghiệm thu`, estimatedMinutes: 20 },
          ],
        });
      }
    } catch (error: any) {
      console.error('Error in /api/gemini/deconstruct:', error);
      res.status(500).json({
        error: error?.message || 'Lỗi khi gọi AI Gemini',
        fallbackSubtasks: [
          { text: 'Bước 1: Khởi động và chuẩn bị trong 10 phút', estimatedMinutes: 10 },
          { text: 'Bước 2: Tập trung giải quyết phần khó nhất', estimatedMinutes: 25 },
          { text: 'Bước 3: Rà soát và đánh giá kết quả', estimatedMinutes: 15 },
        ],
      });
    }
  });

  // API Route: AI Discipline Coach Multimodal Proof Critique
  app.post('/api/gemini/coach-critique', async (req: Request, res: Response): Promise<void> => {
    try {
      const { caption, imageBase64, mimeType, persona, habitsSummary, customKey } = req.body;
      const ai = getGeminiClient(customKey);

      const isStrict = persona === 'strict';
      const systemInstruction = isStrict
        ? 'Bạn là Vị Huấn Luyện Viên Kỷ Luật Thép (Strict Spartan Coach) của ứng dụng deepflower. Bạn thẳng thắn, dứt khoát, không chấp nhận lý do biện hộ, đòi hỏi tiêu chuẩn kỷ luật cao nhất nhưng công tâm và truyền cảm hứng hành động mãnh liệt.'
        : 'Bạn là Người Đồng Hành Tỉnh Thức (Mindful Stoic Guide) của deepflower. Bạn thấu hiểu, điềm tĩnh, phân tích sâu sắc dưới góc nhìn chủ nghĩa Khắc Kỷ và tâm lý học hành vi.';

      const textPrompt = `Người dùng gửi bằng chứng thực hiện kỷ luật hôm nay:
- Báo cáo/Lời tự bạch: "${caption || 'Không có mô tả'}"
- Tóm tắt thói quen hôm nay: "${habitsSummary || 'Đang theo dõi'}"
- Phong cách mong muốn: ${isStrict ? 'Kỷ Luật Thép' : 'Người Đồng Hành'}

Nhiệm vụ:
1. Đánh giá tính chân thực của bức ảnh/bằng chứng đính kèm (nếu có ảnh).
2. Nhận xét sắc sảo về mức độ kỷ luật và sự cam kết.
3. Đề xuất điều chỉnh điểm Kỷ Luật (scoreDelta: từ -10 đến +15 điểm).
4. Đưa ra 1 lời răn dạy/lời khuyên hành động dứt khoát (dưới 4 câu).

Trả về JSON đúng cấu trúc sau (không bọc codeblock):
{
  "verified": true,
  "scoreDelta": 5,
  "aiFeedback": "Nhận xét sâu sắc và chỉ dẫn dứt khoát...",
  "statusTag": "ĐẠT CHUẨN KỶ LUẬT"
}`;

      const contents: any[] = [];
      if (imageBase64) {
        // Strip data URL prefix if present
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        contents.push({
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        });
      }
      contents.push({ text: textPrompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: { parts: contents },
        config: {
          responseMimeType: 'application/json',
          systemInstruction,
        },
      });

      const text = response.text || '{}';
      try {
        const result = JSON.parse(text);
        res.json(result);
      } catch {
        res.json({
          verified: true,
          scoreDelta: 5,
          aiFeedback: text || 'Bằng chứng đã được ghi nhận vào Kho Hành Trình.',
          statusTag: 'ĐÃ XÁC THỰC',
        });
      }
    } catch (error: any) {
      console.error('Error in /api/gemini/coach-critique:', error);
      res.status(500).json({
        error: error?.message || 'Lỗi khi huấn luyện viên AI đánh giá',
        verified: true,
        scoreDelta: 5,
        aiFeedback: 'Bằng chứng đã được lưu cục bộ. Hãy tiếp tục giữ vững kỷ luật mỗi ngày!',
      });
    }
  });

  // API Route: Generate Strategy Rule ("💡 Tạo Chiến Lược")
  app.post('/api/gemini/generate-strategy', async (req: Request, res: Response): Promise<void> => {
    try {
      const { topic, customKey } = req.body;
      const ai = getGeminiClient(customKey);

      const prompt = `Hãy tạo một nguyên tắc kỷ luật bản thân và chiến lược hành động đanh thép, thực chiến cho chủ đề: "${topic || 'Kỷ luật tự giác và tập trung sâu'}".
Nguyên tắc phải súc tích, theo phong cách Chủ nghĩa Khắc kỷ (Stoicism) hoặc Atomic Habits, mang tính hành động cao trong 1-2 câu.

Trả về JSON:
{
  "content": "Nội dung nguyên tắc hành động...",
  "tag": "Tên nhãn phân loại (vd: Nguyên tắc vàng / Chống trì hoãn / Tập trung sâu)"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: 'Bạn là chuyên gia xây dựng kỷ luật thép của deepflower.',
        },
      });

      const text = response.text || '{}';
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error('Error generating strategy:', error);
      res.status(500).json({
        content: 'Kỷ luật không phải là sự giam cầm, mà là sự tự do tuyệt đối để đạt được điều bạn thực sự mong muốn.',
        tag: 'Kỷ luật cốt lõi',
      });
    }
  });

  // API Route: AI response to broken habits explanation
  app.post('/api/gemini/habit-explanation', async (req: Request, res: Response): Promise<void> => {
    try {
      const { habitName, reason, persona, customKey } = req.body;
      const ai = getGeminiClient(customKey);
      const isStrict = persona === 'strict';

      const prompt = `Người dùng giải trình việc không hoàn thành thói quen "${habitName}".
Lý do giải trình: "${reason}".
Hãy đưa ra phản hồi ${isStrict ? 'đanh thép, đập tan sự bao biện và chỉ ra cách khắc phục ngay lập tức' : 'thấu cảm, khuyên nhủ định hình lại thói quen'} (tối đa 3 câu).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction: isStrict ? 'Bạn là HLV Kỷ Luật Thép' : 'Bạn là Người Đồng Hành Tỉnh Thức',
        },
      });

      res.json({ message: response.text });
    } catch (error: any) {
      res.status(500).json({
        message: 'Lý do đã được ghi nhận. Không bao giờ được phép để lỡ 2 ngày liên tiếp!',
      });
    }
  });

  // Vite middleware in dev, express.static in prod
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[deepflower] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
