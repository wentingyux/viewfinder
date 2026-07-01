"""Build web assets for the Viewfinder site.

Outputs (all under ./images):
  images/photos/<name>.jpg   - web-optimized photos (max 1200px, used in the big display)
  images/reel-filled.png     - the reel with all 14 photos baked into its slots at 50% opacity
  images/manifest.json       - ordered photo list + per-slot angles the JS uses to drive rotation

Re-run any time the Photos folder or reel art changes:  python scripts/build_assets.py
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS_DIR = os.path.join(ROOT, "Photos")
ASSETS_DIR = os.path.join(ROOT, "assets")
OUT_DIR = os.path.join(ROOT, "images")
OUT_PHOTOS = os.path.join(OUT_DIR, "photos")
os.makedirs(OUT_PHOTOS, exist_ok=True)

# --- Reel geometry (measured from assets/reel.png) ---
REEL_CENTER = (528.3, 513.5)
REEL_RADIUS = 387.0
SLOT_COUNT = 14
ANGLE_OFFSET = 2.371              # degrees of the first slot
ANGLE_STEP = 360.0 / SLOT_COUNT   # 25.714 deg between slots
SLOT_FILL_PX = 140                # photo size pasted into each slot (matches the ~135px red placeholders)
SLOT_RADIUS = 24                  # rounded-corner radius so photos match the placeholder shape
SLOT_OPACITY = 0.50               # 50% -> faded vintage look on the reel

MAX_PHOTO_PX = 1200               # web display photos
JPEG_QUALITY = 82


def center_square(im):
    w, h = im.size
    s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def main():
    photos = sorted(os.listdir(PHOTOS_DIR))
    photos = [p for p in photos if p.lower().endswith((".jpg", ".jpeg", ".png"))]
    print(f"Found {len(photos)} photos")

    reel = Image.open(os.path.join(ASSETS_DIR, "reel.png")).convert("RGBA")
    cx, cy = REEL_CENTER
    manifest = {"slotCount": SLOT_COUNT, "angleStep": ANGLE_STEP, "photos": []}

    for i, name in enumerate(photos[:SLOT_COUNT]):
        # exif_transpose honors camera/phone orientation so portraits aren't sideways
        src = ImageOps.exif_transpose(Image.open(os.path.join(PHOTOS_DIR, name))).convert("RGB")

        # 1) web-optimized display photo
        disp = src.copy()
        disp.thumbnail((MAX_PHOTO_PX, MAX_PHOTO_PX), Image.LANCZOS)
        out_name = os.path.splitext(name)[0] + ".jpg"
        disp.save(os.path.join(OUT_PHOTOS, out_name), "JPEG", quality=JPEG_QUALITY, optimize=True)

        # 2) bake faded thumbnail into the reel slot
        ang = ANGLE_OFFSET + i * ANGLE_STEP
        rad = np.radians(ang)
        px = cx + REEL_RADIUS * np.cos(rad)
        py = cy + REEL_RADIUS * np.sin(rad)
        thumb = center_square(src).convert("RGBA").resize((SLOT_FILL_PX, SLOT_FILL_PX), Image.LANCZOS)
        # clip to a rounded rectangle matching the red placeholder, at 50% opacity
        mask = Image.new("L", (SLOT_FILL_PX, SLOT_FILL_PX), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, SLOT_FILL_PX - 1, SLOT_FILL_PX - 1], radius=SLOT_RADIUS, fill=255)
        thumb.putalpha(mask.point(lambda v: int(v * SLOT_OPACITY)))
        rot = thumb.rotate(-ang, expand=True, resample=Image.BICUBIC)
        reel.alpha_composite(rot, (int(px - rot.size[0] / 2), int(py - rot.size[1] / 2)))

        manifest["photos"].append({"file": "images/photos/" + out_name, "slotAngle": round(ang, 3)})
        print(f"  [{i:2d}] {name} -> {out_name}  (slot {ang:.1f}deg)")

    reel.save(os.path.join(OUT_DIR, "reel-filled.png"))
    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    # Also emit a JS global so the site works when opened directly via file:// (fetch is blocked there).
    with open(os.path.join(OUT_DIR, "manifest.js"), "w") as f:
        f.write("window.VIEWFINDER_MANIFEST = " + json.dumps(manifest) + ";\n")
    print("Wrote images/reel-filled.png, images/manifest.json, images/manifest.js")


if __name__ == "__main__":
    main()
