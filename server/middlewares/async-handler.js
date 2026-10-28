// Express 4 không tự bắt lỗi của handler async, phải chuyển tay sang next().
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
