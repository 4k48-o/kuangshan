import express from 'express';
import cors from 'cors';
import { Prisma, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { format, subDays, subMonths, getDate, endOfMonth } from 'date-fns';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import svgCaptcha from 'svg-captcha';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cf-mineral-secret-change-in-production';

// Captcha store (svg-captcha 离线图形验证码): id -> { answer, expires }. One-time use, 5 min TTL.
const captchaStore = new Map<string, { answer: string; expires: number }>();
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function cleanupCaptcha(): void {
  const now = Date.now();
  for (const [id, data] of captchaStore.entries()) {
    if (data.expires < now) captchaStore.delete(id);
  }
}

app.use(cors());
app.use(express.json());

/** 修复上传文件名乱码：若按 Latin1 误解码了 UTF-8，则还原为正确中文 */
function fixFileNameEncoding(name: string): string {
  if (!name || typeof name !== 'string') return name;
  try {
    const asLatin1 = Buffer.from(name, 'latin1');
    const asUtf8 = asLatin1.toString('utf8');
    if (asUtf8 !== name && /[\u4e00-\u9fff]/.test(asUtf8)) return asUtf8;
  } catch (_) {}
  return name;
}

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') {
      cb(null, true);
    } else {
      cb(new Error('只支持 Excel 文件 (.xlsx, .xls, .xlsm)'));
    }
  }
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Auth middleware: require valid JWT for /api except /api/auth/login
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
    (req as any).user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
};

// Auth routes (no auth required)
app.get('/api/auth/captcha', (req, res) => {
  cleanupCaptcha();
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0oO1ilL',
    noise: 2,
    color: true,
  });
  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  captchaStore.set(id, { answer: captcha.text.toLowerCase(), expires: Date.now() + CAPTCHA_TTL_MS });
  res.json({ captchaId: id, svg: captcha.data });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, captchaId, captchaValue } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }
    if (!captchaId || captchaValue === undefined || captchaValue === '') {
      return res.status(400).json({ error: '请输入验证码' });
    }
    const stored = captchaStore.get(String(captchaId));
    if (!stored) {
      return res.status(400).json({ error: '验证码已过期，请刷新后重试' });
    }
    const userInput = String(captchaValue).trim().toLowerCase();
    if (userInput !== stored.answer) {
      captchaStore.delete(String(captchaId));
      return res.status(400).json({ error: '验证码错误' });
    }
    captchaStore.delete(String(captchaId));

    const user = await prisma.user.findUnique({ where: { username: String(username).trim() } });
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, username: user.username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '登录失败' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ ok: true });
});

// Protect all other /api routes
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/logout' || req.path === '/auth/captcha') return next();
  return authMiddleware(req, res, next);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create new daily report entry
app.post('/api/reports', async (req, res) => {
  try {
    const { shiftDate, shiftType, runTime, rawOre, concentrate, tailings } = req.body;

    // Check if report already exists
    const existing = await prisma.shiftData.findUnique({
      where: {
        shiftDate_shiftType: {
          shiftDate: new Date(shiftDate),
          shiftType,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: '该班次报表已存在' });
    }

    // Calculate dry weights
    const dryWeightRaw = rawOre.wetWeight * (1 - rawOre.moisture / 100);
    
    // Calculate Concentrate Dry Weight using Two-Product Formula based on Lead (Pb)
    // Formula: C = F * (f - t) / (c - t)
    // F: Raw Dry Weight
    // f: Raw Pb Grade
    // c: Conc Pb Grade
    // t: Tailings Pb Grade
    let dryWeightConcentrate = 0;
    
    // Fallback to manual input if available (for backward compatibility or if logic changes)
    if (concentrate.wetWeight && concentrate.wetWeight > 0) {
        dryWeightConcentrate = concentrate.wetWeight * (1 - (concentrate.moisture || 0) / 100);
    } 
    // Calculate using formula if tailings data is available
    else if (tailings && tailings.pbGrade !== undefined) {
        const F = dryWeightRaw;
        const f = rawOre.pbGrade;
        const c = concentrate.pbGrade;
        const t = tailings.pbGrade;
        
        if (c !== t && (c - t) !== 0) {
            dryWeightConcentrate = F * (f - t) / (c - t);
        }
    }
    
    // Calculate tailings dry weight
    let dryWeightTailings = 0;
    if (tailings && tailings.wetWeight && tailings.wetWeight > 0) {
        dryWeightTailings = tailings.wetWeight * (1 - (tailings.moisture || 0) / 100);
    } else {
        dryWeightTailings = dryWeightRaw - dryWeightConcentrate;
    }

    // Calculate metal content and recovery
    let pbRecovery = 0;
    let znRecovery = 0;
    let agRecovery = 0;

    // Helper for theoretical recovery
    const calcTheoreticalRecovery = (f: number, c: number, t: number) => {
        if (!f || f === 0 || (c - t) === 0) return 0;
        return (c * (f - t)) / (f * (c - t)) * 100;
    };

    // Helper for actual/weight-based recovery
    const calcWeightRecovery = (rawGrade: number, concGrade: number) => {
      if (!rawGrade || rawGrade === 0) return 0;
      const rawMetal = dryWeightRaw * rawGrade;
      const concMetal = dryWeightConcentrate * concGrade;
      return (concMetal / rawMetal) * 100;
    };

    if (tailings && tailings.pbGrade !== undefined) {
        // Use Theoretical Formula for Pb (since weight is derived from Pb)
        pbRecovery = calcTheoreticalRecovery(rawOre.pbGrade, concentrate.pbGrade, tailings.pbGrade);
        
        // For Zn and Ag, we MUST use the weight-based calculation because the weight is fixed by Pb balance.
        // Using theoretical formula for Zn/Ag would imply a different weight, which is physically impossible for the same concentrate stream.
        znRecovery = calcWeightRecovery(rawOre.znGrade, concentrate.znGrade);
        agRecovery = calcWeightRecovery(rawOre.agGrade, concentrate.agGrade);
    } else {
        // Fallback if no tailings data (manual weight input case)
        pbRecovery = calcWeightRecovery(rawOre.pbGrade, concentrate.pbGrade);
        znRecovery = calcWeightRecovery(rawOre.znGrade, concentrate.znGrade);
        agRecovery = calcWeightRecovery(rawOre.agGrade, concentrate.agGrade);
    }

    let concentrateYield = 0;
    if (tailings && tailings.pbGrade !== undefined) {
        // Use theoretical yield formula based on Pb grades
        // Y = (f - t) / (c - t) * 100
        const f = rawOre.pbGrade;
        const c = concentrate.pbGrade;
        const t = tailings.pbGrade;
        if ((c - t) !== 0) {
            concentrateYield = ((f - t) / (c - t)) * 100;
        }
    } else {
        // Fallback to weight ratio
        if (dryWeightRaw > 0) {
            concentrateYield = (dryWeightConcentrate / dryWeightRaw) * 100;
        }
    }

    // Transaction to create all records
    const result = await prisma.$transaction(async (tx) => {
      const shift = await tx.shiftData.create({
        data: {
          shiftDate: new Date(shiftDate),
          shiftType,
          runTime: Number(runTime),
          rawOreData: {
            create: {
              wetWeight: rawOre.wetWeight,
              moisture: rawOre.moisture,
              pbGrade: rawOre.pbGrade,
              znGrade: rawOre.znGrade,
              agGrade: rawOre.agGrade,
            },
          },
          concentrateData: {
            create: {
              wetWeight: concentrate.wetWeight || 0,
              moisture: concentrate.moisture || 0,
              pbGrade: concentrate.pbGrade,
              znGrade: concentrate.znGrade,
              agGrade: concentrate.agGrade,
            },
          },
          tailingsData: tailings ? {
            create: {
              wetWeight: tailings.wetWeight || 0,
              moisture: tailings.moisture || 0,
              fineness: tailings.fineness || 0,
              pbGrade: tailings.pbGrade,
              znGrade: tailings.znGrade,
              agGrade: tailings.agGrade,
            }
          } : undefined,
          metalBalance: {
            create: {
              dryWeightRaw,
              dryWeightConcentrate,
              dryWeightTailings,
              pbRecovery,
              znRecovery,
              agRecovery,
              concentrateYield,
            },
          },
        },
        include: {
          metalBalance: true,
        },
      });
      return shift;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// Delete a report by ID
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: '报告ID不能为空' });
    }

    // Check if report exists
    const existing = await prisma.shiftData.findUnique({
      where: { id },
      include: {
        rawOreData: true,
        concentrateData: true,
        tailingsData: true,
        metalBalance: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: '报告不存在' });
    }

    // Delete the shift data (cascade will delete related data automatically)
    await prisma.shiftData.delete({
      where: { id },
    });

    res.json({ success: true, message: '删除成功' });
  } catch (error: any) {
    console.error('Delete report error:', error);
    res.status(500).json({ error: '删除失败: ' + (error.message || '未知错误') });
  }
});

// Get reports with pagination and filters (time range, shift type)
app.get('/api/reports', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const shiftTypeRaw = req.query.shiftType as string | undefined;
    const shiftType = typeof shiftTypeRaw === 'string' ? shiftTypeRaw.trim() : undefined;

    const where: { shiftDate?: { gte?: Date; lte?: Date }; shiftType?: string } = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      where.shiftDate = { ...where.shiftDate, gte: start };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.shiftDate = { ...where.shiftDate, lte: end };
    }
    if (shiftType && shiftType.length > 0) {
      where.shiftType = shiftType;
    }

    const [reports, total] = await Promise.all([
      prisma.shiftData.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        skip,
        take: limit,
        orderBy: [
          { shiftDate: 'desc' },
          { id: 'desc' }
        ],
        include: {
          rawOreData: true,
          concentrateData: true,
          tailingsData: true,
          metalBalance: true,
        },
      }),
      prisma.shiftData.count({ where: Object.keys(where).length > 0 ? where : undefined })
    ]);

    res.json({
      data: reports,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Analysis Endpoints

// Get aggregated statistics
app.get('/api/analysis/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(end.getDate() - 30));
    
    const reports = await prisma.shiftData.findMany({
      where: {
        shiftDate: {
          gte: start,
          lte: end
        }
      },
      include: {
        metalBalance: true,
        rawOreData: true
      }
    });

    if (reports.length === 0) {
      return res.json({
        totalProcessed: 0,
        avgPbRecovery: 0,
        avgAgRecovery: 0,
        avgYield: 0,
        totalReports: 0
      });
    }

    const totalProcessed = reports.reduce((sum, r) => sum + Number(r.metalBalance?.dryWeightRaw || 0), 0);
    const avgPbRecovery = reports.reduce((sum, r) => sum + Number(r.metalBalance?.pbRecovery || 0), 0) / reports.length;
    const avgAgRecovery = reports.reduce((sum, r) => sum + Number(r.metalBalance?.agRecovery || 0), 0) / reports.length;
    const avgYield = reports.reduce((sum, r) => sum + Number(r.metalBalance?.concentrateYield || 0), 0) / reports.length;

    res.json({
      totalProcessed,
      avgPbRecovery,
      avgAgRecovery,
      avgYield,
      totalReports: reports.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch analysis stats' });
  }
});

// Get trend data for charts
app.get('/api/analysis/trends', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(end.getDate() - 30));
    
    const reports = await prisma.shiftData.findMany({
      where: {
        shiftDate: {
          gte: start,
          lte: end
        }
      },
      include: {
        metalBalance: true,
        rawOreData: true,
        concentrateData: true,
        tailingsData: true
      },
      orderBy: {
        shiftDate: 'asc'
      }
    });
    
    const dailyMap = new Map();
    
    reports.forEach(r => {
      const dateStr = r.shiftDate.toISOString().split('T')[0];
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, {
          date: dateStr,
          rawPb: 0, rawAg: 0,
          concPb: 0, concAg: 0,
          tailPb: 0, tailAg: 0,
          pbRecovery: 0, agRecovery: 0,
          processedWeight: 0,
          count: 0
        });
      }
      
      const d = dailyMap.get(dateStr);
      d.rawPb += Number(r.rawOreData?.pbGrade || 0);
      d.rawAg += Number(r.rawOreData?.agGrade || 0);
      d.concPb += Number(r.concentrateData?.pbGrade || 0);
      d.concAg += Number(r.concentrateData?.agGrade || 0);
      d.tailPb += Number(r.tailingsData?.pbGrade || 0);
      d.tailAg += Number(r.tailingsData?.agGrade || 0);
      d.pbRecovery += Number(r.metalBalance?.pbRecovery || 0);
      d.agRecovery += Number(r.metalBalance?.agRecovery || 0);
      d.processedWeight += Number(r.metalBalance?.dryWeightRaw || 0);
      d.count += 1;
    });
    
    const trends = Array.from(dailyMap.values()).map((d: any) => ({
      date: d.date,
      rawPb: Number((d.rawPb / d.count).toFixed(3)),
      rawAg: Number((d.rawAg / d.count).toFixed(3)),
      concPb: Number((d.concPb / d.count).toFixed(3)),
      concAg: Number((d.concAg / d.count).toFixed(3)),
      tailPb: Number((d.tailPb / d.count).toFixed(3)),
      tailAg: Number((d.tailAg / d.count).toFixed(3)),
      pbRecovery: Number((d.pbRecovery / d.count).toFixed(2)),
      agRecovery: Number((d.agRecovery / d.count).toFixed(2)),
      processedWeight: Number(d.processedWeight.toFixed(2))
    }));

    res.json(trends);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Get shift comparison stats
