import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// Get recent reports
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await prisma.shiftData.findMany({
      take: 20,
      orderBy: {
        shiftDate: 'desc',
      },
      include: {
        rawOreData: true,
        concentrateData: true,
        tailingsData: true,
        metalBalance: true,
      },
    });
    res.json(reports);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
