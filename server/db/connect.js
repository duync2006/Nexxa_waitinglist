import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User, Otp, Counter, Price } from '../models/index.js';

// autoIndex tắt để việc tạo index là tường minh, không chạy ngầm lúc có request đầu tiên.
mongoose.set('autoIndex', false);
mongoose.set('strictQuery', true);

export async function connectDb({ quiet = false } = {}) {
  if (!quiet) console.log('[db] kết nối MongoDB:', env.mongoUri, 'DB:', env.mongoDb);
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDb });

  // Phải là createIndexes(), KHÔNG phải init(): khi autoIndex = false thì init() chỉ chờ
  // kết nối chứ không dựng index, và thiếu unique index trên email thì hai request song song
  // cùng tạo được một email (test "5 request song song" bắt đúng lỗi này).
  // Cũng KHÔNG dùng syncIndexes() — hàm đó XOÁ mọi index không khai báo trong schema.
  await Promise.all([User.createIndexes(), Otp.createIndexes(), Counter.createIndexes(), Price.createIndexes()]);
  return mongoose.connection;
}

export const disconnectDb = () => mongoose.disconnect();