app.get('/api/analysis/shifts', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(end.getDate() - 30));
    
    const reports = await prisma.shiftData.findMany({
      where: {
        shiftDate: {
          gte: start,
          lte: end
        }
      },
      include: {
        metalBalance: true,
        rawOreData: true
      }
    });
    
    const shiftMap = new Map();
    
    reports.forEach(r => {
      const type = r.shiftType;
      if (!shiftMap.has(type)) {
        shiftMap.set(type, {
          shiftType: type,
          pbRecovery: 0, agRecovery: 0, yield: 0, processed: 0, count: 0
        });
      }
      const s = shiftMap.get(type);
      s.pbRecovery += Number(r.metalBalance?.pbRecovery || 0);
      s.agRecovery += Number(r.metalBalance?.agRecovery || 0);
      s.yield += Number(r.metalBalance?.concentrateYield || 0);
      s.processed += Number(r.metalBalance?.dryWeightRaw || 0);
      s.count += 1;
    });
    
    const stats = Array.from(shiftMap.values()).map((s: any) => ({
      shiftType: s.shiftType,
      pbRecovery: Number((s.pbRecovery / s.count).toFixed(2)),
      agRecovery: Number((s.agRecovery / s.count).toFixed(2)),
      yield: Number((s.yield / s.count).toFixed(2)),
      avgProcessed: Number((s.processed / s.count).toFixed(2)),
      totalProcessed: Number(s.processed.toFixed(2)),
      count: s.count
    }));
    
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch shift stats' });
  }
});

// ----- Metal Balance Analysis -----

async function fetchReportsInRange(start: Date, end: Date, shiftType?: string) {
  const where: { shiftDate: { gte: Date; lte: Date }; shiftType?: string } = {
    shiftDate: { gte: start, lte: end }
  };
  if (shiftType && shiftType.trim()) where.shiftType = shiftType.trim();
  return prisma.shiftData.findMany({
    where,
    include: {
      metalBalance: true,
      rawOreData: true,
      concentrateData: true,
      tailingsData: true
    },
    orderBy: { shiftDate: 'asc' }
  });
}

