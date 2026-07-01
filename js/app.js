/* ===========================================================================
   Happy Birthday Akshara — Viewfinder interaction
     State 1: reel rests on top of the viewfinder; a green arrow hints "drag down".
     State 2: reel seated -> greeting + "press the lever" subtitle appear.
     State 3: each lever press advances the reel and shows the next photo
              (behind the viewfinder); the greeting hides once the first photo shows.
   =========================================================================== */
(async function () {
  "use strict";

  const stage    = document.getElementById("stage");
  const viewer   = document.getElementById("viewer");
  const reel     = document.getElementById("reel");
  const lever    = document.getElementById("lever");
  const target   = document.getElementById("slotTarget");
  const title    = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");
  const arrow    = document.getElementById("arrow");

  // --- manifest (photo order + slot angles), works on file:// via the JS global ---
  let manifest = window.VIEWFINDER_MANIFEST;
  if (!manifest) {
    try { manifest = await (await fetch("images/manifest.json")).json(); }
    catch (e) { manifest = { angleStep: 360 / 14, photos: [] }; console.error("manifest", e); }
  }
  const photos = manifest.photos || [];
  const STEP = manifest.angleStep || 360 / 14;
  photos.forEach((p) => { const im = new Image(); im.src = p.file; });

  /* ---- Scale the 1920x1080 stage to fit the viewport --------------------- */
  let SCALE = 1;
  function fit() {
    SCALE = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const x = (window.innerWidth - 1920 * SCALE) / 2;
    const y = (window.innerHeight - 1080 * SCALE) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${SCALE})`;
  }
  window.addEventListener("resize", fit);
  fit();

  let seated = false;
  let index = -1;
  let reelDeg = 0;
  let firstPhotoShown = false;
  let currentPhoto = null;   // the photo at "home" (behind the viewfinder), not yet pulled out
  let topZ = 20;             // stacking counter for photos dragged onto the page

  function rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---- Drag the reel down into the viewfinder ---------------------------- */
  let drag = null;

  reel.addEventListener("pointerdown", (e) => {
    if (seated) return;
    e.preventDefault();
    try { reel.setPointerCapture(e.pointerId); } catch (_) {}
    reel.classList.add("dragging");
    const m = new DOMMatrixReadOnly(getComputedStyle(reel).transform); // current translate (design px)
    drag = { startX: e.clientX, startY: e.clientY, tx: m.m41, ty: m.m42 };
  });

  reel.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / SCALE;   // viewport px -> design px
    const dy = (e.clientY - drag.startY) / SCALE;
    reel.style.transform = `translate(${drag.tx + dx}px, ${drag.ty + dy}px)`;
  });

  function near(a, b, tol) { return Math.hypot(a.x - b.x, a.y - b.y) < tol; }

  reel.addEventListener("pointerup", (e) => {
    if (!drag) return;
    try { reel.releasePointerCapture(e.pointerId); } catch (_) {}
    reel.classList.remove("dragging");
    const tol = target.getBoundingClientRect().width * 0.9 + reel.offsetWidth * SCALE * 0.25;
    if (near(rectCenter(reel), rectCenter(target), tol)) seatReel();
    else reel.style.transform = "";          // snap back to resting (on-top) position
    drag = null;
  });

  function seatReel() {
    seated = true;
    reel.style.transform = "";               // -> seated home via .seated rule
    reel.classList.add("seated");
    viewer.classList.add("armed");
    arrow.classList.add("hidden");
    title.classList.add("visible");
    subtitle.classList.add("visible");
  }

  /* ---- Lever press -> advance one photo ---------------------------------- */
  let busy = false;

  function advance() {
    if (!seated || busy || photos.length === 0) return;
    busy = true;

    lever.classList.add("press");
    window.setTimeout(() => lever.classList.remove("press"), 150);  // spring back

    index = (index + 1) % photos.length;
    reelDeg -= STEP;
    reel.style.setProperty("transition", "transform .45s cubic-bezier(.34,1.15,.5,1)");
    reel.style.transform = `rotate(${reelDeg}deg)`;

    if (!firstPhotoShown) {
      firstPhotoShown = true;
      title.classList.remove("visible");
      subtitle.classList.remove("visible");
    }

    // Replace the previous home photo only if it was never pulled out.
    if (currentPhoto && !currentPhoto._placed) currentPhoto.remove();
    currentPhoto = makePhoto(photos[index].file, index);

    window.setTimeout(() => { busy = false; }, 340);
  }

  /* ---- Photos: emerge from behind the viewfinder, drag out, stay placed ---- */
  function makePhoto(src, i) {
    const el = document.createElement("div");
    el.className = "photo";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Photo " + (i + 1);
    img.draggable = false;
    el.appendChild(img);

    // Close button (shown only once the photo is pulled out — see .placed)
    const close = document.createElement("button");
    close.type = "button";
    close.className = "photo-close";
    close.setAttribute("aria-label", "Remove photo");
    close.textContent = "×";
    close.addEventListener("pointerdown", (e) => e.stopPropagation());  // don't start a drag
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el === currentPhoto) currentPhoto = null;
      el.remove();
    });
    el.appendChild(close);

    el._tx = 0; el._ty = 0; el._placed = false;
    stage.appendChild(el);
    requestAnimationFrame(() => el.classList.add("shown"));   // emerge
    attachPhotoDrag(el);
    return el;
  }

  function attachPhotoDrag(el) {
    let d = null;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add("dragging");
      // First grab pulls it out from behind the viewfinder and to the front.
      if (!el._placed) {
        el._placed = true;
        el.classList.add("placed");        // reveals the × close button
        if (el === currentPhoto) currentPhoto = null;
      }
      el.style.zIndex = ++topZ;
      d = { startX: e.clientX, startY: e.clientY, tx: el._tx, ty: el._ty };
    });
    el.addEventListener("pointermove", (e) => {
      if (!d) return;
      el._tx = d.tx + (e.clientX - d.startX) / SCALE;
      el._ty = d.ty + (e.clientY - d.startY) / SCALE;
      el.style.transform = `translate(${el._tx}px, ${el._ty}px)`;
    });
    const end = (e) => {
      if (!d) return;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      el.classList.remove("dragging");      // stays exactly where dropped
      d = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  lever.addEventListener("click", advance);
  lever.tabIndex = 0;
  lever.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advance(); }
  });
})();
