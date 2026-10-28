import mongoose from 'mongoose';
import { MAX_EMAIL_LENGTH } from '../config/constants.js';

const { Schema, model } = mongoose;

// CẢNH BÁO: Mongoose mặc định strict:true nên field nào không khai báo ở đây sẽ bị âm thầm
// bỏ đi mỗi lần ghi. Collection users trong DB thật đang có đúng 11 field dưới đây —
// bớt một field là lần update sau xoá sạch nó khỏi document cũ.
const reservationSchema = new Schema(
  {
    tickers: { type: [String], default: [] },
    updatedAt: { type: Date },

    // Phần dưới được chốt ở lần Reserve ĐẦU TIÊN và không bao giờ đổi, kể cả khi hạng
    // của user trôi về sau. Thiếu `budget` nghĩa là chưa chốt — 7 user cũ đều ở trạng
    // thái này nên không cần migration.
    lockedRank: { type: Number },
    budget: { type: Number },
    allowedPools: { type: [String], default: undefined },

    // Giá cũng đông cứng cùng quyền lợi: nếu để giá trôi, user sửa lại lựa chọn vài
    // tuần sau có thể thấy giỏ cũ vượt ngân sách dù không đổi gì.
    lockedPrices: {
      type: [new Schema({ ticker: { type: String, required: true }, price: { type: Number, required: true } }, { _id: false })],
      default: undefined
    },
    totalValue: { type: Number }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, maxlength: MAX_EMAIL_LENGTH },

    // Mã mời 6 ký tự, dùng trong link /r/:code
    refCode: { type: String, required: true, unique: true },

    // Số thứ tự xác thực email, cấp bởi collection counters. Không bao giờ đổi.
    joinIndex: { type: Number, required: true },

    // score = joinIndex - BOOST * invites. Càng nhỏ hạng càng cao.
    // Đây là giá trị lưu sẵn, không tính lại: đổi BOOST về sau không làm thay đổi điểm đã cộng.
    score: { type: Number, required: true },

    invites: { type: Number, required: true, default: 0 },

    // Hai field dưới trỏ cùng một người mời: referrer giữ _id để join, referredBy giữ
    // refCode cho dễ tra bằng mắt trong mongosh.
    referrer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    referredBy: { type: String, default: null },

    // _id của những người đăng ký qua link mời của user này
    referees: { type: [Schema.Types.ObjectId], ref: 'User', default: () => [] },

    // Lựa chọn cổ phiếu ở màn hình Reserve; chọn lại thì ghi đè
    reservation: { type: reservationSchema, default: undefined },

    // Khai báo tay thay vì dùng timestamps:true, để document ghi mới có hình dạng
    // giống hệt các document đã có — không mọc thêm updatedAt ở cấp user.
    createdAt: { type: Date, required: true, default: Date.now }
  },
  { collection: 'users', versionKey: false }
);

// Trùng với index đã tồn tại trong DB: email_1, refCode_1, score_1_joinIndex_1.
// Hai index unique khai báo qua `unique: true` ở trên; đây là index phục vụ xếp hạng.
userSchema.index({ score: 1, joinIndex: 1 });

export const User = model('User', userSchema);