function getPeriodKey(d: Date, groupBy: string): string {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = getDate(d);
  if (groupBy === 'day') return format(d, 'yyyy-MM-dd');
  if (groupBy === 'tenDay') {
    const ten = day <= 10 ? '上旬' : day <= 20 ? '中旬' : '下旬';
    return `${y}-${String(m + 1).padStart(2, '0')}-${ten}`;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`; // month
}

// Metal balance summary (day / tenDay / month)
app.get('/api/analysis/metal-balance/summary', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day', shiftType } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : subDays(end, 30);
    const reports = await fetchReportsInRange(start, end, shiftType as string | undefined);
    if (reports.length === 0) return res.json([]);

    const periodMap = new Map<string, {
      period: string;
      dryWeightRaw: number;
      dryWeightConc: number;
      dryWeightTail: number;
      pbRecovery: number;
      agRecovery: number;
      znRecovery: number;
      yield: number;
      count: number;
      pbMetalRaw: number;
      pbMetalConc: number;
      agMetalRaw: number;
      agMetalConc: number;
      znMetalRaw: number;
      znMetalConc: number;
    }>();

    reports.forEach(r => {
      const key = getPeriodKey(r.shiftDate, String(groupBy));
      if (!periodMap.has(key)) {
        periodMap.set(key, {
          period: key,
          dryWeightRaw: 0, dryWeightConc: 0, dryWeightTail: 0,
          pbRecovery: 0, agRecovery: 0, znRecovery: 0, yield: 0, count: 0,
          pbMetalRaw: 0, pbMetalConc: 0, agMetalRaw: 0, agMetalConc: 0, znMetalRaw: 0, znMetalConc: 0
        });
      }
      const p = periodMap.get(key)!;
      const mb = r.metalBalance;
      const raw = r.rawOreData;
      const conc = r.concentrateData;
      const dryR = Number(mb?.dryWeightRaw || 0);
      const dryC = Number(mb?.dryWeightConcentrate || 0);
      const dryT = Number(mb?.dryWeightTailings || 0);
      p.dryWeightRaw += dryR;
      p.dryWeightConc += dryC;
      p.dryWeightTail += dryT;
      p.pbRecovery += Number(mb?.pbRecovery || 0);
      p.agRecovery += Number(mb?.agRecovery || 0);
      p.znRecovery += Number(mb?.znRecovery || 0);
      p.yield += Number(mb?.concentrateYield || 0);
      p.count += 1;
      p.pbMetalRaw += dryR * Number(raw?.pbGrade || 0) / 100;
      p.pbMetalConc += dryC * Number(conc?.pbGrade || 0) / 100;
      p.agMetalRaw += dryR * Number(raw?.agGrade || 0) / 1000;
      p.agMetalConc += dryC * Number(conc?.agGrade || 0) / 1000;
      p.znMetalRaw += dryR * Number(raw?.znGrade || 0) / 100;
      p.znMetalConc += dryC * Number(conc?.znGrade || 0) / 100;
    });

    const summary = Array.from(periodMap.values()).map(p => ({
      period: p.period,
      date: p.period,
      dryWeightRaw: Number(p.dryWeightRaw.toFixed(2)),
      dryWeightConcentrate: Number(p.dryWeightConc.toFixed(2)),
      dryWeightTailings: Number((p.dryWeightTail || 0).toFixed(2)),
      pbRecovery: p.count ? Number((p.pbRecovery / p.count).toFixed(2)) : 0,
      agRecovery: p.count ? Number((p.agRecovery / p.count).toFixed(2)) : 0,
      znRecovery: p.count ? Number((p.znRecovery / p.count).toFixed(2)) : 0,
      concentrateYield: p.count ? Number((p.yield / p.count).toFixed(2)) : 0,
      count: p.count,
      pbMetalRaw: Number(p.pbMetalRaw.toFixed(4)),
      pbMetalConc: Number(p.pbMetalConc.toFixed(4)),
      agMetalRaw: Number(p.agMetalRaw.toFixed(4)),
      agMetalConc: Number(p.agMetalConc.toFixed(4)),
      znMetalRaw: Number(p.znMetalRaw.toFixed(4)),
      znMetalConc: Number(p.znMetalConc.toFixed(4))
    }));
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch metal balance summary' });
  }
});

// Metal balance trends (same as analysis/trends but with znRecovery)
app.get('/api/analysis/metal-balance/trends', async (req, res) => {
  try {
    const { startDate, endDate, shiftType } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : subDays(end, 30);
    const reports = await fetchReportsInRange(start, end, shiftType as string | undefined);
    const dailyMap = new Map<string, { date: string; rawPb: number; rawAg: number; concPb: number; concAg: number; tailPb: number; tailAg: number; pbRecovery: number; agRecovery: number; znRecovery: number; processedWeight: number; count: number }>();
    reports.forEach(r => {
      const dateStr = r.shiftDate.toISOString().split('T')[0];
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, rawPb: 0, rawAg: 0, concPb: 0, concAg: 0, tailPb: 0, tailAg: 0, pbRecovery: 0, agRecovery: 0, znRecovery: 0, processedWeight: 0, count: 0 });
      }
      const d = dailyMap.get(dateStr)!;
      d.rawPb += Number(r.rawOreData?.pbGrade || 0);
      d.rawAg += Number(r.rawOreData?.agGrade || 0);
      d.concPb += Number(r.concentrateData?.pbGrade || 0);
      d.concAg += Number(r.concentrateData?.agGrade || 0);
      d.tailPb += Number(r.tailingsData?.pbGrade || 0);
      d.tailAg += Number(r.tailingsData?.agGrade || 0);
      d.pbRecovery += Number(r.metalBalance?.pbRecovery || 0);
      d.agRecovery += Number(r.metalBalance?.agRecovery || 0);
      d.znRecovery += Number(r.metalBalance?.znRecovery || 0);
      d.processedWeight += Number(r.metalBalance?.dryWeightRaw || 0);
      d.count += 1;
    });
    const trends = Array.from(dailyMap.values()).map(d => ({
      date: d.date,
      rawPb: Number((d.rawPb / d.count).toFixed(3)),
      rawAg: Number((d.rawAg / d.count).toFixed(3)),
      concPb: Number((d.concPb / d.count).toFixed(3)),
      concAg: Number((d.concAg / d.count).toFixed(3)),
      tailPb: Number((d.tailPb / d.count).toFixed(3)),
      tailAg: Number((d.tailAg / d.count).toFixed(3)),
      pbRecovery: Number((d.pbRecovery / d.count).toFixed(2)),
      agRecovery: Number((d.agRecovery / d.count).toFixed(2)),
      znRecovery: Number((d.znRecovery / d.count).toFixed(2)),
      processedWeight: Number(d.processedWeight.toFixed(2))
    }));
    res.json(trends);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch metal balance trends' });
  }
});

// Metal balance shift comparison (with znRecovery)
app.get('/api/analysis/metal-balance/shifts', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : subDays(end, 30);
    const reports = await fetchReportsInRange(start, end);
    const shiftMap = new Map<string, { shiftType: string; pbRecovery: number; agRecovery: number; znRecovery: number; yield: number; processed: number; count: number }>();
    reports.forEach(r => {
      const type = r.shiftType;
      if (!shiftMap.has(type)) {
        shiftMap.set(type, { shiftType: type, pbRecovery: 0, agRecovery: 0, znRecovery: 0, yield: 0, processed: 0, count: 0 });
      }
      const s = shiftMap.get(type)!;
      s.pbRecovery += Number(r.metalBalance?.pbRecovery || 0);
      s.agRecovery += Number(r.metalBalance?.agRecovery || 0);
      s.znRecovery += Number(r.metalBalance?.znRecovery || 0);
      s.yield += Number(r.metalBalance?.concentrateYield || 0);
      s.processed += Number(r.metalBalance?.dryWeightRaw || 0);
      s.count += 1;
    });
    const stats = Array.from(shiftMap.values()).map(s => ({
      shiftType: s.shiftType,
      pbRecovery: Number((s.pbRecovery / s.count).toFixed(2)),
      agRecovery: Number((s.agRecovery / s.count).toFixed(2)),
      znRecovery: Number((s.znRecovery / s.count).toFixed(2)),
      yield: Number((s.yield / s.count).toFixed(2)),
      avgProcessed: Number((s.processed / s.count).toFixed(2)),
      totalProcessed: Number(s.processed.toFixed(2)),
      count: s.count
    }));
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch metal balance shifts' });
  }
});

// Metal distribution (metal flow: raw -> conc / tail)
app.get('/api/analysis/metal-balance/distribution', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : subDays(end, 30);
    const reports = await fetchReportsInRange(start, end);
    if (reports.length === 0) return res.json([]);
    const periodMap = new Map<string, { period: string; pbRaw: number; pbConc: number; pbTail: number; agRaw: number; agConc: number; agTail: number; znRaw: number; znConc: number; znTail: number }>();
    reports.forEach(r => {
      const key = getPeriodKey(r.shiftDate, String(groupBy));
      if (!periodMap.has(key)) {
        periodMap.set(key, { period: key, pbRaw: 0, pbConc: 0, pbTail: 0, agRaw: 0, agConc: 0, agTail: 0, znRaw: 0, znConc: 0, znTail: 0 });
      }
      const p = periodMap.get(key)!;
      const mb = r.metalBalance;
      const raw = r.rawOreData;
      const conc = r.concentrateData;
      const tail = r.tailingsData;
      const dryR = Number(mb?.dryWeightRaw || 0);
      const dryC = Number(mb?.dryWeightConcentrate || 0);
      const dryT = Number(mb?.dryWeightTailings || 0);
      const pbR = dryR * Number(raw?.pbGrade || 0) / 100;
      const pbC = dryC * Number(conc?.pbGrade || 0) / 100;
      const agR = dryR * Number(raw?.agGrade || 0) / 1000;
      const agC = dryC * Number(conc?.agGrade || 0) / 1000;
      const znR = dryR * Number(raw?.znGrade || 0) / 100;
      const znC = dryC * Number(conc?.znGrade || 0) / 100;
      p.pbRaw += pbR; p.pbConc += pbC; p.pbTail += pbR - pbC;
      p.agRaw += agR; p.agConc += agC; p.agTail += agR - agC;
      p.znRaw += znR; p.znConc += znC; p.znTail += znR - znC;
    });
    const result = Array.from(periodMap.values()).map(p => {
      const pbDistConc = p.pbRaw > 0 ? Number((100 * p.pbConc / p.pbRaw).toFixed(2)) : 0;
      const pbDistTail = p.pbRaw > 0 ? Number((100 * (p.pbRaw - p.pbConc) / p.pbRaw).toFixed(2)) : 0;
      const agDistConc = p.agRaw > 0 ? Number((100 * p.agConc / p.agRaw).toFixed(2)) : 0;
      const agDistTail = p.agRaw > 0 ? Number((100 * (p.agRaw - p.agConc) / p.agRaw).toFixed(2)) : 0;
      const znDistConc = p.znRaw > 0 ? Number((100 * p.znConc / p.znRaw).toFixed(2)) : 0;
      const znDistTail = p.znRaw > 0 ? Number((100 * (p.znRaw - p.znConc) / p.znRaw).toFixed(2)) : 0;
      return {
        period: p.period,
        pb: { raw: Number(p.pbRaw.toFixed(4)), conc: Number(p.pbConc.toFixed(4)), tail: Number((p.pbRaw - p.pbConc).toFixed(4)), distConcPct: pbDistConc, distTailPct: pbDistTail },
        ag: { raw: Number(p.agRaw.toFixed(4)), conc: Number(p.agConc.toFixed(4)), tail: Number((p.agRaw - p.agConc).toFixed(4)), distConcPct: agDistConc, distTailPct: agDistTail },
        zn: { raw: Number(p.znRaw.toFixed(4)), conc: Number(p.znConc.toFixed(4)), tail: Number((p.znRaw - p.znConc).toFixed(4)), distConcPct: znDistConc, distTailPct: znDistTail }
      };
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch metal distribution' });
  }
});

// Stability: std dev and pass rate for recovery
app.get('/api/analysis/metal-balance/stability', async (req, res) => {
  try {
    const { startDate, endDate, targetPb = 92, targetAg = 90 } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : subDays(end, 30);
    const reports = await fetchReportsInRange(start, end);
    if (reports.length === 0) {
      return res.json({ stdDevPb: 0, stdDevAg: 0, stdDevZn: 0, passRatePb: 0, passRateAg: 0, passRateZn: 0, dailyStats: [] });
    }
    const pbList = reports.map(r => Number(r.metalBalance?.pbRecovery || 0));
    const agList = reports.map(r => Number(r.metalBalance?.agRecovery || 0));
    const znList = reports.map(r => Number(r.metalBalance?.znRecovery || 0));
    const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const variance = (arr: number[], m: number) => arr.length ? arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length : 0;
    const std = (v: number) => Math.sqrt(v);
    const tPb = Number(targetPb) || 92;
    const tAg = Number(targetAg) || 90;
    const tZn = 50;
    const dailyMap = new Map<string, { pb: number[]; ag: number[]; zn: number[] }>();
    reports.forEach(r => {
      const d = r.shiftDate.toISOString().split('T')[0];
      if (!dailyMap.has(d)) dailyMap.set(d, { pb: [], ag: [], zn: [] });
      const row = dailyMap.get(d)!;
      row.pb.push(Number(r.metalBalance?.pbRecovery || 0));
      row.ag.push(Number(r.metalBalance?.agRecovery || 0));
      row.zn.push(Number(r.metalBalance?.znRecovery || 0));
    });
    const dailyStats = Array.from(dailyMap.entries()).map(([date, row]) => {
      const pbAvg = mean(row.pb);
      const agAvg = mean(row.ag);
      const znAvg = mean(row.zn);
      return { date, pbRecovery: Number(pbAvg.toFixed(2)), agRecovery: Number(agAvg.toFixed(2)), znRecovery: Number(znAvg.toFixed(2)), passPb: pbAvg >= tPb, passAg: agAvg >= tAg, passZn: znAvg >= tZn };
    });
    res.json({
      stdDevPb: Number(std(variance(pbList, mean(pbList))).toFixed(2)),
      stdDevAg: Number(std(variance(agList, mean(agList))).toFixed(2)),
      stdDevZn: Number(std(variance(znList, mean(znList))).toFixed(2)),
      passRatePb: Number((100 * pbList.filter(x => x >= tPb).length / pbList.length).toFixed(1)),
      passRateAg: Number((100 * agList.filter(x => x >= tAg).length / agList.length).toFixed(1)),
      passRateZn: Number((100 * znList.filter(x => x >= tZn).length / znList.length).toFixed(1)),
      dailyStats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stability' });
  }
});

// Period compare (current vs previous period)
app.get('/api/analysis/metal-balance/period-compare', async (req, res) => {
  try {
    const { baseDate, period = 'month', compareType = 'month_over_month' } = req.query;
    const base = baseDate ? new Date(String(baseDate)) : new Date();
    const periodVal = String(period);
    const compare = String(compareType);
    let currentStart: Date; let currentEnd: Date; let previousStart: Date; let previousEnd: Date;
    if (periodVal === 'month') {
      currentStart = new Date(base.getFullYear(), base.getMonth(), 1);
      currentEnd = endOfMonth(base);
      if (compare === 'year_over_year') {
        previousStart = new Date(base.getFullYear() - 1, base.getMonth(), 1);
        previousEnd = endOfMonth(previousStart);
      } else {
        previousStart = subMonths(currentStart, 1);
        previousEnd = endOfMonth(previousStart);
      }
    } else {
      currentStart = new Date(base.getFullYear(), 0, 1);
      currentEnd = new Date(base.getFullYear(), 11, 31, 23, 59, 59, 999);
      previousStart = new Date(base.getFullYear() - 1, 0, 1);
      previousEnd = new Date(base.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    }
    const [currReports, prevReports] = await Promise.all([
      fetchReportsInRange(currentStart, currentEnd),
      fetchReportsInRange(previousStart, previousEnd)
    ]);
    const toSummary = (reports: any[]) => {
      if (reports.length === 0) return { totalProcessed: 0, avgPbRecovery: 0, avgAgRecovery: 0, avgZnRecovery: 0, avgYield: 0, count: 0 };
      const totalProcessed = reports.reduce((s, r) => s + Number(r.metalBalance?.dryWeightRaw || 0), 0);
      const avgPb = reports.reduce((s, r) => s + Number(r.metalBalance?.pbRecovery || 0), 0) / reports.length;
      const avgAg = reports.reduce((s, r) => s + Number(r.metalBalance?.agRecovery || 0), 0) / reports.length;
      const avgZn = reports.reduce((s, r) => s + Number(r.metalBalance?.znRecovery || 0), 0) / reports.length;
      const avgYield = reports.reduce((s, r) => s + Number(r.metalBalance?.concentrateYield || 0), 0) / reports.length;
      return { totalProcessed, avgPbRecovery: avgPb, avgAgRecovery: avgAg, avgZnRecovery: avgZn, avgYield, count: reports.length };
    };
    const current = toSummary(currReports);
    const previous = toSummary(prevReports);
    res.json({
      current: { ...current, avgPbRecovery: Number(current.avgPbRecovery.toFixed(2)), avgAgRecovery: Number(current.avgAgRecovery.toFixed(2)), avgZnRecovery: Number(current.avgZnRecovery.toFixed(2)), avgYield: Number(current.avgYield.toFixed(2)) },
      previous: { ...previous, avgPbRecovery: Number(previous.avgPbRecovery.toFixed(2)), avgAgRecovery: Number(previous.avgAgRecovery.toFixed(2)), avgZnRecovery: Number(previous.avgZnRecovery.toFixed(2)), avgYield: Number(previous.avgYield.toFixed(2)) },
      changes: {
        totalProcessedDelta: Number((current.totalProcessed - previous.totalProcessed).toFixed(2)),
        totalProcessedPct: previous.totalProcessed ? Number((100 * (current.totalProcessed - previous.totalProcessed) / previous.totalProcessed).toFixed(1)) : 0,
        avgPbRecoveryDelta: Number((current.avgPbRecovery - previous.avgPbRecovery).toFixed(2)),
        avgAgRecoveryDelta: Number((current.avgAgRecovery - previous.avgAgRecovery).toFixed(2)),
        avgZnRecoveryDelta: Number((current.avgZnRecovery - previous.avgZnRecovery).toFixed(2)),
        avgYieldDelta: Number((current.avgYield - previous.avgYield).toFixed(2))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch period compare' });
  }
});

// Metal balance export (CSV)
app.get('/api/analysis/metal-balance/export', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const end = endDate ? new Date(String(endDate)) : new Date();
    const start = startDate ? new Date(String(startDate)) : subDays(end, 30);
    const reports = await fetchReportsInRange(start, end);
    if (reports.length === 0) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="metal_balance_summary.csv"');
      return res.send('\uFEFF周期,原矿干量(吨),精矿干量(吨),尾矿干量(吨),铅回收率(%),银回收率(%),锌回收率(%),产率(%)\n');
    }
    const periodMap = new Map<string, any>();
    reports.forEach(r => {
      const key = getPeriodKey(r.shiftDate, String(groupBy));
      if (!periodMap.has(key)) {
        periodMap.set(key, { period: key, dryRaw: 0, dryConc: 0, dryTail: 0, pb: 0, ag: 0, zn: 0, yield: 0, count: 0 });
      }
      const p = periodMap.get(key)!;
      p.dryRaw += Number(r.metalBalance?.dryWeightRaw || 0);
      p.dryConc += Number(r.metalBalance?.dryWeightConcentrate || 0);
      p.dryTail += Number(r.metalBalance?.dryWeightTailings || 0);
      p.pb += Number(r.metalBalance?.pbRecovery || 0);
      p.ag += Number(r.metalBalance?.agRecovery || 0);
      p.zn += Number(r.metalBalance?.znRecovery || 0);
      p.yield += Number(r.metalBalance?.concentrateYield || 0);
      p.count += 1;
    });
    const rows = Array.from(periodMap.values()).map(p => ({
      period: p.period,
      dryRaw: p.dryRaw.toFixed(2),
      dryConc: p.dryConc.toFixed(2),
      dryTail: (p.dryTail || 0).toFixed(2),
      pb: (p.pb / p.count).toFixed(2),
      ag: (p.ag / p.count).toFixed(2),
      zn: (p.zn / p.count).toFixed(2),
      yield: (p.yield / p.count).toFixed(2)
    }));
    const header = '周期,原矿干量(吨),精矿干量(吨),尾矿干量(吨),铅回收率(%),银回收率(%),锌回收率(%),产率(%)\n';
    const body = rows.map(r => `${r.period},${r.dryRaw},${r.dryConc},${r.dryTail},${r.pb},${r.ag},${r.zn},${r.yield}`).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="metal_balance_${format(start, 'yyyyMMdd')}_${format(end, 'yyyyMMdd')}.csv"`);
    res.send('\uFEFF' + header + body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export metal balance' });
  }
});

