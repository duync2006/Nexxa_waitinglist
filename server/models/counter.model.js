import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// _id là CHUỖI ('users'), không phải ObjectId — phải khai báo rõ, nếu không Mongoose
// sẽ cố ép sang ObjectId và không đọc được document đếm đang có trong DB.
const counterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 }
  },
  { collection: 'counters', versionKey: false }
);

export const Counter = model('Counter', counterSchema);

// Cấp số thứ tự đăng ký kế tiếp. findOneAndUpdate với $inc là atomic nên hai request
// chạy song song không bao giờ nhận cùng một số.
export async function nextJoinIndex() {
  const doc = await Counter.findByIdAndUpdate(
    'users',
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return doc.seq;
}
