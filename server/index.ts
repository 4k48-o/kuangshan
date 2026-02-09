import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { format } from 'date-fns';
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

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('只支持 Excel 文件 (.xlsx, .xls)'));
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
    // 实际文件结构：
    // Row 3 (index 3): [null, null, "铅", "锌", "银", "铜", "硫", "水分", "细度"]
    //   - 表头列索引：index 2="铅", index 3="锌", index 4="银", index 7="水分", index 8="细度"
    // Row 4 (index 4): ["SL-", "原矿", 5.89, 0.9, 277, 0.05, null, null, null]
    //   - 名称在第2列（index 1），数据列索引与表头对应：index 2=铅值, index 3=锌值, index 4=银值
    // Row 5 (index 5): ["SL-", "铅精", 63.27, 4.03, 2720, ...]
    // Row 6 (index 6): ["SL-", "尾矿", 0.08, 0.07, 5, ...]

    if (data.length >= 5) {
      // Find header row (row 3, index 3)
      const headerRow = data[3] || [];
      // 在表头行中查找各列的索引位置
      const pbCol = headerRow.findIndex((h: any) => h === '铅' || String(h).includes('铅'));
      const znCol = headerRow.findIndex((h: any) => h === '锌' || String(h).includes('锌'));
      const agCol = headerRow.findIndex((h: any) => h === '银' || String(h).includes('银'));
      const moistureCol = headerRow.findIndex((h: any) => h === '水分' || String(h).includes('水分'));
      const finenessCol = headerRow.findIndex((h: any) => h === '细度' || String(h).includes('细度'));

      // 遍历数据行（从第5行开始，index 4），查找原矿、精矿、尾矿
      for (let i = 4; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 3) continue;

        // 名称在第2列（index 1）
        const name = String(row[1] || '').trim();
        if (!name) continue;
        
        // Parse 原矿
        if (name.includes('原矿')) {
          rawOre = {
            pbGrade: pbCol >= 0 && row[pbCol] != null && row[pbCol] !== '' ? Number(row[pbCol]) : 0,
            znGrade: znCol >= 0 && row[znCol] != null && row[znCol] !== '' ? Number(row[znCol]) : 0,
            agGrade: agCol >= 0 && row[agCol] != null && row[agCol] !== '' ? Number(row[agCol]) : 0,
          };
        }

        // Parse 铅精/铅精矿
        if (name.includes('铅精') || name.includes('精矿')) {
          concentrate = {
            pbGrade: pbCol >= 0 && row[pbCol] != null && row[pbCol] !== '' ? Number(row[pbCol]) : 0,
            znGrade: znCol >= 0 && row[znCol] != null && row[znCol] !== '' ? Number(row[znCol]) : 0,
            agGrade: agCol >= 0 && row[agCol] != null && row[agCol] !== '' ? Number(row[agCol]) : 0,
            moisture: moistureCol >= 0 && row[moistureCol] != null && row[moistureCol] !== '' ? Number(row[moistureCol]) : undefined,
          };
        }

        // Parse 尾矿
        if (name.includes('尾矿')) {
          tailings = {
            pbGrade: pbCol >= 0 && row[pbCol] != null && row[pbCol] !== '' ? Number(row[pbCol]) : 0,
            znGrade: znCol >= 0 && row[znCol] != null && row[znCol] !== '' ? Number(row[znCol]) : 0,
            agGrade: agCol >= 0 && row[agCol] != null && row[agCol] !== '' ? Number(row[agCol]) : 0,
            fineness: finenessCol >= 0 && row[finenessCol] != null && row[finenessCol] !== '' ? Number(row[finenessCol]) : undefined,
          };
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