// Get daily aggregated stats for report
app.get('/api/reports/daily-stats', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const targetDate = new Date(String(date));
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const startOfYear = new Date(targetDate.getFullYear(), 0, 1);
    
    // Set time boundaries
    const dayStart = new Date(targetDate); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(targetDate); dayEnd.setHours(23,59,59,999);
    
    const [dayReports, monthReports, yearReports] = await Promise.all([
      prisma.shiftData.findMany({
        where: { shiftDate: { gte: dayStart, lte: dayEnd } },
        include: { rawOreData: true, concentrateData: true, tailingsData: true, metalBalance: true }
      }),
      prisma.shiftData.findMany({
        where: { shiftDate: { gte: startOfMonth, lte: dayEnd } },
        include: { rawOreData: true, concentrateData: true, tailingsData: true, metalBalance: true }
      }),
      prisma.shiftData.findMany({
        where: { shiftDate: { gte: startOfYear, lte: dayEnd } },
        include: { rawOreData: true, concentrateData: true, tailingsData: true, metalBalance: true }
      })
    ]);

    const calculateTotals = (reports: any[]) => {
        const stats = {
            raw: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
            conc: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
            tail: { dry: 0, pbMetal: 0, agMetal: 0, pbGrade: 0, agGrade: 0 }
        };
        let concMoistureWeightedSum = 0; // 铅精矿水分：按干量加权的用户录入值
        
        reports.forEach(r => {
            const mb = r.metalBalance;
            const raw = r.rawOreData;
            const conc = r.concentrateData;
            
            // Raw
            stats.raw.wet += Number(raw?.wetWeight || 0);
            stats.raw.dry += Number(mb?.dryWeightRaw || 0);
            
            // Metal = Dry * Grade
            const rawPbM = Number(mb?.dryWeightRaw || 0) * Number(raw?.pbGrade || 0) / 100;
            const rawAgM = Number(mb?.dryWeightRaw || 0) * Number(raw?.agGrade || 0) / 1000;
            stats.raw.pbMetal += rawPbM;
            stats.raw.agMetal += rawAgM;
            
            // Conc
            stats.conc.wet += Number(conc?.wetWeight || 0);
            const dryConc = Number(mb?.dryWeightConcentrate || 0);
            stats.conc.dry += dryConc;
            // 铅精矿水分：直接采用用户录入值，多班次按干量加权
            const userMoisture = Number(conc?.moisture ?? 0);
            concMoistureWeightedSum += userMoisture * dryConc;
            
            const concPbM = dryConc * Number(conc?.pbGrade || 0) / 100;
            const concAgM = dryConc * Number(conc?.agGrade || 0) / 1000;
            stats.conc.pbMetal += concPbM;
            stats.conc.agMetal += concAgM;
        });
        
        // Balance Calculation for Tailings
        stats.tail.dry = stats.raw.dry - stats.conc.dry;
        stats.tail.pbMetal = stats.raw.pbMetal - stats.conc.pbMetal;
        stats.tail.agMetal = stats.raw.agMetal - stats.conc.agMetal;
        
        // Weighted Averages
        if (stats.raw.wet > 0) stats.raw.moisture = (stats.raw.wet - stats.raw.dry) / stats.raw.wet * 100;
        if (stats.raw.dry > 0) {
            stats.raw.pbGrade = stats.raw.pbMetal / stats.raw.dry * 100;
            stats.raw.agGrade = stats.raw.agMetal / stats.raw.dry * 1000;
        }
        
        // 铅精矿水分：从用户录入获取，多班次为按干量加权平均（不再用湿干量反算）
        if (stats.conc.dry > 0) {
            stats.conc.moisture = concMoistureWeightedSum / stats.conc.dry;
        }
        if (stats.conc.dry > 0) {
            stats.conc.pbGrade = stats.conc.pbMetal / stats.conc.dry * 100;
            stats.conc.agGrade = stats.conc.agMetal / stats.conc.dry * 1000;
        }
        
        if (stats.tail.dry > 0) {
            stats.tail.pbGrade = stats.tail.pbMetal / stats.tail.dry * 100;
            stats.tail.agGrade = stats.tail.agMetal / stats.tail.dry * 1000;
        }
        
        return stats;
    };

    res.json({
        day: calculateTotals(dayReports),
        month: calculateTotals(monthReports),
        year: calculateTotals(yearReports)
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
});

// Get monthly aggregated stats for report
app.get('/api/reports/monthly-stats', async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Year and month are required' });

    const targetYear = Number(year);
    const targetMonth = Number(month); // 1-12，选择月

    // 月报统计周期：选择月的上月26日 00:00:00 ～ 选择月的25日 23:59:59
    const startDate = new Date(targetYear, targetMonth - 2, 26);
    const endDate = new Date(targetYear, targetMonth - 1, 25, 23, 59, 59, 999);

    const reports = await prisma.shiftData.findMany({
      where: {
        shiftDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: { rawOreData: true, concentrateData: true, tailingsData: true, metalBalance: true },
      orderBy: { shiftDate: 'asc' }
    });

    // Helper to calculate totals for a set of reports
    const calculateTotals = (reports: any[]) => {
        const stats = {
            raw: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
            conc: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
            tail: { dry: 0, pbMetal: 0, agMetal: 0, pbGrade: 0, agGrade: 0 }
        };
        let concMoistureWeightedSum = 0;
        
        reports.forEach(r => {
            const mb = r.metalBalance;
            const raw = r.rawOreData;
            const conc = r.concentrateData;
            
            // Raw
            stats.raw.wet += Number(raw?.wetWeight || 0);
            stats.raw.dry += Number(mb?.dryWeightRaw || 0);
            
            // Metal = Dry * Grade
            const rawPbM = Number(mb?.dryWeightRaw || 0) * Number(raw?.pbGrade || 0) / 100;
            const rawAgM = Number(mb?.dryWeightRaw || 0) * Number(raw?.agGrade || 0) / 1000;
            stats.raw.pbMetal += rawPbM;
            stats.raw.agMetal += rawAgM;
            
            // Conc
            stats.conc.wet += Number(conc?.wetWeight || 0);
            const dryConc = Number(mb?.dryWeightConcentrate || 0);
            stats.conc.dry += dryConc;
            const userMoisture = Number(conc?.moisture ?? 0);
            concMoistureWeightedSum += userMoisture * dryConc;
            
            const concPbM = dryConc * Number(conc?.pbGrade || 0) / 100;
            const concAgM = dryConc * Number(conc?.agGrade || 0) / 1000;
            stats.conc.pbMetal += concPbM;
            stats.conc.agMetal += concAgM;
        });
        
        // Balance Calculation for Tailings
        stats.tail.dry = stats.raw.dry - stats.conc.dry;
        stats.tail.pbMetal = stats.raw.pbMetal - stats.conc.pbMetal;
        stats.tail.agMetal = stats.raw.agMetal - stats.conc.agMetal;
        
        // Weighted Averages
        if (stats.raw.wet > 0) stats.raw.moisture = (stats.raw.wet - stats.raw.dry) / stats.raw.wet * 100;
        if (stats.raw.dry > 0) {
            stats.raw.pbGrade = stats.raw.pbMetal / stats.raw.dry * 100;
            stats.raw.agGrade = stats.raw.agMetal / stats.raw.dry * 1000;
        }
        
        if (stats.conc.dry > 0) {
            stats.conc.moisture = concMoistureWeightedSum / stats.conc.dry;
            stats.conc.pbGrade = stats.conc.pbMetal / stats.conc.dry * 100;
            stats.conc.agGrade = stats.conc.agMetal / stats.conc.dry * 1000;
        }
        
        if (stats.tail.dry > 0) {
            stats.tail.pbGrade = stats.tail.pbMetal / stats.tail.dry * 100;
            stats.tail.agGrade = stats.tail.agMetal / stats.tail.dry * 1000;
        }
        
        return stats;
    };

    // Group by day
    const dailyMap = new Map();
    reports.forEach(r => {
        const dateStr = r.shiftDate.toISOString().split('T')[0];
        if (!dailyMap.has(dateStr)) {
            dailyMap.set(dateStr, []);
        }
        dailyMap.get(dateStr).push(r);
    });

    const dailyStats = Array.from(dailyMap.entries()).map(([date, rs]) => ({
        date,
        data: calculateTotals(rs)
    })).sort((a, b) => a.date.localeCompare(b.date));

    const totalStats = calculateTotals(reports);

    res.json({
        daily: dailyStats,
        total: totalStats
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

// Get yearly aggregated stats for report (each row = one month, same period rule: 上月26～当月25)
app.get('/api/reports/yearly-stats', async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'Year is required' });

    const targetYear = Number(year);

    const calculateTotals = (reports: any[]) => {
      const stats = {
        raw: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
        conc: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
        tail: { dry: 0, pbMetal: 0, agMetal: 0, pbGrade: 0, agGrade: 0 }
      };
      let concMoistureWeightedSum = 0;
      reports.forEach(r => {
        const mb = r.metalBalance;
        const raw = r.rawOreData;
        const conc = r.concentrateData;
        stats.raw.wet += Number(raw?.wetWeight || 0);
        stats.raw.dry += Number(mb?.dryWeightRaw || 0);
        const rawPbM = Number(mb?.dryWeightRaw || 0) * Number(raw?.pbGrade || 0) / 100;
        const rawAgM = Number(mb?.dryWeightRaw || 0) * Number(raw?.agGrade || 0) / 1000;
        stats.raw.pbMetal += rawPbM;
        stats.raw.agMetal += rawAgM;
        stats.conc.wet += Number(conc?.wetWeight || 0);
        const dryConc = Number(mb?.dryWeightConcentrate || 0);
        stats.conc.dry += dryConc;
        concMoistureWeightedSum += Number(conc?.moisture ?? 0) * dryConc;
        stats.conc.pbMetal += dryConc * Number(conc?.pbGrade || 0) / 100;
        stats.conc.agMetal += dryConc * Number(conc?.agGrade || 0) / 1000;
      });
      stats.tail.dry = stats.raw.dry - stats.conc.dry;
      stats.tail.pbMetal = stats.raw.pbMetal - stats.conc.pbMetal;
      stats.tail.agMetal = stats.raw.agMetal - stats.conc.agMetal;
      if (stats.raw.wet > 0) stats.raw.moisture = (stats.raw.wet - stats.raw.dry) / stats.raw.wet * 100;
      if (stats.raw.dry > 0) {
        stats.raw.pbGrade = stats.raw.pbMetal / stats.raw.dry * 100;
        stats.raw.agGrade = stats.raw.agMetal / stats.raw.dry * 1000;
      }
      if (stats.conc.dry > 0) {
        stats.conc.moisture = concMoistureWeightedSum / stats.conc.dry;
        stats.conc.pbGrade = stats.conc.pbMetal / stats.conc.dry * 100;
        stats.conc.agGrade = stats.conc.agMetal / stats.conc.dry * 1000;
      }
      if (stats.tail.dry > 0) {
        stats.tail.pbGrade = stats.tail.pbMetal / stats.tail.dry * 100;
        stats.tail.agGrade = stats.tail.agMetal / stats.tail.dry * 1000;
      }
      return stats;
    };

    const monthly: { month: number; monthLabel: string; data: ReturnType<typeof calculateTotals> }[] = [];
    const totalAcc = {
      raw: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
      conc: { wet: 0, dry: 0, pbMetal: 0, agMetal: 0, moisture: 0, pbGrade: 0, agGrade: 0 },
      tail: { dry: 0, pbMetal: 0, agMetal: 0, pbGrade: 0, agGrade: 0 }
    };

    for (let m = 1; m <= 12; m++) {
      const startDate = new Date(targetYear, m - 2, 26);
      const endDate = new Date(targetYear, m - 1, 25, 23, 59, 59, 999);
      const reports = await prisma.shiftData.findMany({
        where: { shiftDate: { gte: startDate, lte: endDate } },
        include: { rawOreData: true, concentrateData: true, tailingsData: true, metalBalance: true },
        orderBy: { shiftDate: 'asc' }
      });
      const data = calculateTotals(reports);
      monthly.push({ month: m, monthLabel: `${m}月`, data });
      totalAcc.raw.wet += data.raw.wet;
      totalAcc.raw.dry += data.raw.dry;
      totalAcc.raw.pbMetal += data.raw.pbMetal;
      totalAcc.raw.agMetal += data.raw.agMetal;
      totalAcc.conc.wet += data.conc.wet;
      totalAcc.conc.dry += data.conc.dry;
      totalAcc.conc.pbMetal += data.conc.pbMetal;
      totalAcc.conc.agMetal += data.conc.agMetal;
      totalAcc.tail.dry += data.tail.dry;
      totalAcc.tail.pbMetal += data.tail.pbMetal;
      totalAcc.tail.agMetal += data.tail.agMetal;
    }

    if (totalAcc.raw.wet > 0) totalAcc.raw.moisture = (totalAcc.raw.wet - totalAcc.raw.dry) / totalAcc.raw.wet * 100;
    if (totalAcc.raw.dry > 0) {
      totalAcc.raw.pbGrade = totalAcc.raw.pbMetal / totalAcc.raw.dry * 100;
      totalAcc.raw.agGrade = totalAcc.raw.agMetal / totalAcc.raw.dry * 1000;
    }
    if (totalAcc.conc.dry > 0) {
      let concMoistureSum = 0;
      monthly.forEach(({ data }) => { concMoistureSum += data.conc.moisture * data.conc.dry; });
      totalAcc.conc.moisture = concMoistureSum / totalAcc.conc.dry;
      totalAcc.conc.pbGrade = totalAcc.conc.pbMetal / totalAcc.conc.dry * 100;
      totalAcc.conc.agGrade = totalAcc.conc.agMetal / totalAcc.conc.dry * 1000;
    }
    if (totalAcc.tail.dry > 0) {
      totalAcc.tail.pbGrade = totalAcc.tail.pbMetal / totalAcc.tail.dry * 100;
      totalAcc.tail.agGrade = totalAcc.tail.agMetal / totalAcc.tail.dry * 1000;
    }

    res.json({
      monthly,
      total: totalAcc
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch yearly stats' });
  }
});

// ----- 原矿入库称重记录（Excel 上传 + 历史查询） -----

// 从 Excel 二维数组中解析称重表：查找表头行（车号、上传时间、毛重、皮重、净重），返回 { headerRowIndex, colIndex: { vehicleNo, weighTime, gross, tare, net } }
function findWeighingHeader(data: any[][]): { headerRowIndex: number; cols: { vehicleNo: number; weighTime: number; gross: number; tare: number; net: number } } | null {
  const keywords = { vehicleNo: ['车号'], weighTime: ['上传时间', '称重时间', '时间'], gross: ['毛重'], tare: ['皮重'], net: ['净重'] };
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const row = data[r] || [];
    const vehicleNoCol = row.findIndex((c: any) => keywords.vehicleNo.some(k => String(c || '').trim().includes(k)));
    const weighTimeCol = row.findIndex((c: any) => keywords.weighTime.some(k => String(c || '').trim().includes(k)));
    const grossCol = row.findIndex((c: any) => keywords.gross.some(k => String(c || '').trim().includes(k)));
    const tareCol = row.findIndex((c: any) => keywords.tare.some(k => String(c || '').trim().includes(k)));
    const netCol = row.findIndex((c: any) => keywords.net.some(k => String(c || '').trim().includes(k)));
    if (vehicleNoCol >= 0 && grossCol >= 0 && tareCol >= 0 && netCol >= 0) {
      return {
        headerRowIndex: r,
        cols: { vehicleNo: vehicleNoCol, weighTime: weighTimeCol >= 0 ? weighTimeCol : grossCol, gross: grossCol, tare: tareCol, net: netCol }
      };
    }
  }
  return null;
}

function parseWeighTime(val: any): Date | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    // Excel 序列日期
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0);
  }
  const s = String(val).trim();
  if (!s) return null;
  const iso = s.replace(/\s+/g, 'T').replace(/[年月日]/g, '-').replace(/日$/, '');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// 上传称重 Excel，批量入库
