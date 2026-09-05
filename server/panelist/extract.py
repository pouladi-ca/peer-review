"""PDF → reflowable document model.

`build_document` turns the selected pages of a proposal PDF into the `doc.json`
structure described in SPEC.md: a flat list of blocks (headings, paragraphs,
list items, figure cards) whose text carries bold / italic / underline /
super- and subscript runs, plus the figures and tables cut out of the pages as
images, and a table of contents derived from the headings.

Everything here is heuristic. The heuristics are tuned for typed proposals
(NIH, NSF, CIHR, foundations): single- or two-column body text, a dominant
body font size, headings set larger or bold, running headers and footers that
repeat from page to page, figures that are raster images or clusters of
vector drawings, and ruled tables.
"""

from __future__ import annotations

import re
import struct
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

if hasattr(pymupdf, "no_recommend_layout"):
    pymupdf.no_recommend_layout()  # the optional layout package is not used here

Progress = Callable[[int, int, str], None]
PROGRESS_PHASES = 2  # phase 1 reads the pages, phase 2 lays them out

# --- tunables ----------------------------------------------------------------

HEADER_ZONE = 0.075  # fraction of page height treated as running header
FOOTER_ZONE = 0.925  # ... and footer
HEADING_SIZE_RATIO = 1.12  # span size / body size that makes a line a heading
MAX_HEADING_CHARS = 120
MIN_FIGURE_AREA_FRAC = 0.012  # vector clusters smaller than this are decoration
FIGURE_MERGE_GAP = 10.0  # pt; nearby regions become one figure
CAPTION_GAP = 34.0  # pt; max distance between a region and its caption
RENDER_MAX_WIDTH_PX = 2000
RENDER_SCALE = 3.0  # 216 dpi

MAJOR_SECTIONS = [
    "specific aims",
    "research strategy",
    "research plan",
    "research design and methods",
    "bibliography",
    "bibliography and references cited",
    "references cited",
    "references",
    "literature cited",
    "budget justification",
    "biographical sketch",
    "biosketch",
    "facilities",
    "facilities and other resources",
    "facilities & other resources",
    "equipment",
    "project summary",
    "project summary/abstract",
    "project narrative",
    "abstract",
    "project description",
    "data management plan",
    "data management and sharing plan",
    "resource sharing plan",
    "letters of support",
    "human subjects",
    "protection of human subjects",
    "vertebrate animals",
    "timeline",
    "multiple pd/pi leadership plan",
    "authentication of key biological and/or chemical resources",
    "progress report",
    "summary of progress",
    "introduction to application",
    "lay summary",
    "lay abstract",
    "scientific abstract",
    "research proposal",
]
MINOR_SECTIONS = [
    "significance",
    "innovation",
    "approach",
    "background",
    "background and significance",
    "preliminary studies",
    "preliminary data",
    "preliminary results",
    "rigor",
    "scientific rigor",
    "rigor and reproducibility",
    "introduction",
    "hypothesis",
    "rationale",
    "objectives",
    "methods",
    "methodology",
    "expected outcomes",
    "potential problems and alternative strategies",
    "potential pitfalls",
    "future directions",
    "broader impacts",
    "intellectual merit",
    "aims",
    "overview",
    "milestones",
    "statistical analysis",
    "power analysis",
    "sex as a biological variable",
]
AIM_RE = re.compile(r"^(specific\s+)?(sub-?)?aims?\s*\d+[a-z]?\b", re.I)
NUMBERED_RE = re.compile(
    r"^(\d+(\.\d+)*\.?|[A-Z]\d*(\.\d+)*\.|[IVX]+\.|\(?[a-z]\))\s+\S|^([A-Z]\d*(\.\d+)*|\d+(\.\d+)*)\.(?=[A-Z])"
)
NUMBER_PREFIX_RE = re.compile(r"^(\d+(\.\d+)*|[A-Z]\d*(\.\d+)*|[IVX]+)(?:[.)]\s*|\s+)(?=\S)")
LIST_RE = re.compile(r"^([•·▪▫◦●○■□‣⁃➢➤►\-–—*]|\(?\d{1,2}[.)]|\(?[a-zA-Z][.)]|[ivx]{1,4}[.)])\s+")
CAPTION_RE = re.compile(
    r"^(fig(?:ure)?s?\.?|table|scheme|supplementary\s+fig(?:ure)?)\s*(\d+)", re.I
)
# a caption opens with the label and a number followed by punctuation or a capitalised word
CAPTION_START_RE = re.compile(
    r"^(fig(?:ure)?\.?|table|scheme|supplementary\s+fig(?:ure)?)\s*(\d+)(?:\s*[.:|—–-]|\s+[A-Z]|\s*$)",
    re.I,
)
FIGREF_RE = re.compile(
    r"\b(?:Fig(?:ure)?s?\.?|FIG\.?|FIGURE)\s?(\d+)[A-Za-z]?\b|\b(?:Table|TABLE)s?\s?(\d+)\b"
)
HF_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"^page\s+\d+(\s+of\s+\d+)?$",
        r"^\d{1,3}$",
        r"^-?\s*\d{1,3}\s*-?$",
        r"^(contact\s+)?pd/p[il]\b",
        r"^tracking\s+number",
        r"^omb\s+(no|number)",
        r"^[a-z][a-z &/()'’\-]{2,50}\s+page\s+\d+$",
        r"^funding\s+opportunity",
        r"^(received|expiration)\s+date",
        r"^principal investigator",
        r"^application\s+(number|id)",
        r"^(page\s+)?\d+\s+of\s+\d+$",
        r"^confidential$",
        r"^draft$",
    )
]
TERMINAL = '.!?:;"”’)]'
SYMBOL_BULLETS = {"": "•", "": "▪", "": "➢", "": "❖", "": "✓", "": "□", "": "•"}


# --- ligature repair -----------------------------------------------------------

LIGATURE_CANDIDATES = ("ti", "tt", "tf", "ft", "fi", "fl", "ff", "ffi", "ffl", "fj", "st", "ct")
STANDARD_LIGATURES = {"ff", "fi", "fl", "ffi", "ffl"}
REPLACEMENT = "\ufffd"


def _u16(b: bytes, o: int) -> int:
    return struct.unpack_from(">H", b, o)[0]


def _u32(b: bytes, o: int) -> int:
    return struct.unpack_from(">I", b, o)[0]


def font_advances(font: bytes) -> dict[int, int] | None:
    """Glyph id -> advance width in 1/1000 em, read from a TrueType font's hmtx table."""
    if len(font) < 12:
        return None
    off = _u32(font, 12) if font[:4] == b"ttcf" else 0
    tables: dict[str, tuple[int, int]] = {}
    for i in range(_u16(font, off + 4)):
        rec = off + 12 + 16 * i
        if rec + 16 > len(font):
            return None
        tables[font[rec : rec + 4].decode("latin-1")] = (_u32(font, rec + 8), _u32(font, rec + 12))
    if not {"head", "hhea", "hmtx"} <= tables.keys():
        return None
    upem = _u16(font, tables["head"][0] + 18) or 1000
    count = _u16(font, tables["hhea"][0] + 34)
    hmtx = tables["hmtx"][0]
    out = {}
    for gid in range(count):
        o = hmtx + 4 * gid
        if o + 2 > len(font):
            break
        out[gid] = round(_u16(font, o) * 1000 / upem)
    return out


