import { useEffect, useState } from 'react';

// Sau khi nhấc tay, chờ quán tính cuộn của trình duyệt lắng xuống rồi mới chạy tiếp,
// nếu không thì hai bên cùng đẩy scrollLeft và chuyển động bị giật.
const RESUME_DELAY = 1200;

/**
 * Dải trượt ngang vô tận. Trả về hai ref: gắn `scrollRef` vào khung cuộn, `trackRef` vào
 * dải bên trong — dải phải chứa ĐÚNG HAI nhóm giống hệt nhau, vì vòng lặp hoạt động bằng
 * cách trừ đi bề rộng nhóm đầu khi cuộn hết nó, nên nhóm thứ hai phải đang lấp chỗ trống.
 *
 * Dùng requestAnimationFrame chứ không phải CSS animation: cần dừng lại đúng chỗ đang
 * trượt khi người dùng chạm vào, rồi chạy tiếp từ đó — CSS animation chỉ tua lại từ đầu.
 *
 * Hai ref trả về là CALLBACK REF giữ node trong state, không phải useRef. Lý do: component
 * gọi hook có thể chưa render dải ngay lúc mount — JoinTicker trả null cho tới khi
 * /api/stats về. Với useRef thì effect chạy một lần lúc mount, gặp ref rỗng rồi thoát, và
 * không bao giờ chạy lại vì danh sách phụ thuộc không đổi — dải hiện ra nhưng đứng im.
 * Để node trong state thì nó vào thẳng danh sách phụ thuộc, node gắn vào là effect chạy lại.
 *
 * @param {number} speed px mỗi giây
 */
export function useMarquee(speed) {
  const [el, setEl] = useState(null);
  const [track, setTrack] = useState(null);

  useEffect(() => {
    if (!el || !track) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let paused = false;
    let resumeTimer = 0;
    let raf = 0;
    let last = performance.now();
    // Vị trí thật, giữ ở dạng số thực. el.scrollLeft chỉ là nơi ĐỔ kết quả ra.
    let pos = el.scrollLeft;

    const pause = () => {
      paused = true;
      clearTimeout(resumeTimer);
    };
    const resumeLater = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        // Đồng bộ lại từ DOM đúng một lần ở đây: người dùng vừa tự vuốt dải đi chỗ khác,
        // chạy tiếp từ `pos` cũ sẽ làm dải nhảy ngược về vị trí trước khi họ chạm vào.
        pos = el.scrollLeft;
        paused = false;
      }, RESUME_DELAY);
    };

    const step = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!paused) {
        // Đo bề rộng nhóm mỗi khung hình thay vì tính sẵn: số mục, bề rộng thẻ hay gap đổi
        // thì điểm nối vẫn khớp, không phải sửa lại phép tính ở chỗ khác.
        const groupWidth = track.firstElementChild?.getBoundingClientRect().width ?? 0;
        if (groupWidth > 0) {
          // Cộng dồn vào `pos`, TUYỆT ĐỐI không đọc lại el.scrollLeft rồi cộng tiếp.
          // Safari trên iOS làm tròn scrollLeft về số nguyên, nên vòng đọc-cộng-ghi sẽ
          // chết đứng với mọi tốc độ dưới 60px/s: 55px/s là 0.92px mỗi khung, ghi vào
          // bị làm tròn xuống đúng giá trị cũ, khung sau đọc ra vẫn con số đó. Dải đứng
          // im, thỉnh thoảng rớt khung làm dt vọt lên thì nhích một cái rồi lại kẹt.
          pos += speed * dt;
          if (pos >= groupWidth) pos -= groupWidth;
          el.scrollLeft = pos;
        }
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // Chạm để dừng, nhấc tay thì chạy lại. Dùng pointer event nên phủ cả chuột lẫn ngón tay,
    // và không dựa vào :hover — trên màn hình cảm ứng :hover bám dính sau khi chạm.
    el.addEventListener('pointerdown', pause);
    el.addEventListener('pointerup', resumeLater);
    el.addEventListener('pointercancel', resumeLater);
    el.addEventListener('touchstart', pause, { passive: true });
    el.addEventListener('touchend', resumeLater, { passive: true });
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resumeLater);

    const hoverable = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onEnter = () => { if (hoverable.matches) pause(); };
    const onLeave = () => { if (hoverable.matches) resumeLater(); };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resumeTimer);
      el.removeEventListener('pointerdown', pause);
      el.removeEventListener('pointerup', resumeLater);
      el.removeEventListener('pointercancel', resumeLater);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('touchend', resumeLater);
      el.removeEventListener('focusin', pause);
      el.removeEventListener('focusout', resumeLater);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [speed, el, track]);

  return { scrollRef: setEl, trackRef: setTrack };
}