app.post('/api/weighing/upload', upload.single('file'), async (req, res) => {
  let filePath: string | undefined;
  try {
    if (!req.file) return res.status(400).json({ error: '请选择要上传的 Excel 文件' });
    filePath = req.file.path;
    const fileName = fixFileNameEncoding(req.file.originalname || '') || 'unknown.xls';
    if (!fs.existsSync(filePath)) return res.status(400).json({ error: '上传的文件不存在' });

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(filePath);
    } catch (err: any) {
      return res.status(400).json({ error: `无法读取 Excel: ${err.message || '格式错误'}` });
    }
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
    if (!data || data.length < 2) {
      return res.status(400).json({ error: 'Excel 数据行数不足或格式不正确' });
    }

    const headerInfo = findWeighingHeader(data);
    if (!headerInfo) {
      return res.status(400).json({ error: '未找到表头（需包含：车号、毛重、皮重、净重）' });
    }

    const { headerRowIndex, cols } = headerInfo;
    // 用本表第一行有效“上传时间”作为缺省日期，避免空时间被填成“今天”导致错误日期
    let fileDefaultDate: Date | null = null;
    for (let r = headerRowIndex + 1; r < data.length; r++) {
      const row = data[r] || [];
      const t = parseWeighTime(row[cols.weighTime]);
      if (t) {
        fileDefaultDate = t;
        break;
      }
    }

    const records: { vehicleNo: string; weighTime: Date; grossWeight: number; tareWeight: number; netWeight: number; recordDate: Date }[] = [];

    for (let r = headerRowIndex + 1; r < data.length; r++) {
      const row = data[r] || [];
      const vehicleNo = String(row[cols.vehicleNo] ?? '').trim();
      const grossVal = Number(row[cols.gross]);
      const tareVal = Number(row[cols.tare]);
      const netVal = Number(row[cols.net]);
      if (!vehicleNo || (isNaN(grossVal) && isNaN(netVal))) continue;
      const grossWeight = !isNaN(grossVal) ? grossVal : netVal + (isNaN(tareVal) ? 0 : tareVal);
      const tareWeight = !isNaN(tareVal) ? tareVal : grossWeight - (!isNaN(netVal) ? netVal : 0);
      const netWeight = !isNaN(netVal) ? netVal : grossWeight - tareWeight;
      let weighTime = parseWeighTime(row[cols.weighTime]);
      if (!weighTime) {
        if (!fileDefaultDate) continue; // 无时间且全表无有效时间则跳过该行
        weighTime = fileDefaultDate;
      }
      const y = weighTime.getFullYear(), m = weighTime.getMonth(), d = weighTime.getDate();
      const recordDate = new Date(Date.UTC(y, m, d, 12, 0, 0));
      records.push({
        vehicleNo: vehicleNo || '未知',
        weighTime,
        grossWeight,
        tareWeight,
        netWeight,
        recordDate
      });
    }

    if (records.length === 0) {
      return res.status(400).json({ error: '未解析到有效称重记录，请检查表格数据' });
    }

    // 去重：若本次要写入的日期在库中已有称重记录，则拒绝整次上传
    const dateKeys = [...new Set(records.map(r => r.recordDate.toISOString().slice(0, 10)))];
    const existingDates: string[] = [];
    for (const key of dateKeys) {
      const [y, m, day] = key.split('-').map(Number);
      const dStart = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
      const dEnd = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
      const count = await prisma.rawOreWeighingRecord.count({
        where: { recordDate: { gte: dStart, lte: dEnd } }
      });
      if (count > 0) existingDates.push(key);
    }
    if (existingDates.length > 0) {
      const tip = existingDates.sort().join('、');
      return res.status(400).json({
        error: `以下日期已存在称重数据，请勿重复上传：${tip}`,
        existingDates
      });
    }

    await prisma.rawOreWeighingRecord.createMany({
      data: records.map(rec => ({
        vehicleNo: rec.vehicleNo,
        weighTime: rec.weighTime,
        grossWeight: rec.grossWeight,
        tareWeight: rec.tareWeight,
        netWeight: rec.netWeight,
        recordDate: rec.recordDate,
        sourceFile: fileName
      }))
    });

    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    res.json({ success: true, count: records.length, message: `成功导入 ${records.length} 条称重记录` });
  } catch (error: any) {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
    console.error('Weighing upload error:', error);
    res.status(500).json({ error: error.message || '上传处理失败' });
  }
});

