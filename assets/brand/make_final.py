# FINAL Namaste Facts logo: Palm Bulb (the joined palms are the bulb glass)
# with red sparks and a red energy shadow. Run: python3 make_final.py
import os
OUT = "/tmp/claude-0/final/out"
INK, CRIMSON, MARIGOLD, GOLD2, SNOW = "#13203F", "#C8102E", "#F5A623", "#E8901A", "#F3F6FA"
FONTS = "@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&amp;display=swap');"
M = 'transform="translate(200,0) scale(-1,1)"'          # mirror left hand -> right hand
def both(d, a=''): return f'<path d="{d}" {a}/><path d="{d}" {a} {M}/>'

PALM = "M100,4 C96,4 92,8 88,14 C74,32 46,52 40,84 C36,106 50,126 62,140 C66,144 68,148 68,152 L100,152 Z"  # one hand = half the glass
FINGER = "M86,34 C72,50 62,68 60,90"
THUMB = "M95,100 C87,110 86,124 90,140"

def spark(cx, cy, r, color):
    k = r * 0.22   # 4-point star
    return (f'<path d="M{cx},{cy-r} Q{cx+k},{cy-k} {cx+r},{cy} Q{cx+k},{cy+k} {cx},{cy+r} '
            f'Q{cx-k},{cy+k} {cx-r},{cy} Q{cx-k},{cy-k} {cx},{cy-r} Z" fill="{color}"/>')

def symbol(dark, uid="a"):
    """The logo mark in a 200x200 box."""
    base = SNOW if dark else INK
    s = (f'<defs><filter id="glow{uid}" x="-50%" y="-50%" width="200%" height="200%">'
         f'<feGaussianBlur stdDeviation="9"/></filter></defs>')
    g = ''
    # red energy: soft red glow + a solid red shadow behind the glass
    g += f'<g filter="url(#glow{uid})" opacity="{.75 if dark else .55}">' + both(PALM, f'fill="{CRIMSON}"') + '</g>'
    g += f'<g transform="translate(9,7)">' + both(PALM, f'fill="{CRIMSON}"') + '</g>'
    # the glass = two palms
    g += f'<path d="{PALM}" fill="{MARIGOLD}"/><path d="{PALM}" fill="{GOLD2}" {M}/>'
    g += (f'<g fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round">'
          + both(FINGER) + both(THUMB) + '<path d="M100,18 L100,140"/></g>')
    # screw base
    g += (f'<g fill="{base}"><rect x="68" y="154" width="64" height="10" rx="5"/>'
          f'<rect x="72" y="168" width="56" height="10" rx="5"/><path d="M84,182 h32 a16,10 0 0 1 -32,0z"/></g>')
    # red rays and sparks
    g += (f'<g stroke="{CRIMSON}" stroke-width="7" stroke-linecap="round">'
          '<path d="M38,22 L29,13"/><path d="M24,66 L12,62"/><path d="M176,66 L188,62"/></g>')
    g += spark(162, 20, 17, CRIMSON) + spark(100, -12, 9, CRIMSON) + spark(182, 108, 8, MARIGOLD) + spark(18, 112, 7, CRIMSON)
    return s + f'<g transform="translate(0,12)">{g}</g>'

def svg(w, h, body, bg):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f'<style>{FONTS}</style><rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>\n')

def pill(x, y, size, anchor="start"):
    """Red 'नेपाली' label for the Nepali channel."""
    w, h = size * 3.3, size * 1.45
    x0 = x - w/2 if anchor == "middle" else x
    return (f'<rect x="{x0:.0f}" y="{y-h*0.72:.0f}" width="{w:.0f}" height="{h:.0f}" rx="{h/2:.0f}" fill="{CRIMSON}"/>'
            f'<text x="{x0+w/2:.0f}" y="{y+size*0.12:.0f}" text-anchor="middle" font-family="\'Baloo 2\'" '
            f'font-weight="800" font-size="{size}" fill="#fff">नेपाली</text>')

def profile(dark, ne):
    bg = INK if dark else SNOW
    if ne:   # symbol slightly higher, label at the bottom, all inside the circle crop
        body = f'<g transform="translate(540,478) scale(3.1) translate(-100,-100)">{symbol(dark)}</g>' + pill(540, 918, 66, "middle")
    else:
        body = f'<g transform="translate(540,530) scale(3.6) translate(-100,-100)">{symbol(dark)}</g>'
    return svg(1080, 1080, body, bg)

def banner(W, H, dark, ne, sym_px, name_px):
    """Symbol + name + tagline, centred, kept inside the platform safe area."""
    bg = INK if dark else SNOW
    fg = SNOW if dark else INK
    acc = MARIGOLD if dark else CRIMSON
    k = name_px / 150                       # everything scales from the name size
    tw = (985 + (250 if ne else 0)) * k     # measured text width
    gap = 48 * k
    total = sym_px + gap + tw
    x0, cy = W/2 - total/2, H/2
    tx = x0 + sym_px + gap
    s = sym_px / 200
    b = f'<g transform="translate({x0+sym_px/2:.0f},{cy:.0f}) scale({s:.3f}) translate(-100,-100)">{symbol(dark)}</g>'
    b += (f'<text x="{tx:.0f}" y="{cy-8*k:.0f}" font-family="\'Baloo 2\'" font-weight="800" font-size="{name_px}" '
          f'fill="{fg}" letter-spacing="{-1.5*k:.1f}">Namaste <tspan fill="{acc}">Facts</tspan></text>')
    if ne: b += pill(tx + 1010*k, cy - 56*k, 64*k)
    b += (f'<text x="{tx+6*k:.0f}" y="{cy+72*k:.0f}" font-family="\'Baloo 2\'" font-weight="600" font-size="{50*k:.0f}" fill="{fg}" opacity=".85">Small facts, big wonder</text>'
          f'<text x="{tx+6*k:.0f}" y="{cy+136*k:.0f}" font-family="\'Baloo 2\'" font-weight="600" font-size="{50*k:.0f}" fill="{fg}" opacity=".85">सानो तथ्य, ठूलो अचम्म</text>')
    return svg(W, H, b, bg)

os.makedirs(OUT, exist_ok=True)
for lang in ("english", "nepali"):
    ne = lang == "nepali"
    for mode in ("light", "dark"):
        dark = mode == "dark"
        open(f"{OUT}/profile-{lang}-{mode}.svg", "w").write(profile(dark, ne))
        # YouTube 2560x1440: safe area is the centre 1546x423
        open(f"{OUT}/banner-youtube-{lang}-{mode}.svg", "w").write(banner(2560, 1440, dark, ne, 360, 132 if not ne else 116))
        # Facebook cover 1640x624: phones cut the sides, so keep it in the middle ~1100px
        open(f"{OUT}/banner-facebook-{lang}-{mode}.svg", "w").write(banner(1640, 624, dark, ne, 250, 92 if not ne else 80))
    # transparent symbol for videos/watermarks
    open(f"{OUT}/symbol-{lang}-only.svg" if False else f"{OUT}/symbol-on-light.svg", "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 240 240" width="1000" height="1000">{symbol(False)}</svg>\n')
    open(f"{OUT}/symbol-on-dark.svg", "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 240 240" width="1000" height="1000">{symbol(True)}</svg>\n')
print("ok")
