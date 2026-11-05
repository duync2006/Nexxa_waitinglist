import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Ảnh chụp giá cổ phiếu. Reserve luôn đọc từ đây chứ không gọi API nhà cung cấp:
// API chết thì snapshot cũ vẫn dùng được, và giá không đổi giữa lúc người dùng đang chọn.
//
// Dùng mã cổ phiếu làm _id: upsert gọn một lệnh, và unique sẵn không cần thêm index.
const priceSchema = new Schema(
  {
    _id: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    updatedAt: { type: Date, required: true, default: Date.now },
    // Tên nhà cung cấp đã trả về giá này, để truy nguồn khi số liệu trông sai
    source: { type: String, default: null },
    // Nhóm của mã: VIP (VN30) hay STANDARD (top 30–100). Suy ra từ shared/catalog.js lúc
    // ghi snapshot. Không required: những dòng ghi trước khi có field này vẫn đọc được,
    // chạy lại `npm run prices` là chúng được điền.
    groupType: { type: String, enum: ['VIP', 'STANDARD', null], default: null },
    // Tên công ty do nguồn giá trả về. Frontend đọc field này để hiển thị thay vì
    // hardcode tên trong bundle, nên đây là nơi duy nhất quyết định tên hiện ra màn hình.
    companyName: { type: String, default: null }
  },
  { collection: 'prices', versionKey: false }
);

export const Price = model('Price', priceSchema);