// 称重记录历史查询
app.get('/api/weighing/records', async (req, res) => {
  try {
    const { date, startDate, endDate, vehicleNo, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.RawOreWeighingRecordWhereInput = {};
    if (date) {
      const [y, m, day] = String(date).split('-').map(Number);
      const dStart = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
      const dEnd = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
      where.recordDate = { gte: dStart, lte: dEnd };
    } else if (startDate || endDate) {
      const dateRange: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        const [y, m, day] = String(startDate).split('-').map(Number);
        dateRange.gte = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
      }
      if (endDate) {
        const [y, m, day] = String(endDate).split('-').map(Number);
        dateRange.lte = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
      }
      where.recordDate = dateRange;
    }
    const vn = String(vehicleNo || '').trim();
    if (vn) where.vehicleNo = { contains: vn };

    const [list, total] = await Promise.all([
      prisma.rawOreWeighingRecord.findMany({
        where: Object.keys(where).length ? where : undefined,
        orderBy: [{ recordDate: 'desc' }, { weighTime: 'desc' }],
        skip,
        take: limitNum
      }),
      prisma.rawOreWeighingRecord.count({ where: Object.keys(where).length ? where : undefined })
    ]);

    res.json({
      data: list.map(r => ({
        id: r.id,
        vehicleNo: r.vehicleNo,
        weighTime: r.weighTime,
        grossWeight: Number(r.grossWeight),
        tareWeight: Number(r.tareWeight),
        netWeight: Number(r.netWeight),
        recordDate: r.recordDate,
        sourceFile: r.sourceFile,
        createdAt: r.createdAt
      })),
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '查询称重记录失败' });
  }
});

// 称重按日汇总（用于历史页汇总表），支持分页
app.get('/api/weighing/records/summary', async (req, res) => {
  try {
    const { startDate, endDate, vehicleNo, page = '1', pageSize = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(String(pageSize), 10)));

    const where: Prisma.RawOreWeighingRecordWhereInput = {};
    const dateRange: { gte?: Date; lte?: Date } = {};
    if (startDate) {
      const [y, m, day] = String(startDate).split('-').map(Number);
      dateRange.gte = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
    }
    if (endDate) {
      const [y, m, day] = String(endDate).split('-').map(Number);
      dateRange.lte = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
    }
    if (dateRange.gte !== undefined || dateRange.lte !== undefined) {
      where.recordDate = dateRange;
    }
    const vn = String(vehicleNo || '').trim();
    if (vn) where.vehicleNo = { contains: vn };

    const list = await prisma.rawOreWeighingRecord.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { recordDate: 'desc' },
      select: { recordDate: true, grossWeight: true, tareWeight: true, netWeight: true }
    });

    const byDate = new Map<string, { grossWeight: number; tareWeight: number; netWeight: number; count: number }>();
    list.forEach((r) => {
      const key = r.recordDate.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, { grossWeight: 0, tareWeight: 0, netWeight: 0, count: 0 });
      const row = byDate.get(key)!;
      row.grossWeight += Number(r.grossWeight);
      row.tareWeight += Number(r.tareWeight);
      row.netWeight += Number(r.netWeight);
      row.count += 1;
    });

    const fullSummary = Array.from(byDate.entries())
      .map(([date, row]) => ({
        date,
        grossWeight: Number(row.grossWeight.toFixed(2)),
        tareWeight: Number(row.tareWeight.toFixed(2)),
        netWeight: Number(row.netWeight.toFixed(2)),
        count: row.count
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const total = fullSummary.length;
    const skip = (pageNum - 1) * pageSizeNum;
    const data = fullSummary.slice(skip, skip + pageSizeNum);

    res.json({ data, total, page: pageNum, pageSize: pageSizeNum });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '查询称重汇总失败' });
  }
});

// 删除称重记录：?all=1 删除全部，否则需 date 或 startDate+endDate
app.delete('/api/weighing/records', async (req, res) => {
  try {
    const { all, date, startDate, endDate } = req.query;
    const where: Prisma.RawOreWeighingRecordWhereInput = {};
    if (all === '1' || all === 'true') {
      // 删除全部
    } else if (date) {
      const [y, m, day] = String(date).split('-').map(Number);
      const dStart = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
      const dEnd = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
      where.recordDate = { gte: dStart, lte: dEnd };
    } else if (startDate && endDate) {
      const [y1, m1, d1] = String(startDate).split('-').map(Number);
      const [y2, m2, d2] = String(endDate).split('-').map(Number);
      where.recordDate = {
        gte: new Date(Date.UTC(y1, m1 - 1, d1, 0, 0, 0, 0)),
        lte: new Date(Date.UTC(y2, m2 - 1, d2, 23, 59, 59, 999))
      };
    } else {
      return res.status(400).json({ error: '请指定 all=1 或 date 或 startDate+endDate' });
    }
    const result = await prisma.rawOreWeighingRecord.deleteMany({
      where: Object.keys(where).length ? where : undefined
    });
    res.json({ deleted: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '删除称重记录失败' });
  }
});

// 称重数据月报表：按车号汇总。区间 = 选择月的上个月26日 00:00 至 选择月25日 23:59
app.get('/api/weighing/monthly-report', async (req, res) => {
  try {
    const year = parseInt(String(req.query.year), 10);
    const month = parseInt(String(req.query.month), 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: '请提供有效的 year 和 month（1-12）' });
    }
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const startDate = new Date(Date.UTC(prevYear, prevMonth - 1, 26, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month - 1, 25, 23, 59, 59, 999));

    const list = await prisma.rawOreWeighingRecord.findMany({
      where: { recordDate: { gte: startDate, lte: endDate } },
      select: { vehicleNo: true, grossWeight: true, tareWeight: true, netWeight: true }
    });

    const byVehicle = new Map<string, { count: number; grossWeight: number; tareWeight: number; netWeight: number }>();
    for (const r of list) {
      const no = String(r.vehicleNo || '').trim() || '未知';
      if (!byVehicle.has(no)) byVehicle.set(no, { count: 0, grossWeight: 0, tareWeight: 0, netWeight: 0 });
      const row = byVehicle.get(no)!;
      row.count += 1;
      row.grossWeight += Number(r.grossWeight);
      row.tareWeight += Number(r.tareWeight);
      row.netWeight += Number(r.netWeight);
    }

    const data = Array.from(byVehicle.entries())
      .map(([vehicleNo, row]) => ({
        vehicleNo,
        count: row.count,
        grossWeight: Number(row.grossWeight.toFixed(2)),
        tareWeight: Number(row.tareWeight.toFixed(2)),
        netWeight: Number(row.netWeight.toFixed(2))
      }))
      .sort((a, b) => a.vehicleNo.localeCompare(b.vehicleNo, 'zh-CN'));

    res.json({
      year,
      month,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      data
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '查询称重月报失败' });
  }
});

// ----- 客户表 CRUD（手动录入与维护） -----
app.get('/api/customers', async (_req, res) => {
  try {
    const list = await prisma.customer.findMany({
      orderBy: [{ code: 'asc' }]
    });
    res.json(list.map(c => ({
      id: c.id,
      name: c.name,
      contact: c.contact ?? '',
      phone: c.phone ?? '',
      code: c.code,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '查询客户列表失败' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const body = req.body as { name?: string; contact?: string; phone?: string; code?: string };
    const name = String(body?.name ?? '').trim();
    const code = String(body?.code ?? '').trim();
    if (!name) return res.status(400).json({ error: '客户名称不能为空' });
    if (!code) return res.status(400).json({ error: '客户编码不能为空' });
    const existing = await prisma.customer.findUnique({ where: { code } });
    if (existing) return res.status(400).json({ error: '客户编码已存在' });
    const customer = await prisma.customer.create({
      data: {
        name,
        code,
        contact: body.contact ? String(body.contact).trim() || null : null,
        phone: body.phone ? String(body.phone).trim() || null : null
      }
    });
    res.status(201).json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '新增客户失败' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body as { name?: string; contact?: string; phone?: string; code?: string };
    const name = String(body?.name ?? '').trim();
    const code = String(body?.code ?? '').trim();
    if (!name) return res.status(400).json({ error: '客户名称不能为空' });
    if (!code) return res.status(400).json({ error: '客户编码不能为空' });
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '客户不存在' });
    const codeConflict = await prisma.customer.findFirst({ where: { code, id: { not: id } } });
    if (codeConflict) return res.status(400).json({ error: '客户编码已被其他客户使用' });
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        code,
        contact: body.contact ? String(body.contact).trim() || null : null,
        phone: body.phone ? String(body.phone).trim() || null : null
      }
    });
    res.json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '更新客户失败' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await prisma.customer.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: '客户不存在' });
    console.error(error);
    res.status(500).json({ error: '删除客户失败' });
  }
});

// ----- 精矿销售 - 出厂化验单上传与历史 -----

/** 从「客户及编号」取第一个 "-" 前半部分，用于关联客户表 */
function getCustomerPartFromCode(customerCode: string | null): string | null {
  if (!customerCode || typeof customerCode !== 'string') return null;
  const s = String(customerCode).trim();
  if (!s) return null;
  const idx = s.indexOf('-');
  const part = idx >= 0 ? s.slice(0, idx).trim() : s;
  return part || null;
}

