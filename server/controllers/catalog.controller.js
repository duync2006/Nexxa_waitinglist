import * as catalog from '../services/catalog.service.js';

// Danh mục công khai: cổ phiếu, nhóm, số suất, bậc quà. Không cần email, không lọc theo ai.
export async function get(_req, res) {
  res.json(await catalog.getCatalog());
}
