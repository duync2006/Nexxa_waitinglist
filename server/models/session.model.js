import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const sessionSchema = new Schema(
  {
    // Chỉ lưu SHA-256 của token, không lưu token gốc
    hash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
  },
  { collection: 'sessions', versionKey: false }
);

// MongoDB tự xoá document khi quá expiresAt
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', sessionSchema);