function parseSalesAssayExcel(filePath: string, fileName: string): {
  reportDate: string;
  productName: string;
  customerName: string;
  details: Array<{
    seqNo: string | null;
    vehicleNo: string | null;
    customerCode: string | null;
    wetWeight: number | null;
    moisture: number | null;
    dryWeight: number | null;
    pbGrade: number | null;
    znGrade: number | null;
    cuGrade: number | null;
    agGpt: number | null;
    pbMetal: number | null;
    znMetal: number | null;
    cuMetal: number | null;
    agKg: number | null;
  }>;
} {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
  if (!data || data.length < 7) throw new Error('Excel 行数不足');

  let reportDate = format(new Date(), 'yyyy-MM-dd');
  let productName = '铅精粉';
  let customerName = '';

  const row3 = String(data[3]?.[0] ?? '');
  const dateMatch = row3.match(/日期[：:]\s*(\d{4})\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    reportDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const productMatch = row3.match(/产品名称[：:]\s*([^\s出]+)/);
  if (productMatch) productName = productMatch[1].trim();
  const unitMatch = row3.match(/单位[：:]\s*([^\s]+)/);
  if (unitMatch) customerName = unitMatch[1].trim();

  const details: Array<{
    seqNo: string | null;
    vehicleNo: string | null;
    customerCode: string | null;
    wetWeight: number | null;
    moisture: number | null;
    dryWeight: number | null;
    pbGrade: number | null;
    znGrade: number | null;
    cuGrade: number | null;
    agGpt: number | null;
    pbMetal: number | null;
    znMetal: number | null;
    cuMetal: number | null;
    agKg: number | null;
  }> = [];

  for (let r = 6; r < data.length; r++) {
    const row = data[r] || [];
    const cell0 = String(row[0] ?? '').trim();
    const cell1 = String(row[1] ?? '').trim();
    if (cell0.includes('合计') || cell1.includes('合计')) break;
    const numVal = (col: number) => {
      const v = row[col];
      if (v == null || v === '') return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const strVal = (col: number) => {
      const v = row[col];
      if (v == null || v === '') return null;
      const s = String(v).trim();
      return s === '' || s.toLowerCase() === 'nan' ? null : s;
    };
    details.push({
      seqNo: strVal(1) ?? null,
      vehicleNo: strVal(2) ?? null,
      customerCode: strVal(3) ?? null,
      wetWeight: numVal(4) ?? null,
      moisture: numVal(5) ?? null,
      dryWeight: numVal(6) ?? null,
      pbGrade: numVal(7) ?? null,
      znGrade: numVal(8) ?? null,
      cuGrade: numVal(9) ?? null,
      agGpt: numVal(10) ?? null,
      pbMetal: numVal(11) ?? null,
      znMetal: numVal(12) ?? null,
      cuMetal: numVal(13) ?? null,
      agKg: numVal(14) ?? null,
    });
  }

  return { reportDate, productName, customerName, details };
}

app.post('/api/sales-assay/upload', upload.single('file'), async (req, res) => {
  let filePath: string | undefined;
  try {
    if (!req.file) return res.status(400).json({ error: '请选择要上传的出厂化验单文件' });
    filePath = req.file.path;
    const fileName = fixFileNameEncoding(req.file.originalname || '') || 'unknown.xlsm';
    if (!fs.existsSync(filePath)) return res.status(400).json({ error: '上传的文件不存在' });

    const existing = await prisma.salesAssayReport.findFirst({ where: { sourceFile: fileName } });
    if (existing) {
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
      return res.status(400).json({ error: `该文件已上传过，请勿重复上传。来源文件：${fileName}` });
    }

    const parsed = parseSalesAssayExcel(filePath, fileName);
    const validDetails = parsed.details.filter(
      d => d.dryWeight != null || d.wetWeight != null || d.pbGrade != null
    );
    if (validDetails.length === 0) {
      return res.status(400).json({ error: '未解析到有效明细行，请检查表格格式' });
    }

    const reportDate = new Date(parsed.reportDate + 'T12:00:00');

    // 主表客户名称：取第一条有效明细的「客户及编号」第一个 "-" 前半部分，与子表关联逻辑一致
    const reportCustomerName = getCustomerPartFromCode(validDetails[0].customerCode) || parsed.customerName || '';

    // 用「客户及编号」第一个 "-" 前半部分模糊匹配客户表（双向：客户名/编码包含 part，或 part 包含客户名/编码，便于「圣达」与「葫芦岛圣达」互匹配）
    const partToCustomerId = new Map<string, string | null>();
    const uniqueParts = [...new Set(validDetails.map(d => getCustomerPartFromCode(d.customerCode)).filter(Boolean))] as string[];
    let allCustomersCache: Array<{ id: string; name: string; code: string }> | null = null;
    for (const part of uniqueParts) {
      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { name: { contains: part } },
            { code: { contains: part } },
          ],
        },
      });
      let customerId: string | null = customer?.id ?? null;
      if (!customerId) {
        allCustomersCache = allCustomersCache ?? await prisma.customer.findMany({ select: { id: true, name: true, code: true } });
        const found = allCustomersCache.find((c) => part.includes(c.name) || part.includes(c.code));
        customerId = found?.id ?? null;
      }
      partToCustomerId.set(part, customerId);
    }

    // 主表关联客户：与第一条有效明细的客户一致
    const reportCustomerPart = getCustomerPartFromCode(validDetails[0].customerCode);
    const reportCustomerId = reportCustomerPart ? (partToCustomerId.get(reportCustomerPart) ?? null) : null;

    const report = await prisma.salesAssayReport.create({
      data: {
        reportDate,
        productName: parsed.productName,
        customerName: reportCustomerName,
        customerId: reportCustomerId,
        vehicleCount: validDetails.length,
        sourceFile: fileName,
        details: {
          create: validDetails.map(d => {
            const part = getCustomerPartFromCode(d.customerCode);
            const customerId = part ? (partToCustomerId.get(part) ?? null) : null;
            return {
              seqNo: d.seqNo,
              vehicleNo: d.vehicleNo,
              customerCode: d.customerCode,
              customerId,
              wetWeight: d.wetWeight,
              moisture: d.moisture,
              dryWeight: d.dryWeight,
              pbGrade: d.pbGrade,
              znGrade: d.znGrade,
              cuGrade: d.cuGrade,
              agGpt: d.agGpt,
              pbMetal: d.pbMetal,
              znMetal: d.znMetal,
              cuMetal: d.cuMetal,
              agKg: d.agKg,
            };
          }),
        },
      },
      include: { details: { include: { customer: true } } },
    });

    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    res.status(201).json({
      success: true,
      id: report.id,
      reportDate: parsed.reportDate,
      productName: report.productName,
      customerName: report.customerName,
      vehicleCount: report.vehicleCount,
      detailCount: report.details.length,
      message: `成功导入出厂化验单，共 ${report.details.length} 车`,
    });
  } catch (err: any) {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
    console.error(err);
    res.status(500).json({ error: err?.message || '上传解析失败' });
  }
});

app.get('/api/sales-assay/reports', async (req, res) => {
  try {
    const { startDate, endDate, customerId, page: pageStr, pageSize: pageSizeStr } = req.query;
    const where: Prisma.SalesAssayReportWhereInput = {};
    if (startDate && endDate) {
      const [y1, m1, d1] = String(startDate).split('-').map(Number);
      const [y2, m2, d2] = String(endDate).split('-').map(Number);
      where.reportDate = {
        gte: new Date(y1, m1 - 1, d1),
        lte: new Date(y2, m2 - 1, d2, 23, 59, 59, 999),
      };
    }
    if (customerId && String(customerId).trim()) {
      where.customerId = String(customerId).trim();
    }

    const page = Math.max(1, parseInt(String(pageStr || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(pageSizeStr || '20'), 10) || 20));
    const skip = (page - 1) * pageSize;

    const [total, list] = await Promise.all([
      prisma.salesAssayReport.count({ where: Object.keys(where).length ? where : undefined }),
      prisma.salesAssayReport.findMany({
        where: Object.keys(where).length ? where : undefined,
        orderBy: { reportDate: 'desc' },
        skip,
        take: pageSize,
        include: { customer: true, details: { include: { customer: true } } },
      }),
    ]);

    const rows = list.map(r => {
      const details = r.details;
      let wetWeightSum = 0, dryWeightSum = 0, moistureWeighted = 0, pbWeighted = 0, znWeighted = 0, cuWeighted = 0, agWeighted = 0;
      let pbMetalSum = 0, znMetalSum = 0, cuMetalSum = 0, agKgSum = 0;
      for (const d of details) {
        const wet = d.wetWeight != null ? Number(d.wetWeight) : 0;
        const dry = d.dryWeight != null ? Number(d.dryWeight) : 0;
        const moist = d.moisture != null ? Number(d.moisture) : 0;
        const pb = d.pbGrade != null ? Number(d.pbGrade) : 0;
        const zn = d.znGrade != null ? Number(d.znGrade) : 0;
        const cu = d.cuGrade != null ? Number(d.cuGrade) : 0;
        const ag = d.agGpt != null ? Number(d.agGpt) : 0;
        wetWeightSum += wet;
        dryWeightSum += dry;
        moistureWeighted += moist * dry;
        pbWeighted += pb * dry;
        znWeighted += zn * dry;
        cuWeighted += cu * dry;
        agWeighted += ag * dry;
        pbMetalSum += d.pbMetal != null ? Number(d.pbMetal) : 0;
        znMetalSum += d.znMetal != null ? Number(d.znMetal) : 0;
        cuMetalSum += d.cuMetal != null ? Number(d.cuMetal) : 0;
        agKgSum += d.agKg != null ? Number(d.agKg) : 0;
      }
      const moistureAvg = dryWeightSum > 0 ? moistureWeighted / dryWeightSum : 0;
      const pbGradeAvg = dryWeightSum > 0 ? pbWeighted / dryWeightSum : 0;
      const znGradeAvg = dryWeightSum > 0 ? znWeighted / dryWeightSum : 0;
      const cuGradeAvg = dryWeightSum > 0 ? cuWeighted / dryWeightSum : 0;
      const agGptAvg = dryWeightSum > 0 ? agWeighted / dryWeightSum : 0;

      return {
        id: r.id,
        reportDate: r.reportDate.toISOString().slice(0, 10),
        productName: r.productName,
        customerName: r.customerName,
        customerId: r.customerId,
        customer: r.customer ? { id: r.customer.id, name: r.customer.name, code: r.customer.code } : null,
        vehicleCount: r.vehicleCount,
        sourceFile: r.sourceFile,
        createdAt: r.createdAt,
        wetWeightSum: Number(wetWeightSum.toFixed(4)),
        moistureAvg: Number(moistureAvg.toFixed(4)),
        dryWeightSum: Number(dryWeightSum.toFixed(4)),
        pbGradeAvg: Number(pbGradeAvg.toFixed(4)),
        znGradeAvg: Number(znGradeAvg.toFixed(4)),
        cuGradeAvg: Number(cuGradeAvg.toFixed(4)),
        agGptAvg: Number(agGptAvg.toFixed(4)),
        pbMetalSum: Number(pbMetalSum.toFixed(4)),
        znMetalSum: Number(znMetalSum.toFixed(4)),
        cuMetalSum: Number(cuMetalSum.toFixed(4)),
        agKgSum: Number(agKgSum.toFixed(4)),
      };
    });

    res.json({ list: rows, total, page, pageSize });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '查询出厂化验单列表失败' });
  }
});

app.get('/api/sales-assay/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await prisma.salesAssayReport.findUnique({
      where: { id },
      include: { customer: true, details: { include: { customer: true } } },
    });
    if (!report) return res.status(404).json({ error: '未找到该化验单' });

    res.json({
      id: report.id,
      reportDate: report.reportDate.toISOString().slice(0, 10),
      productName: report.productName,
      customerName: report.customerName,
      customerId: report.customerId,
      customer: report.customer ? { id: report.customer.id, name: report.customer.name, code: report.customer.code } : null,
      vehicleCount: report.vehicleCount,
      sourceFile: report.sourceFile,
      createdAt: report.createdAt,
      details: report.details.map(d => ({
        id: d.id,
        seqNo: d.seqNo,
        vehicleNo: d.vehicleNo,
        customerCode: d.customerCode,
        customerId: d.customerId,
        customer: d.customer ? { id: d.customer.id, name: d.customer.name, code: d.customer.code } : null,
        wetWeight: d.wetWeight != null ? Number(d.wetWeight) : null,
        moisture: d.moisture != null ? Number(d.moisture) : null,
        dryWeight: d.dryWeight != null ? Number(d.dryWeight) : null,
        pbGrade: d.pbGrade != null ? Number(d.pbGrade) : null,
        znGrade: d.znGrade != null ? Number(d.znGrade) : null,
        cuGrade: d.cuGrade != null ? Number(d.cuGrade) : null,
        agGpt: d.agGpt != null ? Number(d.agGpt) : null,
        pbMetal: d.pbMetal != null ? Number(d.pbMetal) : null,
        znMetal: d.znMetal != null ? Number(d.znMetal) : null,
        cuMetal: d.cuMetal != null ? Number(d.cuMetal) : null,
        agKg: d.agKg != null ? Number(d.agKg) : null,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '查询化验单详情失败' });
  }
});

