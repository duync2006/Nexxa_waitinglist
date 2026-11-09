// Gắn field `companyShortName` (tên ngắn, quen thuộc) vào các record trong collection `prices`
// từ một file JSON dạng { "VCB": "Vietcombank", "FPT": "FPT", ... }.
//
//   node --env-file=.env server/scripts/updateFriendlyName.js <file.json> [--dry-run]
//   npm run prices:names -- <file.json> [--dry-run]
//
// Không có <file.json> thì dùng server/data/company-short-names.json.
//
// Hành vi:
//   - Chỉ cập nhật record ĐÃ có trong `prices` (không upsert) — mã lạ trong JSON được báo, không tạo mới.
//   - Mã trong DB mà JSON không có: giữ nguyên giá trị cũ, chỉ liệt kê để bạn biết còn thiếu.
//   - Chạy lại nhiều lần an toàn (idempotent). `--dry-run` chỉ in kế hoạch, không ghi.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { connectDb, disconnectDb } from '../db/connect.js';
import { Price } from '../models/index.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find((a) => !a.startsWith('--')) ?? 'server/data/company-short-names.json';
const filePath = path.resolve(fileArg);

// Đọc + kiểm tra file TRƯỚC khi đụng DB: file hỏng thì thoát sớm, khỏi mở kết nối vô ích.
let raw;
try {
  raw = JSON.parse(await readFile(filePath, 'utf8'));
} catch (err) {
  console.error(`Không đọc được ${filePath}: ${err.message}`);
  process.exit(1);
}
if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
  console.error('File JSON phải là object dạng { "MÃ": "Tên ngắn" }.');
  process.exit(1);
}

// Chuẩn hoá mã về chữ hoa (khớp _id trong DB), bỏ khoảng trắng thừa; loại value không phải chuỗi/rỗng.
const names = new Map();
const invalid = [];
for (const [key, value] of Object.entries(raw)) {
  const ticker = key.trim().toUpperCase();
  const name = typeof value === 'string' ? value.trim() : '';
  if (!ticker || !name) invalid.push(key);
  else names.set(ticker, name);
}
if (invalid.length) {
  console.warn(`Bỏ qua ${invalid.length} mục có tên rỗng/không phải chuỗi: ${invalid.join(', ')}`);
}
if (names.size === 0) {
  console.error('Không có mục hợp lệ nào để cập nhật.');
  process.exit(1);
}

await connectDb();

try {
  const existing = await Price.find({}, { _id: 1, companyShortName: 1 }).lean();
  const inDb = new Set(existing.map((r) => r._id));

  const unknown = [...names.keys()].filter((t) => !inDb.has(t));
  const missing = existing.filter((r) => !names.has(r._id)).map((r) => r._id);
  const ops = existing
    .filter((r) => names.has(r._id) && r.companyShortName !== names.get(r._id))
    .map((r) => ({
      updateOne: { filter: { _id: r._id }, update: { $set: { companyShortName: names.get(r._id) } } }
    }));

  if (dryRun) {
    console.log(`[dry-run] Sẽ cập nhật ${ops.length}/${existing.length} mã (không ghi gì vào DB).`);
  } else if (ops.length) {
    const res = await Price.bulkWrite(ops, { ordered: false });
    console.log(`Đã cập nhật companyShortName cho ${res.modifiedCount}/${existing.length} mã.`);
  } else {
    console.log('Không có gì thay đổi — mọi mã trong JSON đã khớp DB.');
  }

  if (unknown.length) {
    console.log(`Có trong JSON nhưng chưa có trong DB (bỏ qua, ${unknown.length}): ${unknown.join(', ')}`);
  }
  if (missing.length) {
    console.log(`Có trong DB nhưng JSON chưa có tên ngắn (${missing.length}): ${missing.join(', ')}`);
  }
} catch (err) {
  console.error('Cập nhật thất bại:', err.message);
  await disconnectDb();
  process.exit(1);
}

await disconnectDb();
