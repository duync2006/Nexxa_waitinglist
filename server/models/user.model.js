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

    // CŨ, không còn được ghi và không còn được đọc: trước đây quyền lợi chốt ở lần Reserve
    // đầu tiên. Giờ quyền lợi tính theo hạng hiện tại tới TOP_DEADLINE, sau đó đọc từ
    // user.final. Giữ khai báo để Mongoose (strict) không xoá dữ liệu cũ khỏi document.
    lockedRank: { type: Number },
    budget: { type: Number },
    allowedPools: { type: [String], default: undefined },

    // Giá đông cứng từ lúc chọn mã: nếu để giá trôi, user sửa lại lựa chọn vài tuần sau
    // có thể thấy giỏ cũ vượt ngân sách dù không đổi gì. Vẫn ghi như cũ.
    lockedPrices: {
      type: [new Schema({ ticker: { type: String, required: true }, price: { type: Number, required: true } }, { _id: false })],
      default: undefined
    },
    totalValue: { type: Number }
  },
  { _id: false }
);

// Kết quả chốt Top 1.000, do `npm run finalize` ghi một lần sau TOP_DEADLINE. Có field này
// thì quyền lợi đọc từ đây, không tính lại theo hạng nữa — đây cũng là bản ghi để đối soát
// lúc phát quà thật.
const finalSchema = new Schema(
  {
    early: { type: Boolean },
    // Hạng Top tại thời điểm chốt (vị trí theo RANK_ORDER trên toàn bộ user).
    topRank: { type: Number },
    inTop: { type: Boolean },
    budget: { type: Number },
    pools: { type: [String], default: undefined },
    finalizedAt: { type: Date },
    // Giỏ đang có không vừa quyền lợi đã chốt -> phải chọn lại trước REPICK_DEADLINE.
    needsRepick: { type: Boolean },
    repickedAt: { type: Date },
    // Quá hạn mà chưa chọn lại thì `npm run close-repick` tự cắt giỏ và ghi mốc này.
    autoTrimmedAt: { type: Date }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, maxlength: MAX_EMAIL_LENGTH },

    // Mã mời 6 ký tự, dùng trong link /r/:code
    refCode: { type: String, required: true, unique: true },

    // Số thứ tự xác thực email, cấp bởi collection counters. Không bao giờ đổi.
    // Không `required`: join() tạo user trước rồi mới xin số, để email trùng không tiêu số.
    // Trong khoảnh khắc đó user chưa có joinIndex nên mọi query xếp hạng/thống kê phải gộp
    // NUMBERED (xem waitlist.service.js).
    joinIndex: { type: Number },

    // score = joinIndex - BOOST * invites. CŨ: hạng giờ xếp theo invites (điểm), xem
    // RANK_ORDER trong waitlist.service.js. Vẫn giữ field để không xoá dữ liệu cũ.
    // Cũng được gán sau cùng với joinIndex nên không `required`.
    score: { type: Number },

    invites: { type: Number, required: true, default: 0 },

    // Hai field dưới trỏ cùng một người mời: referrer giữ _id để join, referredBy giữ
    // refCode cho dễ tra bằng mắt trong mongosh.
    referrer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    referredBy: { type: String, default: null },

    // _id của những người đăng ký qua link mời của user này
    referees: { type: [Schema.Types.ObjectId], ref: 'User', default: () => [] },

    // Lựa chọn cổ phiếu ở màn hình Reserve; chọn lại thì ghi đè
    reservation: { type: reservationSchema, default: undefined },

    // Quyền lợi đã chốt sau TOP_DEADLINE. KHÔNG có default: thiếu field nghĩa là chưa chốt,
    // và phaseOf() dựa vào đúng điều đó để phân biệt 'frozen' với 'repick'.
    final: { type: finalSchema },

    // Khai báo tay thay vì dùng timestamps:true, để document ghi mới có hình dạng
    // giống hệt các document đã có — không mọc thêm updatedAt ở cấp user.
    createdAt: { type: Date, required: true, default: Date.now }
  },
  { collection: 'users', versionKey: false }
);

// Trùng với index đã tồn tại trong DB: email_1, refCode_1, score_1_joinIndex_1.
// Hai index unique khai báo qua `unique: true` ở trên; đây là index phục vụ xếp hạng.
userSchema.index({ score: 1, joinIndex: 1 });
// Phục vụ xếp hạng theo điểm (rankOf, bảng xếp hạng).
userSchema.index({ invites: -1, joinIndex: 1 });
// Phục vụ đếm "đăng ký trong 24h qua" ở /api/stats, gọi lại mỗi 30 giây từ mọi tab đang mở.
userSchema.index({ createdAt: -1 });

export const User = model('User', userSchema);
