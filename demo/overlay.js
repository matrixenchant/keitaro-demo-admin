// Оверлей для демо-записи: нарисованный курсор, ripple на клик и подписи шагов.
// Внедряется через page.addInitScript — работает на каждой загрузке документа.
// Курсор следует за реальными событиями мыши, поэтому hover-эффекты приложения срабатывают честно.
(() => {
  if (window.__demo) return;
  const ACCENT = "#4b9a51";

  const css = `
    #__demo-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;
      width:28px;height:28px;transform:translate(-200px,-200px);will-change:transform;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,.28)) drop-shadow(0 6px 14px rgba(0,0,0,.18));}
    #__demo-cursor svg{display:block;width:28px;height:28px;transform-origin:3px 2px;transition:transform .12s ease-out;}
    #__demo-cursor.down svg{transform:scale(.82);}
    .__demo-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:64px;height:64px;margin:-32px 0 0 -32px;
      border-radius:50%;border:2px solid ${ACCENT};background:rgba(75,154,81,.22);
      animation:__demo-ripple .6s cubic-bezier(.2,.7,.3,1) forwards;}
    @keyframes __demo-ripple{from{transform:scale(.15);opacity:.95}to{transform:scale(1);opacity:0}}
    #__demo-caption{position:fixed;left:50%;bottom:28px;z-index:2147483645;pointer-events:none;
      max-width:620px;padding:14px 22px 15px;border-radius:18px;
      background:rgba(22,22,24,.82);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);
      box-shadow:0 10px 30px rgba(0,0,0,.22),inset 0 0 0 1px rgba(255,255,255,.08);
      color:#fff;font:600 17px/1.35 Inter,-apple-system,"Segoe UI",system-ui,sans-serif;letter-spacing:-.01em;
      opacity:0;transform:translate(-50%,12px);transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1);}
    #__demo-caption.on{opacity:1;transform:translate(-50%,0);}
    #__demo-caption .sub{display:block;margin-top:3px;font-weight:450;font-size:14px;color:rgba(255,255,255,.72);}
    #__demo-caption .num{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;margin-right:10px;
      padding:0 7px;border-radius:12px;background:${ACCENT};font-size:13px;vertical-align:1px;}
  `;

  const arrow = `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 2.5 L4 21.5 L8.9 17.1 L12.2 24.6 L15.6 23.1 L12.4 15.8 L19.2 15.6 Z"
      fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  let cursor, caption, x = -200, y = -200;

  function mount() {
    if (document.getElementById("__demo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
    cursor = document.createElement("div");
    cursor.id = "__demo-cursor";
    cursor.innerHTML = arrow;
    document.documentElement.appendChild(cursor);
    caption = document.createElement("div");
    caption.id = "__demo-caption";
    document.documentElement.appendChild(caption);
    place(x, y);
  }

  // кончик стрелки — в точке (3, 2) svg
  function place(nx, ny) {
    x = nx; y = ny;
    if (cursor) cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
  }

  addEventListener("mousemove", (e) => place(e.clientX, e.clientY), true);
  addEventListener("mousedown", (e) => {
    cursor?.classList.add("down");
    const r = document.createElement("div");
    r.className = "__demo-ripple";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }, true);
  addEventListener("mouseup", () => cursor?.classList.remove("down"), true);

  let hideTimer;
  window.__demo = {
    place,
    caption(num, title, sub) {
      if (!caption) mount();
      clearTimeout(hideTimer);
      const show = () => {
        caption.innerHTML = (num ? `<span class="num">${num}</span>` : "") + title + (sub ? `<span class="sub">${sub}</span>` : "");
        caption.classList.add("on");
      };
      if (caption.classList.contains("on")) {
        caption.classList.remove("on");
        hideTimer = setTimeout(show, 420);
      } else show();
    },
    hideCaption() { caption?.classList.remove("on"); },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
