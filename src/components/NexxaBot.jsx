// Linh vật robot chữ N: lưới 14x20, mỗi ký tự là một ô vuông. k=viền, G=xanh, D=xanh đậm, w=trắng.
// Dùng chung cho trang Phần thưởng và thẻ Chương trình thưởng ở trang chính.
const BOT_GRID = [
  '......kk......', '......kG......', '..kkkkkkkkkk..', '.kGGGGGGGGGDk.',
  '.kGwwGGGGwwDk.', '.kGwkGGGGwkDk.', '.kGGGGGGGGGDk.', '.kGGGkkkkGGDk.',
  '..kkkkkkkkkk..', '..kGGGGGGGGk..', 'kkkGwGGGGwDkkk', 'kGkGwwGGGwDkGk',
  'kGkGwGwGGwDkGk', 'kkkGwGGwGwDkkk', '..kGwGGGwwDk..', '..kGwGGGGwDk..',
  '..kGGGGGGGDk..', '..kkkkkkkkkk..', '...kGk..kGk...', '...kkk..kkk...'
];
const BOT_FILL = { k: '#0B0D0C', G: '#00D100', D: '#009A00', w: '#FFFFFF' };
const BOT_PATHS = (() => {
  const p = { k: '', G: '', D: '', w: '' };
  BOT_GRID.forEach((row, y) => [...row].forEach((c, x) => { if (p[c] !== undefined) p[c] += `M${x} ${y}h1v1h-1z`; }));
  return p;
})();

export default function NexxaBot({ width = 84, className }) {
  return (
    <svg className={className} width={width} height={(width * 20) / 14} viewBox="0 0 14 20" shapeRendering="crispEdges" aria-hidden="true">
      {Object.keys(BOT_PATHS).map((k) => <path key={k} d={BOT_PATHS[k]} fill={BOT_FILL[k]} />)}
    </svg>
  );
}
