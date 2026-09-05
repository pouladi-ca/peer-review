"""Synthetic grant-like PDF for extractor development: headers/footers, headings,
bold/italic/underline runs, list, a raster figure with caption, a table, two-column page."""

import io

import pymupdf
from PIL import Image, ImageDraw

doc = pymupdf.open()
W, H = 612, 792


def page_with_chrome(n):
    p = doc.new_page(width=W, height=H)
    p.insert_text((72, 40), "Contact PD/PI: Smith, Jane", fontsize=8, fontname="helv")
    p.insert_text((72, H - 30), f"Page {n}", fontsize=8, fontname="helv")
    p.insert_text((400, H - 30), "Tracking Number: GRANT13579", fontsize=8, fontname="helv")
    return p


# Page 1: title + Specific Aims with styled text
p = page_with_chrome(1)
p.insert_text((72, 90), "SPECIFIC AIMS", fontsize=14, fontname="hebo")
body = (
    "Mitochondrial dysfunction is a hallmark of Parkinson's disease (PD). "
    "We hypothesize that PINK1 loss impairs mitophagy in dopaminergic neurons. "
)
tw = pymupdf.TextWriter(p.rect)
tw.append((72, 120), body, font=pymupdf.Font("tiro"), fontsize=11)
tw.append((72, 136), "Aim 1. ", font=pymupdf.Font("tibo"), fontsize=11)
tw.append((110, 136), "Define the mechanism of ", font=pymupdf.Font("tiro"), fontsize=11)
tw.append((232, 136), "in vivo", font=pymupdf.Font("tiit"), fontsize=11)
tw.append((266, 136), " mitophagy failure (see Fig. 1).", font=pymupdf.Font("tiro"), fontsize=11)
tw.append((72, 152), "Aim 2. ", font=pymupdf.Font("tibo"), fontsize=11)
tw.append(
    (110, 152),
    "Test whether restoring PINK1 rescues neurons (Table 1).",
    font=pymupdf.Font("tiro"),
    fontsize=11,
)
tw.append((72, 176), "Underlined phrase here", font=pymupdf.Font("tiro"), fontsize=11)
tw.write_text(p)
# underline as a drawn line
p.draw_line((72, 178), (180, 178), width=0.7)
# hyphenated line break
tw2 = pymupdf.TextWriter(p.rect)
tw2.append(
    (72, 200), "This paragraph continues with a hyphen-", font=pymupdf.Font("tiro"), fontsize=11
)
tw2.append(
    (72, 214), "ated word across lines and ends here.", font=pymupdf.Font("tiro"), fontsize=11
)
tw2.append((72, 228), "-", font=pymupdf.Font("tiro"), fontsize=11)
tw2.append((72, 240), "• First bullet item", font=pymupdf.Font("tiro"), fontsize=11)
tw2.append((72, 254), "• Second bullet item", font=pymupdf.Font("tiro"), fontsize=11)
tw2.append((72, 280), "Superscript test: E=mc", font=pymupdf.Font("tiro"), fontsize=11)
tw2.append((188, 275), "2", font=pymupdf.Font("tiro"), fontsize=7)
tw2.write_text(p)
# Page 2: Research Strategy with a figure + caption + table
p = page_with_chrome(2)
p.insert_text((72, 90), "RESEARCH STRATEGY", fontsize=14, fontname="hebo")
p.insert_text((72, 112), "A. Significance", fontsize=12, fontname="hebo")
tw = pymupdf.TextWriter(p.rect)
tw.append(
    (72, 130),
    "Parkinson's disease affects 1% of people over 60. "
    "Preliminary data (Figure 1) show a 40% reduction.",
    font=pymupdf.Font("tiro"),
    fontsize=11,
)
tw.write_text(p)
img = Image.new("RGB", (400, 240), "white")
d = ImageDraw.Draw(img)
for i in range(6):
    d.rectangle([20 + i * 60, 240 - 20 - i * 30, 60 + i * 60, 220], fill=(200 - i * 20, 80, 60))
d.line([(10, 220), (390, 220)], fill="black", width=2)
buf = io.BytesIO()
img.save(buf, "PNG")
p.insert_image(pymupdf.Rect(72, 150, 372, 330), stream=buf.getvalue())
tw = pymupdf.TextWriter(p.rect)
tw.append(
    (72, 345),
    "Figure 1. Dopaminergic neuron counts decline with age in PINK1 knockout mice.",
    font=pymupdf.Font("tiro"),
    fontsize=9,
)
tw.write_text(p)
p.insert_text((72, 380), "B. Innovation", fontsize=12, fontname="hebo")
tw = pymupdf.TextWriter(p.rect)
tw.append(
    (72, 398),
    "Our approach is innovative because it combines single-cell profiling with",
    font=pymupdf.Font("tiro"),
    fontsize=11,
)
tw.append(
    (72, 412), "longitudinal imaging in the same animals.", font=pymupdf.Font("tiro"), fontsize=11
)
tw.write_text(p)
# table
x0, y0 = 72, 440
cw = [120, 100, 100]
rh = 18
rows = [
    ["Group", "N", "Survival (%)"],
    ["WT", "12", "95"],
    ["PINK1 KO", "12", "61"],
    ["KO + rescue", "10", "88"],
]
for r, row in enumerate(rows):
    x = x0
    for c, cell in enumerate(row):
        rect = pymupdf.Rect(x, y0 + r * rh, x + cw[c], y0 + (r + 1) * rh)
        p.draw_rect(rect, width=0.5)
        p.insert_text(
            (x + 4, y0 + r * rh + 13), cell, fontsize=9, fontname="hebo" if r == 0 else "helv"
        )
        x += cw[c]
tw = pymupdf.TextWriter(p.rect)
tw.append(
    (72, y0 + 4 * rh + 16),
    "Table 1. Survival at 12 months by group.",
    font=pymupdf.Font("tiro"),
    fontsize=9,
)
tw.write_text(p)
# vector figure (chart drawn with paths)
for i in range(5):
    p.draw_rect(
        pymupdf.Rect(380 + i * 30, 600 - i * 25, 400 + i * 30, 600),
        color=(0, 0, 0),
        fill=(0.3, 0.5, 0.8),
    )
p.draw_line((375, 600), (540, 600))
p.draw_line((375, 600), (375, 480))
p.insert_text((380, 615), "Figure 2. Vector bar chart.", fontsize=9, fontname="tiro")
# Page 3: two-column text
p = page_with_chrome(3)
p.insert_text((72, 90), "C. Approach", fontsize=12, fontname="hebo")
colL = [
    "Left column line one of the approach.",
    "Left column line two continues here.",
    "Left column line three ends the para.",
]
colR = [
    "Right column starts a new thought.",
    "Right column second line here.",
    "Right column third line closes.",
]
tw = pymupdf.TextWriter(p.rect)
for i, line in enumerate(colL):
    tw.append((72, 120 + i * 14), line, font=pymupdf.Font("tiro"), fontsize=11)
for i, line in enumerate(colR):
    tw.append((320, 120 + i * 14), line, font=pymupdf.Font("tiro"), fontsize=11)
tw.write_text(p)
doc.save("synthetic.pdf")
print("saved synthetic.pdf pages", len(doc))
