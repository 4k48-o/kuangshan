/**
 * 批量导入：将 data/excel/进场原矿明细 下所有 .xls/.xlsx 解析并写入称重记录表。
 * - 不导入“合计”行（车号含“合计”的跳过）。
 * - 默认：若某文件对应日期在库中已有记录则跳过该文件。
 * - 加 --clear 时：先清空称重表，再全量导入（不跳过已有日期）。
 * 运行（在 server 目录）: npx ts-node -r dotenv/config import_weighing_from_excel.ts [--clear]
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const DATA_DIR = path.join(__dirname, '..', 'data', 'excel', '进场原矿明细');

const CLEAR_FIRST = process.argv.includes('--clear');

// 与 server/index.ts 保持一致
function findWeighingHeader(data: any[][]): { headerRowIndex: number; cols: { vehicleNo: number; weighTime: number; gross: number; tare: number; net: number } } | null {
  const keywords = { vehicleNo: ['车号'], weighTime: ['上传时间', '称重时间', '时间'], gross: ['毛重'], tare: ['皮重'], net: ['净重'] };
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const row = data[r] || [];
    const vehicleNoCol = row.findIndex((c: any) => keywords.vehicleNo.some(k => String(c || '').trim().includes(k)));
    const grossCol = row.findIndex((c: any) => keywords.gross.some(k => String(c || '').trim().includes(k)));
    const tareCol = row.findIndex((c: any) => keywords.tare.some(k => String(c || '').trim().includes(k)));
    const netCol = row.findIndex((c: any) => keywords.net.some(k => String(c || '').trim().includes(k)));
    const weighTimeCol = row.findIndex((c: any) => keywords.weighTime.some(k => String(c || '').trim().includes(k)));
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
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0);
  }
  const s = String(val).trim();
  if (!s) return null;
  const iso = s.replace(/\s+/g, 'T').replace(/[年月日]/g, '-').replace(/日$/, '');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function collectExcelFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...collectExcelFiles(full));
    } else if (e.isFile() && /\.(xls|xlsx)$/i.test(e.name)) {
      files.push(full);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

type RecordRow = { vehicleNo: string; weighTime: Date; grossWeight: number; tareWeight: number; netWeight: number; recordDate: Date };

function parseFile(filePath: string): RecordRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
  if (!data || data.length < 2) return [];

  const headerInfo = findWeighingHeader(data);
  if (!headerInfo) return [];

  const { headerRowIndex, cols } = headerInfo;
  let fileDefaultDate: Date | null = null;
  for (let r = headerRowIndex + 1; r < data.length; r++) {
    const row = data[r] || [];
    const t = parseWeighTime(row[cols.weighTime]);
    if (t) {
      fileDefaultDate = t;
      break;
    }
  }

  const records: RecordRow[] = [];
  for (let r = headerRowIndex + 1; r < data.length; r++) {
    const row = data[r] || [];
    const vehicleNo = String(row[cols.vehicleNo] ?? '').trim();
    if (!vehicleNo || vehicleNo.includes('合计')) continue; // 不导入合计行
    const grossVal = Number(row[cols.gross]);
    const tareVal = Number(row[cols.tare]);
    const netVal = Number(row[cols.net]);
    if (isNaN(grossVal) && isNaN(netVal)) continue;
    const grossWeight = !isNaN(grossVal) ? grossVal : netVal + (isNaN(tareVal) ? 0 : tareVal);
    const tareWeight = !isNaN(tareVal) ? tareVal : grossWeight - (!isNaN(netVal) ? netVal : 0);
    const netWeight = !isNaN(netVal) ? netVal : grossWeight - tareWeight;
    let weighTime = parseWeighTime(row[cols.weighTime]);
    if (!weighTime) {
      if (!fileDefaultDate) continue;
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
  return records;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error('目录不存在:', DATA_DIR);
    process.exit(1);
  }

  if (CLEAR_FIRST) {
    const deleted = await prisma.rawOreWeighingRecord.deleteMany({});
    console.log('已清空称重记录表，删除', deleted.count, '条');
  }

  const files = collectExcelFiles(DATA_DIR);
  console.log('共发现', files.length, '个 Excel 文件');

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const fileName = path.relative(DATA_DIR, filePath) || path.basename(filePath);
    try {
      const records = parseFile(filePath);
      if (records.length === 0) {
        console.log('[跳过]', fileName, '- 未解析到有效记录');
        skipped++;
        continue;
      }

      if (!CLEAR_FIRST) {
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
          console.log('[跳过]', fileName, '- 日期已存在:', existingDates.sort().join('、'));
          skipped++;
          continue;
        }
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
      console.log('[导入]', fileName, '-', records.length, '条');
      imported += records.length;
    } catch (err: any) {
      console.error('[失败]', fileName, err?.message || err);
      failed++;
    }
  }

  console.log('---');
  console.log('导入完成: 新增', imported, '条; 跳过', skipped, '个文件; 失败', failed, '个文件');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
