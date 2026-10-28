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
    source: { type: String, default: null }
  },
  { collection: 'prices', versionKey: false }
);

export const Price = model('Price', priceSchema);