app.delete('/api/sales-assay/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.salesAssayReport.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: '未找到该化验单' });
    console.error(error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 销售数据分析：按时间、客户维度汇总
app.get('/api/sales-assay/analysis', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where: Prisma.SalesAssayReportWhereInput = {};
    if (startDate && endDate) {
      const [y1, m1, d1] = String(startDate).split('-').map(Number);
      const [y2, m2, d2] = String(endDate).split('-').map(Number);
      where.reportDate = {
        gte: new Date(y1, m1 - 1, d1),
        lte: new Date(y2, m2 - 1, d2, 23, 59, 59, 999),
      };
    }
    const reports = await prisma.salesAssayReport.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { reportDate: 'asc' },
      include: { customer: true, details: true },
    });

    type MonthKey = string;
    type CustomerKey = string;
    const byMonth = new Map<MonthKey, { reportCount: number; vehicleCount: number; dryWeightSum: number; pbMetalSum: number; znMetalSum: number; cuMetalSum: number; agKgSum: number }>();
    const byCustomer = new Map<CustomerKey, { customerId: string | null; customerName: string; customerCode: string; reportCount: number; vehicleCount: number; dryWeightSum: number; pbMetalSum: number; znMetalSum: number; cuMetalSum: number; agKgSum: number }>();

    for (const r of reports) {
      const period = format(r.reportDate, 'yyyy-MM');
      const cKey = r.customerId ?? r.customerName;
      const cName = r.customer?.name ?? r.customerName;
      const cCode = r.customer?.code ?? '';

      let dryWeightSum = 0, pbMetalSum = 0, znMetalSum = 0, cuMetalSum = 0, agKgSum = 0;
      for (const d of r.details) {
        dryWeightSum += d.dryWeight != null ? Number(d.dryWeight) : 0;
        pbMetalSum += d.pbMetal != null ? Number(d.pbMetal) : 0;
        znMetalSum += d.znMetal != null ? Number(d.znMetal) : 0;
        cuMetalSum += d.cuMetal != null ? Number(d.cuMetal) : 0;
        agKgSum += d.agKg != null ? Number(d.agKg) : 0;
      }

      if (!byMonth.has(period)) {
        byMonth.set(period, { reportCount: 0, vehicleCount: 0, dryWeightSum: 0, pbMetalSum: 0, znMetalSum: 0, cuMetalSum: 0, agKgSum: 0 });
      }
      const mM = byMonth.get(period)!;
      mM.reportCount += 1;
      mM.vehicleCount += r.vehicleCount;
      mM.dryWeightSum += dryWeightSum;
      mM.pbMetalSum += pbMetalSum;
      mM.znMetalSum += znMetalSum;
      mM.cuMetalSum += cuMetalSum;
      mM.agKgSum += agKgSum;

      if (!byCustomer.has(cKey)) {
        byCustomer.set(cKey, { customerId: r.customerId, customerName: cName, customerCode: cCode, reportCount: 0, vehicleCount: 0, dryWeightSum: 0, pbMetalSum: 0, znMetalSum: 0, cuMetalSum: 0, agKgSum: 0 });
      }
      const cM = byCustomer.get(cKey)!;
      cM.reportCount += 1;
      cM.vehicleCount += r.vehicleCount;
      cM.dryWeightSum += dryWeightSum;
      cM.pbMetalSum += pbMetalSum;
      cM.znMetalSum += znMetalSum;
      cM.cuMetalSum += cuMetalSum;
      cM.agKgSum += agKgSum;
    }

    const byTime = Array.from(byMonth.entries())
      .map(([period, v]) => ({ period, ...v }))
      .sort((a, b) => a.period.localeCompare(b.period));
    const byCustomerList = Array.from(byCustomer.values())
      .sort((a, b) => (b.dryWeightSum - a.dryWeightSum));

    res.json({ byTime, byCustomer: byCustomerList });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '查询销售分析失败' });
  }
});

// Parse Excel test report (化验单)
app.post('/api/parse-test-report', upload.single('file'), async (req, res) => {
  let filePath: string | undefined;
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    filePath = req.file.path;
    
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: '上传的文件不存在' });
    }

    let workbook;
    try {
      workbook = XLSX.readFile(filePath);
    } catch (err: any) {
      return res.status(400).json({ error: `无法读取 Excel 文件: ${err.message || '文件格式错误'}` });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Excel 文件中没有工作表' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

    if (!data || data.length < 4) {
      return res.status(400).json({ error: 'Excel 文件格式不正确，数据行数不足（至少需要 4 行）' });
    }

    // Parse Excel structure
    // Row 0: Title
    // Row 1: Date and shift info (e.g., "报告日期：   2025  年 9  月 1  日         （   2    班组）")
    // Row 2: "试样名称"
    // Row 3: Headers (铅, 锌, 银, 铜, 硫, 水分, 细度)
    // Row 4: 原矿 data
    // Row 5: 铅精 data
    // Row 6: 尾矿 data

    let shiftDate = '';
    let shiftType = '';
    let rawOre: any = {};
    let concentrate: any = {};
    let tailings: any = {};

    // Parse date and shift from row 1
    if (data[1] && data[1][0]) {
      const dateLine = String(data[1][0]);
      // Extract date: "2025  年 9  月 1  日"
      const dateMatch = dateLine.match(/(\d{4})\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        shiftDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      // Extract shift: "（   2    班组）" -> "2" -> map to 甲班/乙班/丙班
      const shiftMatch = dateLine.match(/（\s*(\d+)\s*班组）/);
      if (shiftMatch) {
        const shiftNum = parseInt(shiftMatch[1]);
        shiftType = shiftNum === 1 ? '甲班' : shiftNum === 2 ? '乙班' : shiftNum === 3 ? '丙班' : '';
      }
    }

    // Parse data rows
    // 实际文件结构（2.2.1CF格式）：
    // Row 2 (index 2): ["试样名称", "分析成分", ...]
    // Row 3 (index 3): [null, "铅", "锌", "银", "铜", "硫", "水分", "细度"]
    //   - 表头列索引：index 1="铅", index 2="锌", index 3="银", index 6="水分", index 7="细度"
    // Row 4 (index 4): ["原矿", 3.97, 0.34, 231, ...]
    //   - 名称在第1列（index 0），数据列索引与表头对应：index 1=铅值, index 2=锌值, index 3=银值
    // Row 5 (index 5): ["铅精", 59.35, 3.55, 3270, ...]
    // Row 6 (index 6): ["尾矿", 0.13, 0.07, 7, ...]

    if (data.length >= 5) {
      // Find header row (row 3, index 3)
      const headerRow = data[3] || [];
      // 在表头行中查找各列的索引位置
      const pbCol = headerRow.findIndex((h: any) => h === '铅' || String(h).includes('铅'));
      const znCol = headerRow.findIndex((h: any) => h === '锌' || String(h).includes('锌'));
      const agCol = headerRow.findIndex((h: any) => h === '银' || String(h).includes('银'));
      const moistureCol = headerRow.findIndex((h: any) => h === '水分' || String(h).includes('水分'));
      const finenessCol = headerRow.findIndex((h: any) => h === '细度' || String(h).includes('细度'));

      // Debug: 如果找不到关键列，记录日志
      if (pbCol < 0 || agCol < 0) {
        console.warn('Excel parse: Missing columns. Header row:', headerRow);
        console.warn(`Columns found - Pb: ${pbCol}, Zn: ${znCol}, Ag: ${agCol}`);
      }

      // 遍历数据行（从第5行开始，index 4），查找原矿、精矿、尾矿
      for (let i = 4; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 2) continue;

        // 名称列查找：兼容两种格式
        // 2.2.1格式：名称在 index 0，如 ['原矿', 3.97, ...]
        // 7.3.3格式：统一编号在 index 0（如'SL-'），名称在 index 1，如 ['SL-', '原矿', 5.89, ...]
        let name = '';
        const cell0 = String(row[0] || '').trim().toLowerCase();
        const cell1 = String(row[1] || '').trim().toLowerCase();
        
        // 如果 index 0 是统一编号（如'SL-'），则名称在 index 1
        if (cell0 === 'sl-' || cell0.startsWith('sl') || cell0.match(/^[a-z]+-/)) {
          name = String(row[1] || '').trim();
        } else if (cell0.includes('原矿') || cell0.includes('铅精') || cell0.includes('精矿') || cell0.includes('尾矿')) {
          name = String(row[0] || '').trim();
        } else if (cell1.includes('原矿') || cell1.includes('铅精') || cell1.includes('精矿') || cell1.includes('尾矿')) {
          name = String(row[1] || '').trim();
        }
        
        if (!name || name === 'nan' || name === '') continue;
        
        // Parse 原矿（只解析品位，不解析湿量和水分）
        if (name.includes('原矿')) {
          const pbVal = pbCol >= 0 && row[pbCol] != null && row[pbCol] !== '' && String(row[pbCol]).toLowerCase() !== 'nan' ? Number(row[pbCol]) : 0;
          const znVal = znCol >= 0 && row[znCol] != null && row[znCol] !== '' && String(row[znCol]).toLowerCase() !== 'nan' ? Number(row[znCol]) : 0;
          const agVal = agCol >= 0 && row[agCol] != null && row[agCol] !== '' && String(row[agCol]).toLowerCase() !== 'nan' ? Number(row[agCol]) : 0;
          rawOre = {
            pbGrade: pbVal,
            znGrade: znVal,
            agGrade: agVal,
          };
          console.log(`Parsed 原矿: Pb=${pbVal}, Zn=${znVal}, Ag=${agVal} (row: ${JSON.stringify(row.slice(0, 5))})`);
        }

        // Parse 铅精/铅精矿（只解析品位，不解析水分）
        if (name.includes('铅精') || name.includes('精矿')) {
          const pbVal = pbCol >= 0 && row[pbCol] != null && row[pbCol] !== '' && String(row[pbCol]).toLowerCase() !== 'nan' ? Number(row[pbCol]) : 0;
          const znVal = znCol >= 0 && row[znCol] != null && row[znCol] !== '' && String(row[znCol]).toLowerCase() !== 'nan' ? Number(row[znCol]) : 0;
          const agVal = agCol >= 0 && row[agCol] != null && row[agCol] !== '' && String(row[agCol]).toLowerCase() !== 'nan' ? Number(row[agCol]) : 0;
          concentrate = {
            pbGrade: pbVal,
            znGrade: znVal,
            agGrade: agVal,
          };
          console.log(`Parsed 铅精: Pb=${pbVal}, Zn=${znVal}, Ag=${agVal} (row: ${JSON.stringify(row.slice(0, 5))})`);
        }

        // Parse 尾矿
        if (name.includes('尾矿')) {
          const pbVal = pbCol >= 0 && row[pbCol] != null && row[pbCol] !== '' && String(row[pbCol]).toLowerCase() !== 'nan' ? Number(row[pbCol]) : 0;
          const znVal = znCol >= 0 && row[znCol] != null && row[znCol] !== '' && String(row[znCol]).toLowerCase() !== 'nan' ? Number(row[znCol]) : 0;
          const agVal = agCol >= 0 && row[agCol] != null && row[agCol] !== '' && String(row[agCol]).toLowerCase() !== 'nan' ? Number(row[agCol]) : 0;
          const finenessVal = finenessCol >= 0 && row[finenessCol] != null && row[finenessCol] !== '' && String(row[finenessCol]).toLowerCase() !== 'nan' ? Number(row[finenessCol]) : undefined;
          tailings = {
            pbGrade: pbVal,
            znGrade: znVal,
            agGrade: agVal,
            fineness: finenessVal,
          };
          console.log(`Parsed 尾矿: Pb=${pbVal}, Zn=${znVal}, Ag=${agVal}, Fineness=${finenessVal} (row: ${JSON.stringify(row.slice(0, 5))})`);
        }
      }
    }

    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Failed to delete uploaded file:', err);
      }
    }

    res.json({
      shiftDate: shiftDate || format(new Date(), 'yyyy-MM-dd'),
      shiftType: shiftType || '甲班',
      rawOre,
      concentrate,
      tailings,
    });
  } catch (error: any) {
    // Clean up uploaded file on error
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Failed to delete uploaded file on error:', err);
      }
    }
    console.error('Excel parse error:', error);
    const errorMessage = error.message || '未知错误';
    res.status(500).json({ error: `解析失败: ${errorMessage}` });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