def ligature_candidates(width: int, letters: dict[str, int]) -> list[str]:
    """Letter pairs whose advance widths add up to a ligature glyph of `width`, best first.
    Ligatures run a little narrower than their parts (the pair is kerned), never wider."""
    scored: list[tuple[int, int, str]] = []
    for cand in LIGATURE_CANDIDATES:
        if any(c not in letters for c in cand):
            continue
        total = sum(letters[c] for c in cand)
        slack = total - width
        if -0.03 * total <= slack <= 0.12 * total:
            # ligatures with a Unicode code point of their own (ff, fi, fl, ffi, ffl) are
            # the ones a ToUnicode map does cover; an undefined glyph is more likely a "ti"
            scored.append((1 if cand in STANDARD_LIGATURES else 0, abs(slack), cand))
    scored.sort()
    return [c for _, _, c in scored]


def ink_heights(page: pymupdf.Page, bbox: tuple) -> tuple[float, float] | None:
    """Ink height of the left and right halves of a glyph box, in pixels at 8x. The box
    from the text trace already spans ascender to descender, so it is rendered as is;
    rows of ink that cross the whole box (a table rule, an underline) are ignored."""
    rect = pymupdf.Rect(bbox) & page.rect
    if rect.is_empty or rect.width < 1 or rect.height < 1:
        return None
    try:
        pix = page.get_pixmap(matrix=pymupdf.Matrix(8, 8), clip=rect, colorspace=pymupdf.csGRAY)
    except Exception:
        return None
    w, h, buf = pix.width, pix.height, pix.samples
    if w < 4 or h < 4:
        return None
    rows = []
    for y in range(h):
        row = buf[y * w : (y + 1) * w]
        ink = [v < 128 for v in row]
        rows.append(ink if sum(ink) < 0.9 * w else [False] * w)

    def height(x0: int, x1: int) -> float:
        ys = [y for y in range(h) if any(rows[y][x0:x1])]
        return float(ys[-1] - ys[0] + 1) if ys else 0.0

    return height(0, w // 2), height(w - w // 2, w)


def classify_ligature(
    width: int,
    letters: dict[str, int],
    after: str,
    shape: tuple[float, float] | None,
) -> str | None:
    """Which letter pair a ligature glyph stands for. Width narrows the field; "tt", "ft"
    and "tf" weigh the same once kerned, so their glyph shape decides: an "f" ascender is
    taller than a "t", so the taller half says where the "f" is."""
    cands = ligature_candidates(width, letters)
    if not cands:
        return None
    if len(cands) == 1 or not {cands[0], cands[1]} <= {"tt", "ft", "tf"}:
        return cands[0]
    if shape and min(shape) > 0:
        left, right = shape
        if left > right * 1.12:
            return "ft"
        if right > left * 1.12:
            return "tf"
        return "tt"
    return "tf" if after[:2] in ("or", "ol", "it") else "tt"


class LigatureResolver:
    """Recovers the letters behind ligature glyphs that a PDF's ToUnicode map leaves
    undefined (Word writes Calibri's "ti", "tt", "tf" and "ft" that way). The embedded
    subset font still records every glyph's advance width, and the same font's ordinary
    letters on the page tell us what "t", "i" and "f" measure; the ligature is whichever
    pair adds up to its width."""

    def __init__(self, doc: pymupdf.Document):
        self.doc = doc
        self._advances: dict[str, dict[int, int] | None] = {}
        self._letters: dict[str, dict[str, int]] = defaultdict(dict)  # font -> letter -> width
        self.unresolved = 0

    def _advances_for(self, page: pymupdf.Page, fontname: str) -> dict[int, int] | None:
        if fontname not in self._advances:
            adv = None
            for f in self.doc.get_page_fonts(page.number):
                if f[3] == fontname:
                    try:
                        buf = self.doc.extract_font(f[0])[3]
                        adv = font_advances(buf) if buf else None
                    except Exception:
                        adv = None
                    break
            self._advances[fontname] = adv
        return self._advances[fontname]

    def fixes_for(self, page: pymupdf.Page) -> dict[tuple[str, int, int], str]:
        """{(font, x*10, y*10): letters} for every replacement character on the page."""
        try:
            trace = page.get_texttrace()
        except Exception:
            return {}
        pending: list[tuple[str, int, tuple, tuple, str]] = []
        for span in trace:
            font = span.get("font", "")
            chars = span.get("chars", ())
            adv = self._advances_for(page, font)
            letters = self._letters[font]
            for i, ch in enumerate(chars):
                code, gid = ch[0], ch[1]
                if code == 0xFFFD:
                    after = "".join(chr(c[0]) for c in chars[i + 1 : i + 4] if c[0] != 0xFFFD)
                    pending.append((font, gid, ch[2], ch[3], after.lower()))
                elif adv and 32 < code < 0x2000 and gid in adv:
                    letters.setdefault(chr(code), adv[gid])
        fixes: dict[tuple[str, int, int], str] = {}
        for font, gid, origin, bbox, after in pending:
            adv = self._advances_for(page, font)
            guess = None
            if adv and gid in adv:
                letters = self._letters[font]
                shape = None
                if len(ligature_candidates(adv[gid], letters)) > 1:
                    shape = ink_heights(page, bbox)
                guess = classify_ligature(adv[gid], letters, after, shape)
            if guess is None:
                self.unresolved += 1
                guess = "ti"  # by far the commonest of Word's undefined ligatures
            fixes[(font, int(round(origin[0] * 10)), int(round(origin[1] * 10)))] = guess
        return fixes


# --- low-level structures ----------------------------------------------------


@dataclass
class Span:
    text: str
    size: float
    bold: bool
    italic: bool
    bbox: pymupdf.Rect
    origin_y: float
    sup: bool = False
    sub: bool = False
    underline: bool = False

    @property
    def style(self) -> tuple:
        return (self.bold, self.italic, self.underline, self.sup, self.sub)


@dataclass
class Line:
    spans: list[Span]
    bbox: pymupdf.Rect
    block_no: int
    excluded: bool = False

    @property
    def text(self) -> str:
        return "".join(s.text for s in self.spans)

    @property
    def size(self) -> float:
        """Size of the dominant (longest) non-script span."""
        cands = [s for s in self.spans if not (s.sup or s.sub) and s.text.strip()] or self.spans
        return max(cands, key=lambda s: len(s.text.strip())).size

    @property
    def all_bold(self) -> bool:
        ss = [s for s in self.spans if s.text.strip()]
        return bool(ss) and all(s.bold for s in ss)


@dataclass
class Para:
    lines: list[Line]
    page: int
    kind: str = "paragraph"  # paragraph | heading | list-item
    level: int = 0
    col: int = 0  # 0 full width, 1 left, 2 right

    @property
    def bbox(self) -> pymupdf.Rect:
        r = pymupdf.Rect(self.lines[0].bbox)
        for ln in self.lines[1:]:
            r |= ln.bbox
        return r

    @property
    def text(self) -> str:
        return join_lines([ln.text for ln in self.lines])

    @property
    def size(self) -> float:
        return max(ln.size for ln in self.lines)


@dataclass
class Region:
    """A figure or table cut out of a page."""

    rect: pymupdf.Rect
    kind: str  # figure | table | page
    page: int
    caption: str = ""
    label: str = ""
    number: int | None = None
    col: int = 0
    absorb: bool = True  # text inside the region belongs to the picture


@dataclass
class PageData:
    number: int
    lines: list[Line]
    regions: list[Region]
    width: float
    height: float
    hrules: list[pymupdf.Rect] = field(default_factory=list)
    scanned: bool = False  # a page image with an OCR text layer


# --- text helpers ------------------------------------------------------------


def span_text(sp: dict, fixes: dict[tuple[str, int, int], str]) -> str:
    """Text of a dict or rawdict span, with undefined ligature glyphs replaced."""
    if "chars" not in sp:
        return sp["text"]
    font = sp.get("font", "")
    out = []
    for ch in sp["chars"]:
        c = ch["c"]
        if c == REPLACEMENT:
            ox, oy = ch["origin"]
            c = fixes.get((font, int(round(ox * 10)), int(round(oy * 10))), "ti")
        out.append(c)
    return "".join(out)


def clean_text(s: str) -> str:
    s = s.replace("­", "")  # soft hyphen
    s = s.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff")
    s = s.replace("ﬃ", "ffi").replace("ﬄ", "ffl")
    for k, v in SYMBOL_BULLETS.items():
        s = s.replace(k, v)
    return s.replace("\t", " ").replace(" ", " ")


def join_lines(texts: list[str]) -> str:
    out = ""
    for t in texts:
        t = t.strip()
        if not t:
            continue
        if not out:
            out = t
            continue
        if out.endswith("-") and len(out) > 1 and out[-2].isalpha() and t[:1].islower():
            out = out[:-1] + t  # de-hyphenate a broken word
        else:
            out = out + " " + t
    return re.sub(r"[ ]{2,}", " ", out)


def normalize_hf(text: str) -> str:
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", text.strip().lower()))


def ends_sentence(text: str) -> bool:
    return bool(text) and text.rstrip()[-1] in TERMINAL


def is_known_section(text: str) -> int:
    """0 = no, 1 = major section name, 2 = minor section name."""
    t = NUMBER_PREFIX_RE.sub("", text.strip().rstrip(":."))
    t = re.sub(r"\s+", " ", t).lower()
    if t in MAJOR_SECTIONS:
        return 1
    if t in MINOR_SECTIONS or AIM_RE.match(text.strip()):
        return 2
    return 0


def rect_of(v) -> pymupdf.Rect:
    return pymupdf.Rect(v)


def overlap_frac(a: pymupdf.Rect, b: pymupdf.Rect) -> float:
    """Fraction of `a` that lies inside `b`."""
    if a.is_empty or a.get_area() == 0:
        return 0.0
    inter = a & b
    return 0.0 if inter.is_empty else inter.get_area() / a.get_area()


def rect_gap(a: pymupdf.Rect, b: pymupdf.Rect) -> float:
    """Distance between two rects (0 when they touch or overlap)."""
    dx = max(0.0, max(a.x0 - b.x1, b.x0 - a.x1))
    dy = max(0.0, max(a.y0 - b.y1, b.y0 - a.y1))
    return max(dx, dy)


def h_overlap(a: pymupdf.Rect, b: pymupdf.Rect) -> float:
    w = min(a.x1, b.x1) - max(a.x0, b.x0)
    return max(0.0, w) / max(1.0, min(a.width, b.width))


# --- page analysis -----------------------------------------------------------


def read_page(
    page: pymupdf.Page, number: int, resolver: LigatureResolver | None = None
) -> PageData:
    w, h = page.rect.width, page.rect.height
    flags = (
        pymupdf.TEXT_PRESERVE_LIGATURES
        | pymupdf.TEXT_PRESERVE_WHITESPACE
        | pymupdf.TEXT_MEDIABOX_CLIP
    )
    raw = page.get_text("dict", flags=flags)
    fixes: dict[tuple[str, int, int], str] = {}
    if resolver is not None and any(
        REPLACEMENT in sp["text"]
        for b in raw["blocks"]
        if b.get("type") == 0
        for ln in b["lines"]
        for sp in ln["spans"]
    ):
        fixes = resolver.fixes_for(page)
        raw = page.get_text("rawdict", flags=flags)  # per-character origins locate each fix
    lines: list[Line] = []
    for bno, block in enumerate(raw["blocks"]):
        if block.get("type") != 0:
            continue
        block_lines: list[Line] = []
        for ln in block["lines"]:
            spans: list[Span] = []
            for sp in ln["spans"]:
                text = clean_text(span_text(sp, fixes))
                if not text:
                    continue
                font = sp.get("font", "")
                flags = sp.get("flags", 0)
                fl = font.lower()
                bold = bool(flags & 16) or any(
                    k in fl for k in ("bold", "black", "heavy", "semibold", "demibold", "extrabold")
                )
                italic = bool(flags & 2) or any(k in fl for k in ("italic", "oblique"))
                spans.append(
                    Span(
                        text=text,
                        size=float(sp["size"]),
                        bold=bold,
                        italic=italic,
                        bbox=rect_of(sp["bbox"]),
                        origin_y=float(sp["origin"][1]),
                        sup=bool(flags & 1),
                    )
                )
            if not spans or not "".join(s.text for s in spans).strip():
                continue
            smooth_styles(spans)
            block_lines.append(Line(spans=spans, bbox=rect_of(ln["bbox"]), block_no=bno))
        for ln in merge_row_fragments(block_lines):
            smooth_styles(ln.spans)
            mark_scripts(ln.spans)
            lines.append(ln)

    drawings = page.get_drawings()
    hrules = []
    for d in drawings:
        r = d.get("rect")
        if r is None:
            continue
        if r.height <= 1.6 and r.width >= 8:
            hrules.append(pymupdf.Rect(r))
    mark_underlines(lines, hrules)

    regions = find_regions(page, lines, drawings, w, h)
    scanned = any(r.kind == "page" and not r.absorb for r in regions)
    if scanned:
        for ln in lines:
            if looks_like_ocr_noise(ln.text):
                ln.excluded = True
    return PageData(
        number=number,
        lines=lines,
        regions=regions,
        width=w,
        height=h,
        hrules=hrules,
        scanned=scanned,
    )


def looks_like_ocr_noise(text: str) -> bool:
    """Fragments an OCR engine makes of axis labels, tick marks and figure lettering."""
    t = text.strip()
    if len(t) < 3:
        return True
    letters = sum(c.isalpha() for c in t)
    if letters / len(t) < 0.5:
        return True
    words = t.split()
    if len(words) <= 2 and len(t) <= 8:
        return True
    # a run of one- and two-letter "words" that are not real short words is lettering, not prose
    short_ok = {
        "a",
        "an",
        "i",
        "in",
        "on",
        "of",
        "to",
        "is",
        "it",
        "at",
        "by",
        "or",
        "as",
        "we",
        "be",
        "no",
        "so",
        "if",
        "do",
        "up",
        "us",
        "am",
        "vs",
        "et",
        "al",
        "de",
        "e",
        "g",
        "ie",
        "eg",
    }
    odd = sum(
        1
        for w in words
        if len(w.strip(".,;:()[]'\"")) <= 2 and w.strip(".,;:()[]'\"").lower() not in short_ok
    )
    return len(words) >= 4 and odd / len(words) > 0.4


def smooth_styles(spans: list[Span]) -> None:
    """Word exports kerned words as alternating fragments ('P h' bold, 'a' plain, 'se' bold);
    a plain one-character fragment between two spans of the same style takes that style."""

    def sandwiched(i: int) -> bool:
        s, a, b = spans[i], spans[i - 1], spans[i + 1]
        return (
            not (s.bold or s.italic)
            and (a.bold, a.italic) == (b.bold, b.italic)
            and (a.bold or a.italic)
        )

    cands = [i for i in range(1, len(spans) - 1) if sandwiched(i)]
    # with several plain fragments in one line the alternation itself is the tell, so
    # fragments of up to two letters are absorbed; a lone fragment must be a single character
    limit = 2 if len(cands) >= 2 else 1
    for i in cands:
        s = spans[i]
        if len(s.text.replace(" ", "")) <= limit:
            s.bold, s.italic = spans[i - 1].bold, spans[i - 1].italic


def merge_row_fragments(lines: list[Line]) -> list[Line]:
    """PyMuPDF splits a visual line into several 'lines' when a super/subscript or a
    font change alters the line height. Rejoin fragments that share a row."""
    out: list[Line] = []
    for ln in lines:
        host = None
        for cand in out:
            ov = min(cand.bbox.y1, ln.bbox.y1) - max(cand.bbox.y0, ln.bbox.y0)
            if ov <= 0:
                continue
            small = min(cand.bbox.height, ln.bbox.height)
            if ov / max(small, 1.0) < 0.5:
                continue
            hgap = max(
                ln.bbox.x0 - cand.bbox.x1, cand.bbox.x0 - ln.bbox.x1
            )  # negative when overlapping
            side_by_side = -6 <= hgap <= 40
            fragment = (
                hgap <= 6
                and min(len(ln.text.replace(" ", "")), len(cand.text.replace(" ", ""))) <= 4
            )
            if side_by_side or fragment:
                host = cand
                break
        if host is None:
            out.append(ln)
            continue
        if ln.bbox.x1 <= host.bbox.x0 + 6:
            host.spans = ln.spans + host.spans
        else:
            host.spans = host.spans + ln.spans  # stream order is reading order for kerned fragments
        host.bbox = host.bbox | ln.bbox
    return out


def mark_scripts(spans: list[Span]) -> None:
    """Flag super/subscripts: noticeably smaller spans raised or lowered relative to the line."""
    if len(spans) < 2:
        return
    main = max(spans, key=lambda s: len(s.text.strip()))
    for s in spans:
        if s is main or s.sup:
            continue
        if s.size <= main.size * 0.8 and s.text.strip():
            if s.origin_y < main.origin_y - main.size * 0.15:
                s.sup = True
            elif s.origin_y > main.origin_y + main.size * 0.1:
                s.sub = True


def mark_underlines(lines: list[Line], hrules: list[pymupdf.Rect]) -> None:
    if not hrules:
        return
    for ln in lines:
        for s in ln.spans:
            if not s.text.strip():
                continue
            for r in hrules:
                if (
                    s.bbox.y1 - 3.5 <= r.y0 <= s.bbox.y1 + 2.5
                    and h_overlap(s.bbox, r) >= 0.6
                    and r.width <= s.bbox.width + 12
                ):
                    s.underline = True
                    break


def find_regions(
    page: pymupdf.Page, lines: list[Line], drawings: list[dict], w: float, h: float
) -> list[Region]:
    page_area = w * h
    page_rect = page.rect
    regions: list[Region] = []
    text_words = sum(len(ln.text.split()) for ln in lines)

    # raster images
    image_rects: list[pymupdf.Rect] = []
    try:
        infos = page.get_image_info(xrefs=True)
    except Exception:
        infos = []
    largest_img = 0.0
    for info in infos:
        r = rect_of(info["bbox"]) & page_rect
        if r.is_empty or r.width < 24 or r.height < 24:
            continue
        largest_img = max(largest_img, r.get_area() / page_area)
        if r.get_area() / page_area > 0.92 and text_words > 40:
            continue  # page background
        if any(overlap_frac(r, o) > 0.9 for o in image_rects):
            continue
        if is_flat_image(page, info):
            continue  # redaction box, colour bar, rule
        image_rects.append(r)

    # scanned page: show the page itself; keep whatever OCR text there is so it can be
    # searched and marked
    if largest_img > 0.45 and text_words < 25:
        return [Region(rect=pymupdf.Rect(page_rect), kind="page", page=page.number + 1)]
    if largest_img > 0.85:
        return [
            Region(rect=pymupdf.Rect(page_rect), kind="page", page=page.number + 1, absorb=False)
        ]

    # tables (ruled). The finder is expensive and retains memory, so it only runs on pages
    # that actually carry a grid of rules.
    table_rects: list[pymupdf.Rect] = []
    tables = []
    if has_ruled_grid(drawings):
        try:
            tables = page.find_tables().tables
        except Exception:
            tables = []
    for t in tables:
        r = rect_of(t.bbox) & page_rect
        if t.row_count < 2 or t.col_count < 2 or r.is_empty or r.width < 60 or r.height < 20:
            continue
        inside = [ln for ln in lines if overlap_frac(ln.bbox, r) > 0.6]
        if len(inside) < 3:
            continue
        # a chart's grid also looks like a table to the finder; a real table has words in its cells
        try:
            cells = [c for row in t.extract() for c in row]
        except Exception:
            cells = []
        filled = [c for c in cells if c and str(c).strip()]
        wordy = [c for c in filled if sum(ch.isalpha() for ch in str(c)) >= 2]
        if cells and (len(filled) < 0.35 * len(cells) or len(wordy) < 3):
            continue
        table_rects.append(r)

    # vector drawing clusters (table rules are not figure content)
    vec_rects: list[pymupdf.Rect] = []
    free_drawings = [
        d
        for d in drawings
        if d.get("rect") is not None
        and not any(overlap_frac(pymupdf.Rect(d["rect"]), t) > 0.8 for t in table_rects)
    ]
    try:
        clusters = (
            page.cluster_drawings(drawings=free_drawings, x_tolerance=4, y_tolerance=4)
            if free_drawings
            else []
        )
    except Exception:
        clusters = []
    for c in clusters:
        r = pymupdf.Rect(c) & page_rect
        if r.is_empty or r.height < 12 or r.width < 12:
            continue
        if any(overlap_frac(r, t) > 0.5 for t in table_rects):
            continue
        if any(overlap_frac(r, im) > 0.8 for im in image_rects):
            continue
        area_frac = r.get_area() / page_area
        n_inside = sum(
            1
            for d in drawings
            if d.get("rect") is not None and overlap_frac(pymupdf.Rect(d["rect"]), r) > 0.9
        )
        if area_frac > 0.85:
            continue  # page frame / border
        if area_frac < MIN_FIGURE_AREA_FRAC and n_inside < 8:
            continue
        inside_lines = [ln for ln in lines if overlap_frac(ln.bbox, r) > 0.6]
        inside_words = sum(len(ln.text.split()) for ln in inside_lines)
        # a cluster that is mostly running body text with a box around it is a text box,
        # not a figure
        if inside_words > 60 and n_inside < 12:
            continue
        # one or two bare shapes with nothing in them: a redaction box, a rule, a frame
        if (
            n_inside <= 2
            and not inside_lines
            and not any(overlap_frac(im, r) > 0.5 for im in image_rects)
        ):
            continue
        vec_rects.append(r)

    # merge figure-ish rects that touch or nearly touch
    fig_rects = merge_rects(image_rects + vec_rects, FIGURE_MERGE_GAP)
    for r in fig_rects:
        regions.append(Region(rect=r, kind="figure", page=page.number + 1))
    for r in table_rects:
        regions.append(Region(rect=r, kind="table", page=page.number + 1))

    # a caption that the region swallowed (table finder edges, tight clusters) is text, not picture:
    # trim the region to the caption's edge so attach_caption can pick it up
    for reg in regions:
        for ln in lines:
            if (
                ln.excluded
                or overlap_frac(ln.bbox, reg.rect) < 0.5
                or not CAPTION_RE.match(ln.text.strip())
            ):
                continue
            if ln.bbox.y0 >= reg.rect.y0 + 0.5 * reg.rect.height:
                reg.rect.y1 = ln.bbox.y0 - 1
            elif ln.bbox.y1 <= reg.rect.y0 + 0.3 * reg.rect.height:
                reg.rect.y0 = ln.bbox.y1 + 1
    # absorb text that belongs to the picture: lines inside it, and short labels (axis ticks,
    # legends, chart titles) hugging its edge — growing the region as they are taken in
    for reg in regions:
        if not reg.absorb:
            continue
        for _ in range(3):
            grew = False
            for ln in lines:
                if ln.excluded:
                    continue
                t = ln.text.strip()
                ov = overlap_frac(ln.bbox, reg.rect)
                labelish = (
                    len(t) <= 24
                    and not t.endswith(".")
                    and (len(t.split()) <= 3 or sum(c.isdigit() for c in t) >= len(t) / 3)
                )
                if (
                    ov > 0.55
                    or (ov > 0.25 and len(t) <= 40)
                    or (
                        labelish
                        and rect_gap(ln.bbox, reg.rect) <= 10
                        and not CAPTION_START_RE.match(t)
                    )
                ):
                    ln.excluded = True
                    if not reg.rect.contains(ln.bbox):
                        reg.rect |= ln.bbox
                        grew = True
            if not grew:
                break
    for reg in regions:
        if reg.kind != "page":
            attach_caption(reg, lines)
    regions.sort(key=lambda r: (r.rect.y0, r.rect.x0))
    return regions


def is_flat_image(page: pymupdf.Page, info: dict) -> bool:
    """True for images that are a single colour (redaction boxes, rules, colour swatches)."""
    xref = info.get("xref")
    if not xref:
        return False
    try:
        pix = pymupdf.Pixmap(page.parent, xref)
        if pix.n - pix.alpha >= 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        return pix.color_count(colors=False) <= 2
    except Exception:
        return False


def has_ruled_grid(drawings: list[dict]) -> bool:
    """At least three horizontal and two vertical rules, or a handful of cell rectangles."""
    h = v = rects = 0
    for d in drawings:
        r = d.get("rect")
        if r is None:
            continue
        if r.height <= 2.5 and r.width >= 20:
            h += 1
        elif r.width <= 2.5 and r.height >= 10:
            v += 1
        elif (
            any(item[0] == "re" for item in d.get("items", ()))
            and 8 <= r.width <= 400
            and 6 <= r.height <= 200
        ):
            rects += 1
        if (h >= 3 and v >= 2) or rects >= 6:
            return True
    return False


def merge_rects(rects: list[pymupdf.Rect], gap: float) -> list[pymupdf.Rect]:
    rects = [pymupdf.Rect(r) for r in rects]
    changed = True
    while changed:
        changed = False
        out: list[pymupdf.Rect] = []
        for r in rects:
            for i, o in enumerate(out):
                grown = pymupdf.Rect(o.x0 - gap, o.y0 - gap, o.x1 + gap, o.y1 + gap)
                if grown.intersects(r):
                    out[i] = o | r
                    changed = True
                    break
            else:
                out.append(r)
        rects = out
    return rects


def attach_caption(reg: Region, lines: list[Line]) -> None:
    """Find the 'Figure N.' / 'Table N.' paragraph that belongs to the region: below or above
    it, or set beside it in the neighbouring column. Only a line that opens its own text
    block qualifies, so body text that merely wraps onto a 'Fig. 2d' reference is ignored."""
    block_first: dict[int, Line] = {}
    for ln in lines:
        if ln.excluded:
            continue
        cur = block_first.get(ln.block_no)
        if cur is None or ln.bbox.y0 < cur.bbox.y0:
            block_first[ln.block_no] = ln
    cands = []
    r = reg.rect
    for ln in block_first.values():
        m = CAPTION_START_RE.match(ln.text.strip())
        if not m:
            continue
        word = m.group(1).lower()
        if reg.kind == "table" and not word.startswith("table"):
            continue
        if reg.kind == "figure" and word.startswith("table"):
            continue
        b = ln.bbox
        below = -8 <= b.y0 - r.y1 <= CAPTION_GAP and h_overlap(b, r) >= 0.3
        above = -8 <= r.y0 - b.y1 <= CAPTION_GAP and h_overlap(b, r) >= 0.3
        vert = min(b.y1, r.y1) - max(b.y0, r.y0) > 0
        beside = vert and (-4 <= b.x0 - r.x1 <= 28 or -4 <= r.x0 - b.x1 <= 28)
        if below:
            cands.append((0 if reg.kind != "table" else 1, abs(b.y0 - r.y1), ln))
        elif above:
            cands.append((0 if reg.kind == "table" else 1, abs(r.y0 - b.y1), ln))
        elif beside:
            cands.append((2, min(abs(b.x0 - r.x1), abs(r.x0 - b.x1)) + abs(b.y0 - r.y0) / 10, ln))
    if not cands:
        return
    cands.sort(key=lambda c: (c[0], c[1]))
    first = cands[0][2]
    cap_lines = [first]
    # gather the rest of the caption paragraph: following lines in the same block, closely spaced
    for ln in lines:
        if ln is first or ln.excluded or ln.block_no != first.block_no:
            continue
        if (
            ln.bbox.y0 > first.bbox.y0
            and ln.bbox.y0 - cap_lines[-1].bbox.y1 < first.bbox.height * 0.8
        ):
            cap_lines.append(ln)
    for ln in cap_lines:
        ln.excluded = True
    m = CAPTION_RE.match(first.text.strip())
    kind_word = m.group(1).lower()
    reg.number = int(m.group(2))
    reg.label = ("Table" if kind_word.startswith("table") else "Figure") + f" {reg.number}"
    caption = join_lines([ln.text for ln in cap_lines])
    # the reader shows the label on its own line, so the caption starts after "Figure 3."
    reg.caption = (
        re.sub(
            r"^(fig(?:ure)?\.?|table|scheme)\s*\d+\s*[.:|—–-]?\s*", "", caption, flags=re.I
        ).strip()
        or caption
    )


# --- header / footer -----------------------------------------------------------


def strip_headers_footers(pages: list[PageData]) -> None:
    zone_lines: list[tuple[PageData, Line]] = []
    counts: Counter = Counter()
    per_page_seen: list[set] = []
    for pd in pages:
        seen = set()
        for ln in pd.lines:
            if ln.excluded:
                continue
            if ln.bbox.y1 <= pd.height * HEADER_ZONE or ln.bbox.y0 >= pd.height * FOOTER_ZONE:
                key = normalize_hf(ln.text)
                zone_lines.append((pd, ln))
                seen.add(key)
        per_page_seen.append(seen)
        counts.update(seen)
    n = len(pages)
    threshold = max(2, int(0.3 * n + 0.999))
    for pd, ln in zone_lines:
        t = ln.text.strip()
        key = normalize_hf(t)
        if counts[key] >= threshold or any(p.match(t) for p in HF_PATTERNS):
            ln.excluded = True
            continue
        if len(t) <= 3 and not t.isalpha():
            ln.excluded = True
        elif is_known_section(t) == 1 and len(t) <= 40 and ln.bbox.y0 >= pd.height * FOOTER_ZONE:
            ln.excluded = True  # NIH prints the section name in the footer


# --- paragraphs --------------------------------------------------------------


def body_font_size(pages: list[PageData]) -> float:
    weights: Counter = Counter()
    for pd in pages:
        for ln in pd.lines:
            if ln.excluded:
                continue
            for s in ln.spans:
                if s.sup or s.sub:
                    continue
                weights[round(s.size * 2) / 2] += len(s.text.strip())
    if not weights:
        return 11.0
    return weights.most_common(1)[0][0]


def detect_columns(lines: list[Line], width: float) -> tuple[bool, float]:
    body = [ln for ln in lines if not ln.excluded and len(ln.text.strip()) > 20]
    if len(body) < 10:
        return False, width / 2
    x0s = sorted(ln.bbox.x0 for ln in body)
    left_margin = x0s[len(x0s) // 10]
    right_edge = sorted(ln.bbox.x1 for ln in body)[-1 - len(body) // 10]
    text_w = max(1.0, right_edge - left_margin)
    mid = left_margin + text_w / 2
    left = [
        ln for ln in body if ln.bbox.x1 < mid + 0.06 * text_w and ln.bbox.x0 < mid - 0.25 * text_w
    ]
    right = [ln for ln in body if ln.bbox.x0 > mid - 0.06 * text_w]
    full = [
        ln for ln in body if ln.bbox.x0 < mid - 0.25 * text_w and ln.bbox.x1 > mid + 0.25 * text_w
    ]
    two = len(left) >= 5 and len(right) >= 5 and len(full) <= 0.3 * len(body)
    return two, mid


def column_of(r: pymupdf.Rect, two: bool, mid: float) -> int:
    if not two:
        return 0
    if r.x1 <= mid + 8:
        return 1
    if r.x0 >= mid - 8:
        return 2
    return 0


def is_heading_line(ln: Line, body: float, strict: bool = False) -> bool:
    """`strict` (OCR text layers) trusts only structural evidence — section names, numbering,
    aims — because bold flags and sizes from an OCR engine are guesses and figure lettering
    tends to come out short and bold."""
    t = ln.text.strip()
    if not t or len(t) > MAX_HEADING_CHARS:
        return False
    if LIST_RE.match(t) and not NUMBERED_RE.match(t):
        return False
    letters = sum(c.isalpha() for c in t)
    if letters < 2:
        return False
    big = ln.size >= body * HEADING_SIZE_RATIO
    known = is_known_section(t)
    structural = bool(known or NUMBERED_RE.match(t) or AIM_RE.match(t))
    caps = t == t.upper() and letters >= 3 and len(t) <= 80
    if strict and not structural:
        return False
    if big and (not t.endswith(".") or NUMBERED_RE.match(t) or known):
        return True
    if (
        ln.all_bold
        and len(t) <= 160
        and (not ends_sentence(t) or t.endswith(":") or NUMBERED_RE.match(t) or known)
    ):
        return True
    if known and len(t) <= 60:
        return True
    # small caps come out as a smaller size in upper case
    return bool(caps and (ln.size >= body * 0.95 or NUMBERED_RE.match(t)) and not ends_sentence(t))


def starts_run_in(ln: Line, prev: Line) -> bool:
    """A line that opens with a bold lead-in ('Aim 1.', 'Rationale:') or an aim/number
    label starts a new paragraph even inside the same PyMuPDF block."""
    t = ln.text.strip()
    if AIM_RE.match(t) or NUMBERED_RE.match(t):
        return True
    first = next((s for s in ln.spans if s.text.strip()), None)
    pfirst = next((s for s in prev.spans if s.text.strip()), None)
    return bool(
        first and first.bold and len(first.text.strip()) >= 3 and pfirst and not pfirst.bold
    )


def build_paragraphs(pd: PageData, body: float) -> list[Para]:
    lines = [ln for ln in pd.lines if not ln.excluded]
    two, mid = detect_columns(lines, pd.width)
    paras: list[Para] = []
    cur: list[Line] | None = None
    cur_kind = "paragraph"
    cur_col = 0

    def flush():
        nonlocal cur
        if cur:
            paras.append(Para(lines=cur, page=pd.number, kind=cur_kind, col=cur_col))
        cur = None

    # heading flags, resolved back to front so a bold lead-in that wraps over several full-width
    # lines and then runs on into ordinary text is demoted as a whole
    is_head = [is_heading_line(ln, body, strict=pd.scanned) for ln in lines]
    if lines:
        left = min(ln.bbox.x0 for ln in lines)
        right = max(ln.bbox.x1 for ln in lines)
        full_width = right - 0.12 * max(1.0, right - left)
        for i in range(len(lines) - 2, -1, -1):
            ln, nxt = lines[i], lines[i + 1]
            if not is_head[i] or is_head[i + 1] or nxt.bbox.x0 > ln.bbox.x0 + 12:
                continue  # (a first line may be indented; the next starts at the margin)
            if (
                not (-6 <= nxt.bbox.y0 - ln.bbox.y1 < ln.bbox.height * 0.8)
                or ln.bbox.x1 < full_width
            ):
                continue
            nfirst = next((s for s in nxt.spans if s.text.strip()), None)
            if nxt.text.strip()[:1].islower() or (
                nfirst is not None and nfirst.bold and not nxt.all_bold
            ):
                is_head[i] = False

    prev: Line | None = None
    for idx, ln in enumerate(lines):
        t = ln.text.strip()
        heading = is_head[idx]
        first_span = next((s for s in ln.spans if s.text.strip()), None)
        continuing = (
            prev is not None and prev.block_no == ln.block_no and not ends_sentence(prev.text)
        )
        lm = LIST_RE.match(t)
        bullet = bool(lm) and not any(c.isalnum() for c in lm.group(1)) and lm.group(1) != "-"
        listy = (
            bool(lm)
            and not (first_span and (first_span.sup or first_span.sub))
            and (bullet or not continuing or cur_kind == "list-item")
        )
        if listy and first_span is not None and first_span.bold:
            lead_bold = ""
            for s in ln.spans:
                if s.bold or not s.text.strip():
                    lead_bold += s.text
                else:
                    break
            if is_known_section(
                re.sub(r"^\(?[a-zA-Z0-9]{1,2}[.)]\s*", "", lead_bold.strip()).strip(" |:-—–")
            ):
                listy = False  # "(a) Significance |" is a run-in section head, not a list
        col = column_of(ln.bbox, two, mid)
        new_para = cur is None
        if not new_para and prev is not None:
            gap = ln.bbox.y0 - prev.bbox.y1
            lh = max(prev.bbox.height, ln.bbox.height, 1.0)
            if (
                ln.block_no != prev.block_no
                or heading
                or cur_kind == "heading"
                or listy
                or gap > 0.9 * lh
                or col != cur_col
            ):
                new_para = True
            elif ln.bbox.y0 < prev.bbox.y0 - lh * 0.5:
                new_para = True  # jumped back up: new column
            elif abs(ln.size - prev.size) > 1.0 and not (ln.spans[0].sup or ln.spans[0].sub):
                new_para = True
            elif ends_sentence(prev.text) and starts_run_in(ln, prev):
                new_para = True  # "Aim 1." / bold lead-in opens a new paragraph
        if new_para:
            flush()
            cur = [ln]
            cur_kind = "heading" if heading else ("list-item" if listy else "paragraph")
            cur_col = col
        else:
            cur.append(ln)
        prev = ln
    flush()

    # a heading that runs onto a second line of the same style stays one heading
    merged: list[Para] = []
    for p in paras:
        if (
            merged
            and p.kind == "heading"
            and merged[-1].kind == "heading"
            and p.page == merged[-1].page
        ):
            a = merged[-1]
            last = a.lines[-1]
            if (
                abs(p.lines[0].size - last.size) < 0.6
                and 0 <= p.lines[0].bbox.y0 - last.bbox.y1 < last.bbox.height * 0.8
                and not ends_sentence(a.text)
                and len(a.text) + len(p.text) <= MAX_HEADING_CHARS
                and not NUMBERED_RE.match(p.text)
                and is_known_section(a.text) != 1
            ):
                a.lines.extend(p.lines)
                continue
        merged.append(p)
    return merged


def order_items(paras: list[Para], regions: list[Region], two: bool, mid: float) -> list:
    """Reading order: bands separated by full-width items; inside a band, left column then right."""
    items: list = []
    for p in paras:
        items.append((p.bbox, p.col, p))
    for r in regions:
        r.col = column_of(r.rect, two, mid)
        items.append((r.rect, r.col, r))
    if not two:
        # keep stream order for text, slot figures in by vertical position
        out: list = []
        regs = sorted(regions, key=lambda r: r.rect.y0)
        for p in paras:
            while regs and regs[0].rect.y0 < p.bbox.y0:
                out.append(regs.pop(0))
            out.append(p)
        out.extend(regs)
        return out
    items.sort(key=lambda it: (it[0].y0, it[0].x0))
    out = []
    band: list = []

    def flush_band():
        if band:
            band.sort(key=lambda it: (it[1], it[0].y0))
            out.extend(it[2] for it in band)
            band.clear()

    for it in items:
        if it[1] == 0:
            flush_band()
            out.append(it[2])
        else:
            band.append(it)
    flush_band()
    return out


# --- runs --------------------------------------------------------------------


def para_runs(p: Para) -> list[dict]:
    runs: list[dict] = []
    for i, ln in enumerate(p.lines):
        spans = [s for s in ln.spans if s.text]
        if i > 0 and runs:
            prev_text = runs[-1]["t"]
            first = spans[0].text.lstrip() if spans else ""
            if (
                prev_text.rstrip().endswith("-")
                and len(prev_text.rstrip()) > 1
                and prev_text.rstrip()[-2].isalpha()
                and first[:1].islower()
            ):
                runs[-1]["t"] = prev_text.rstrip()[:-1]
            else:
                runs[-1]["t"] = prev_text.rstrip() + " "
            if spans:
                spans[0] = Span(**{**spans[0].__dict__, "text": first})
        for s in spans:
            if not s.text:
                continue
            if not s.text.strip():
                if runs:
                    runs[-1]["t"] += s.text  # bare spaces take the style of what precedes them
                continue
            r = {"t": s.text}
            if s.bold:
                r["b"] = True
            if s.italic:
                r["i"] = True
            if s.underline:
                r["u"] = True
            if s.sup:
                r["sup"] = True
            elif s.sub:
                r["sub"] = True
            if runs and style_key(runs[-1]) == style_key(r):
                runs[-1]["t"] += s.text
            else:
                runs.append(r)
    # normalise whitespace without breaking the text/run invariant
    for r in runs:
        r["t"] = re.sub(r"[ ]{2,}", " ", r["t"])
    if runs:
        runs[0]["t"] = runs[0]["t"].lstrip()
        runs[-1]["t"] = runs[-1]["t"].rstrip()
    return [r for r in runs if r["t"]]


def style_key(r: dict) -> tuple:
    return (
        r.get("b", False),
        r.get("i", False),
        r.get("u", False),
        r.get("sup", False),
        r.get("sub", False),
        r.get("fig"),
    )


def runs_text(runs: list[dict]) -> str:
    return "".join(r["t"] for r in runs)


def link_figure_refs(runs: list[dict], by_label: dict[str, str]) -> list[dict]:
    text = runs_text(runs)
    spans: list[tuple[int, int, str]] = []
    for m in FIGREF_RE.finditer(text):
        num = m.group(1) or m.group(2)
        label = ("Figure " if m.group(1) else "Table ") + num
        fid = by_label.get(label)
        if fid:
            spans.append((m.start(), m.end(), fid))
    if not spans:
        return runs
    out: list[dict] = []
    pos = 0
    for r in runs:
        start, end = pos, pos + len(r["t"])
        cuts = [start]
        for a, b, _ in spans:
            if start < a < end:
                cuts.append(a)
            if start < b < end:
                cuts.append(b)
        cuts.append(end)
        cuts = sorted(set(cuts))
        for a, b in zip(cuts, cuts[1:], strict=False):
            piece = {**r, "t": text[a:b]}
            for sa, sb, fid in spans:
                if sa <= a and b <= sb:
                    piece["fig"] = fid
                    break
            out.append(piece)
        pos = end
    return out


# --- document assembly ---------------------------------------------------------


def render_region(
    page: pymupdf.Page, rect: pymupdf.Rect, path: Path, whole_page: bool = False
) -> tuple[int, int]:
    """Cut the region out of the page as an image. Figures are PNG at up to 216 dpi; a whole
    scanned page is a JPEG at 150 dpi, which keeps a 90-page scan to tens of megabytes."""
    clip = pymupdf.Rect(rect.x0 - 3, rect.y0 - 3, rect.x1 + 3, rect.y1 + 3) & page.rect
    scale = min(2.08 if whole_page else RENDER_SCALE, RENDER_MAX_WIDTH_PX / max(1.0, clip.width))
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False)
    if whole_page:
        pix.save(str(path), jpg_quality=82)
    else:
        pix.save(str(path))
    w, h = pix.width, pix.height
    del pix
    pymupdf.TOOLS.store_shrink(100)  # release MuPDF's render cache between pictures
    return w, h


def clean_metadata_title(meta: str | None) -> str | None:
    """A usable title from PDF metadata, or None when the metadata is form boilerplate."""
    meta = re.sub(r"\s+", " ", meta or "").strip()
    meta = re.sub(r"^SF\s*424\s*\(R&R\)\s*Application\s+for\s+", "", meta, flags=re.I).strip()
    junk = re.search(
        r"sf\s*424|application for federal assistance|^nsf forms$|^untitled|microsoft word|"
        r"\.(pdf|docx?)$|^grant application$|^document\d*$",
        meta,
        re.I,
    )
    if 4 <= len(meta) <= 200 and not junk:
        return meta
    return None


def guess_title(doc: pymupdf.Document, fallback: str) -> str:
    return clean_metadata_title((doc.metadata or {}).get("title")) or fallback


def progress_total(pages: list[int]) -> int:
    """The number of progress steps `build_document` will report for `pages`.

    The scale belongs here rather than to the caller: the extractor works in two passes, and
    a caller that assumed one step per page would make the progress bar jump at the halfway
    mark and finish at 200%.
    """
    return PROGRESS_PHASES * len(pages)


def build_document(
    pdf_path: Path, pages: list[int], out_dir: Path, progress: Progress | None = None
) -> dict:
    progress = progress or (lambda *_: None)
    with pymupdf.open(str(pdf_path)) as doc:
        return _build(doc, pages, Path(out_dir), progress, Path(pdf_path).stem)


def _build(
    doc: pymupdf.Document, pages: list[int], out_dir: Path, progress: Progress, fallback_title: str
) -> dict:
    pages = [p for p in pages if 1 <= p <= len(doc)]
    fig_dir = out_dir / "figures"
    fig_dir.mkdir(parents=True, exist_ok=True)
    total = progress_total(pages)

    page_data: list[PageData] = []
    resolver = LigatureResolver(doc)
    for i, pno in enumerate(pages):
        progress(i, total, f"Reading page {pno}")
        page_data.append(read_page(doc[pno - 1], pno, resolver))
        pymupdf.TOOLS.store_shrink(100)
    strip_headers_footers(page_data)
    body = body_font_size(page_data)

    blocks: list[dict] = []
    figures: list[dict] = []
    toc: list[dict] = []
    items_by_page: list[tuple[PageData, list]] = []

    for pd in page_data:
        paras = build_paragraphs(pd, body)
        two, mid = detect_columns([ln for ln in pd.lines if not ln.excluded], pd.width)
        items = order_items(paras, pd.regions, two, mid)
        items_by_page.append((pd, items))

    # heading levels: known top-level sections are 1, aims and known sub-sections 2, the rest by
    # font size rank; bold body-size headings sit below every larger size
    big_sizes = sorted(
        {
            round(p.size * 2) / 2
            for _, items in items_by_page
            for p in items
            if isinstance(p, Para) and p.kind == "heading" and p.size >= body * HEADING_SIZE_RATIO
        },
        reverse=True,
    )
    size_rank = {s: i for i, s in enumerate(big_sizes)}
    small_level = min(3, len(big_sizes) + 1)

    def heading_level(p: Para) -> int:
        t = p.text.strip()
        known = is_known_section(t)
        if known == 1:
            return 1
        if known == 2 or AIM_RE.match(t):
            return 2
        s = round(p.size * 2) / 2
        if s in size_rank:
            return min(3, size_rank[s] + 1)
        m = NUMBER_PREFIX_RE.match(t)
        if m:
            depth = m.group(1).count(".") + 1  # "C5." → 2, "C1.1." → 3
            return min(3, 1 + depth)
        return max(2, small_level)

    fig_count = 0
    figure_ids_by_label: dict[str, str] = {}
    pending_refs: list[int] = []  # indices of text blocks to link after all figures are known

    for i, (pd, items) in enumerate(items_by_page):
        progress(len(pages) + i, total, f"Laying out page {pd.number}")
        for it in items:
            if isinstance(it, Region):
                fig_count += 1
                fid = f"f{fig_count:03d}"
                ext = "jpg" if it.kind == "page" else "png"
                w, h = render_region(
                    doc[pd.number - 1],
                    it.rect,
                    fig_dir / f"{fid}.{ext}",
                    whole_page=it.kind == "page",
                )
                bid = f"b{len(blocks) + 1:04d}"
                fig = {
                    "id": fid,
                    "kind": it.kind,
                    "label": it.label or ("Page " + str(pd.number) if it.kind == "page" else ""),
                    "caption": it.caption,
                    "page": pd.number,
                    "src": f"figures/{fid}.{ext}",
                    "w": w,
                    "h": h,
                    "blockId": bid,
                }
                figures.append(fig)
                if it.label:
                    figure_ids_by_label.setdefault(it.label, fid)
                blocks.append(
                    {
                        "id": bid,
                        "type": "page-image" if it.kind == "page" else "figure",
                        "page": pd.number,
                        "figure": fid,
                        "text": "",
                    }
                )
                continue
            p: Para = it
            runs = para_runs(p)
            text = runs_text(runs)
            if len(text.strip()) <= 8 and not any(c.isalnum() for c in text):
                continue  # a stray dash, bullet or rule on its own
            bid = f"b{len(blocks) + 1:04d}"
            if p.kind == "heading":
                level = heading_level(p)
                blocks.append(
                    {
                        "id": bid,
                        "type": "heading",
                        "level": level,
                        "page": p.page,
                        "text": text,
                        "runs": runs,
                    }
                )
                toc.append({"blockId": bid, "title": text, "level": level, "page": p.page})
                continue
            # paragraph continuation across blocks / pages
            prev = blocks[-1] if blocks else None
            if (
                p.kind == "paragraph"
                and prev
                and prev["type"] == "paragraph"
                and prev.get("_open")
                and (
                    text[:1].islower()
                    or prev["text"].endswith("-")
                    or (not text[:1].isupper() and not runs[0].get("b"))
                )
            ):
                prev_runs = prev["runs"]
                if prev["text"].endswith("-") and text[:1].islower():
                    prev_runs[-1]["t"] = prev_runs[-1]["t"][:-1]
                else:
                    prev_runs[-1]["t"] += " "
                if prev_runs and style_key(prev_runs[-1]) == style_key(runs[0]):
                    prev_runs[-1]["t"] += runs[0]["t"]
                    prev_runs.extend(runs[1:])
                else:
                    prev_runs.extend(runs)
                prev["text"] = runs_text(prev_runs)
                prev["_open"] = not ends_sentence(prev["text"])
                continue
            block = {"id": bid, "type": p.kind, "page": p.page, "text": text, "runs": runs}
            block["_open"] = p.kind == "paragraph" and not ends_sentence(text)
            blocks.append(block)
            # bold lead-in ("Aim 1.", "Rationale:") → contents entry
            runs[0]
            lead_runs = []
            for r in runs:
                if r.get("b") and not r.get("sup") and not r.get("sub"):
                    lead_runs.append(r)
                else:
                    break
            lt = "".join(r["t"] for r in lead_runs).strip()
            if lead_runs and len(lead_runs) < len(runs) and sum(c.isalpha() for c in lt) >= 3:
                aim, numbered = bool(AIM_RE.match(lt)), bool(NUMBERED_RE.match(lt))
                short = len(lt) <= 60 and len(lt.split()) <= 8
                titled = (
                    lt.endswith((".", ":", "|"))
                    or is_known_section(lt.strip(" |:-—–"))
                    or aim
                    or numbered
                )
                fits = len(lt) <= (250 if aim else 140)
                if titled and fits and not CAPTION_RE.match(lt) and (short or aim or numbered):
                    level = 2 if aim else 3 if numbered else 4
                    toc.append(
                        {
                            "blockId": bid,
                            "title": lt.rstrip(" .:|-—–"),
                            "level": level,
                            "page": p.page,
                        }
                    )
            pending_refs.append(len(blocks) - 1)

    for b in blocks:
        b.pop("_open", None)
    # if nothing ranked as a top-level heading, promote the whole hierarchy
    levels = [b["level"] for b in blocks if b["type"] == "heading"]
    if levels and min(levels) > 1:
        shift = min(levels) - 1
        for b in blocks:
            if b["type"] == "heading":
                b["level"] -= shift
        for t in toc:
            if t["level"] <= 3:
                t["level"] = max(1, t["level"] - shift)
    for idx in pending_refs:
        b = blocks[idx]
        b["runs"] = link_figure_refs(b["runs"], figure_ids_by_label)
        b["text"] = runs_text(b["runs"])
    for b in blocks:
        if b["type"] == "heading":
            b["runs"] = link_figure_refs(b["runs"], figure_ids_by_label)

    # unlabeled figures get running numbers after the labeled ones so the reader can name them
    unlabeled = 0
    for f in figures:
        if not f["label"]:
            unlabeled += 1
            f["label"] = (
                f"Table (p. {f['page']})" if f["kind"] == "table" else f"Figure (p. {f['page']})"
            )

    title = guess_title(doc, fallback_title)
    progress(total, total, "Done")
    return {
        "version": 1,
        "title": title,
        "pages": pages,
        "bodyFontSize": body,
        "blocks": blocks,
        "figures": figures,
        "toc": toc,
    }
