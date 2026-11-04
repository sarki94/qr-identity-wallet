/**
 * Shared Word generator for the COEN838 deliverables (docx-js).
 * Department style: A4; margins L 3.5 cm, R/T/B 2.5 cm; Times New Roman 12 pt black; justified body;
 * heading tiers (T1 centred bold UPPERCASE, T2 bold Title Case "1.1", T3 bold sentence case "1.1.1",
 * T4 italic); table captions above, figure captions below, numbered by section; no vertical table lines.
 */
const fs = require("fs");
const path = require("path");
const d = require("docx");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ImageRun, PageBreak, Footer, PageNumber, NumberFormat, TableOfContents, ShadingType, LevelFormat,
  PageOrientation, SectionType, TabStopType, LineRuleType } = d;

const FONT = "Times New Roman";
const PT = 24; // 12 pt in half-points
const LINE = 360; // 1.5 line spacing
const CM = 567; // twips per cm
const PAGE_W = 11906, PAGE_H = 16838;
const MARGIN = { left: Math.round(3.5 * CM), right: Math.round(2.5 * CM), top: Math.round(2.5 * CM), bottom: Math.round(2.5 * CM) };
const TEXT_W = PAGE_W - MARGIN.left - MARGIN.right; // ≈ 8504 twips
const LAND_TEXT_W = PAGE_H - MARGIN.left - MARGIN.right;
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const RULE = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const THIN = { style: BorderStyle.SINGLE, size: 2, color: "999999" };

/** Inline mini-markup: **bold**, *italic*, `code`. */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size: base.size || PT, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, size: base.size || PT, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: (base.size || PT) - 4, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONT, size: base.size || PT, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, size: base.size || PT, ...base }));
  return out;
}

class Doc {
  constructor(meta) {
    this.meta = meta; // {code, title, shortTitle, version, date}
    this.body = [];
    this.tableNo = {}; this.figNo = {};
    this.section = 0;
    this.sections = [];
    this.landscape = [];
  }
  // ---- headings -------------------------------------------------------
  h1(title) {
    this.section += 1; this.sub = 0; this.subsub = 0;
    this.body.push(new Paragraph({ children: [new PageBreak()] }));
    this.body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${this.section}. ${title.toUpperCase()}`, bold: true, font: FONT, size: PT })] }));
  }
  appendix(letter, title) {
    this.section = letter; this.sub = 0; this.subsub = 0;
    this.body.push(new Paragraph({ children: [new PageBreak()] }));
    this.body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `APPENDIX ${letter}: ${title.toUpperCase()}`, bold: true, font: FONT, size: PT })] }));
  }
  h2(title) {
    this.sub += 1; this.subsub = 0;
    this.body.push(new Paragraph({ heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: `${this.section}.${this.sub} ${title}`, bold: true, font: FONT, size: PT })] }));
  }
  h3(title) {
    this.subsub += 1; this.t4 = 0;
    this.body.push(new Paragraph({ heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: `${this.section}.${this.sub}.${this.subsub} ${title}`, bold: true, font: FONT, size: PT })] }));
  }
  h4(title) {
    this.t4 = (this.t4 || 0) + 1;
    this.body.push(new Paragraph({ heading: HeadingLevel.HEADING_4,
      children: [new TextRun({ text: `${this.section}.${this.sub}.${this.subsub}.${this.t4} ${title}`, italics: true, font: FONT, size: PT })] }));
  }
  // ---- text -----------------------------------------------------------
  p(text, opts = {}) {
    this.body.push(new Paragraph({ alignment: opts.align || AlignmentType.JUSTIFIED, spacing: { line: LINE, lineRule: LineRuleType.AUTO, after: 160 },
      children: runs(text), keepNext: !!opts.keepNext }));
  }
  lead(label, text) { // Tier 5: "Label: text"
    this.body.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, lineRule: LineRuleType.AUTO, after: 160 },
      children: [new TextRun({ text: `${label}: `, font: FONT, size: PT }), ...runs(text)] }));
  }
  bullets(items, numbered = false) {
    items.forEach((t) => this.body.push(new Paragraph({ numbering: { reference: numbered ? "num" : "bul", level: 0, instance: numbered ? this.nextNumInstance() : undefined },
      alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, lineRule: LineRuleType.AUTO, after: 60 }, children: runs(t) })));
    this.body.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  }
  numbered(items) {
    const inst = this.nextNumInstance();
    items.forEach((t) => this.body.push(new Paragraph({ numbering: { reference: "num", level: 0, instance: inst },
      alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, lineRule: LineRuleType.AUTO, after: 60 }, children: runs(t) })));
    this.body.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  }
  nextNumInstance() { this._inst = (this._inst || 0) + 1; return this._inst; }
  code(lines) {
    lines.forEach((l, i) => this.body.push(new Paragraph({ spacing: { line: 240, lineRule: LineRuleType.AUTO, after: i === lines.length - 1 ? 160 : 0 }, indent: { left: 360 },
      shading: { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" },
      children: [new TextRun({ text: l || " ", font: "Consolas", size: 18 })] })));
  }
  // ---- captions -------------------------------------------------------
  nextTable() { const s = this.section; this.tableNo[s] = (this.tableNo[s] || 0) + 1; return `${s}.${this.tableNo[s]}`; }
  nextFig() { const s = this.section; this.figNo[s] = (this.figNo[s] || 0) + 1; return `${s}.${this.figNo[s]}`; }
  peekTable() { const s = this.section; return `${s}.${(this.tableNo[s] || 0) + 1}`; }
  peekFig() { const s = this.section; return `${s}.${(this.figNo[s] || 0) + 1}`; }
  // ---- table: caption above, horizontal rules only ----------------------
  table(caption, headers, rows, widthsPct, opts = {}) {
    const no = opts.unnumbered ? null : this.nextTable();
    const total = opts.width || TEXT_W;
    const widths = widthsPct.map((w) => Math.round((w / 100) * total));
    widths[widths.length - 1] = total - widths.slice(0, -1).reduce((a, b) => a + b, 0);
    const size = opts.size || 20;
    this.body.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 80, line: 240, lineRule: LineRuleType.AUTO },
      children: no ? [new TextRun({ text: `Table ${no}: `, bold: true, font: FONT, size: PT }), ...runs(caption)] : runs(`**${caption}**`) }));
    const cell = (text, i, header, last) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 50, bottom: 50, left: 80, right: 80 },
      shading: header ? { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" } : undefined,
      borders: { left: NONE, right: NONE, top: header ? RULE : NONE, bottom: header ? RULE : last ? RULE : THIN },
      children: String(text).split("\n").map((line) => new Paragraph({ spacing: { line: 240, lineRule: LineRuleType.AUTO }, children: runs(line, { size, bold: header || undefined }) })),
    });
    const tRows = [new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true, false)) })];
    rows.forEach((r, ri) => tRows.push(new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, ri === rows.length - 1)) })));
    this.body.push(new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: tRows,
      borders: { left: NONE, right: NONE, insideVertical: NONE, top: RULE, bottom: RULE, insideHorizontal: THIN } }));
    this.body.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    return no;
  }
  // ---- figure: caption below --------------------------------------------
  figure(caption, file, maxWidthCm = 15, opts = {}) {
    const no = this.nextFig();
    const buf = fs.readFileSync(file);
    const { w, h } = pngSize(buf);
    const maxW = maxWidthCm * 37.8, maxH = (opts.maxHeightCm || 20) * 37.8; // px at 96 dpi
    let width = maxW, height = (h / w) * maxW;
    if (height > maxH) { height = maxH; width = (w / h) * maxH; }
    this.body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, line: 240, lineRule: LineRuleType.AUTO },
      children: [new ImageRun({ type: "png", data: buf, transformation: { width: Math.round(width), height: Math.round(height) } })] }));
    this.body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240, line: 240, lineRule: LineRuleType.AUTO },
      children: [new TextRun({ text: `Figure ${no}: `, bold: true, font: FONT, size: PT }), ...runs(caption)] }));
    return no;
  }
  pageBreak() { this.body.push(new Paragraph({ children: [new PageBreak()] })); }
  references(list) { // APA 7, hanging indent, alphabetical
    [...list].sort((a, b) => a.localeCompare(b)).forEach((r) => this.body.push(new Paragraph({ alignment: AlignmentType.LEFT,
      spacing: { line: LINE, lineRule: LineRuleType.AUTO, after: 120 }, indent: { left: 720, hanging: 720 }, children: runs(r) })));
  }
  // ---- front matter ----------------------------------------------------
  cover() {
    const m = this.meta;
    const c = (text, opts = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: opts.after ?? 120, before: opts.before || 0, line: 300, lineRule: LineRuleType.AUTO },
      children: [new TextRun({ text, font: FONT, size: opts.size || PT, bold: !!opts.bold, italics: !!opts.italics })] });
    return [
      c("AHMADU BELLO UNIVERSITY, ZARIA", { bold: true, before: 600 }),
      c("FACULTY OF ENGINEERING", { bold: true }),
      c("DEPARTMENT OF COMPUTER ENGINEERING", { bold: true, after: 600 }),
      c("COEN838: ADVANCED SOFTWARE ENGINEERING", { bold: true }),
      c("Project Examination, Question 4", { after: 900 }),
      c("OFFLINE-FIRST CRYPTOGRAPHIC QR IDENTITY WALLET", { bold: true, size: 32 }),
      c("FOR RURAL PUBLIC SERVICES", { bold: true, size: 32, after: 500 }),
      c(m.title.toUpperCase(), { bold: true, size: 28, after: 120 }),
      c(`Document ${m.code} · Version ${m.version}`, { after: 1200 }),
      c("BY", { after: 200 }),
      c("ALIYU SARKI ILIYASU", { bold: true }),
      c("P25EGCP8040", { after: 1200 }),
      c(m.date, {}),
    ];
  }
  control(history) {
    const t = this.body;
    this.body = [];
    this.body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "DOCUMENT CONTROL", bold: true, font: FONT, size: PT })] }));
    const saveSection = this.section; this.section = 0;
    this.table("Document details", ["Item", "Detail"], [
      ["Document", `${this.meta.title} (${this.meta.code})`], ["Project", "Offline-First Cryptographic QR Identity Wallet for Rural Public Services"],
      ["Course", "COEN838 Advanced Software Engineering, Ahmadu Bello University, Zaria"], ["Author", "Aliyu Sarki Iliyasu (P25EGCP8040)"],
      ["Version / date", `${this.meta.version} · ${this.meta.date}`], ["Source code", "https://github.com/sarki94/qr-identity-wallet"],
      ...(this.meta.related ? [["Related documents", this.meta.related]] : []),
    ], [28, 72], { unnumbered: true });
    this.table("Revision history", ["Version", "Date", "Change"], history, [14, 22, 64], { unnumbered: true });
    this.section = saveSection; this.tableNo[0] = 0;
    const front = this.body; this.body = t;
    return front;
  }
  // ---- build -----------------------------------------------------------
  async save(file, history) {
    const footer = (fmt) => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] });
    const control = this.control(history);
    const tocTitle = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "TABLE OF CONTENTS", bold: true, font: FONT, size: PT })] });
    const toc = new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" });
    const page = { size: { width: PAGE_W, height: PAGE_H }, margin: MARGIN };
    const doc = new Document({
      creator: "Aliyu Sarki Iliyasu", title: this.meta.title, description: "COEN838 Question 4 deliverable",
      features: { updateFields: true },
      styles: {
        default: { document: { run: { font: FONT, size: PT, color: "000000" }, paragraph: { spacing: { line: LINE, lineRule: LineRuleType.AUTO } } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { font: FONT, size: PT, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 240 }, keepNext: true, outlineLevel: 0, alignment: AlignmentType.CENTER } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { font: FONT, size: PT, bold: true, color: "000000" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
          { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { font: FONT, size: PT, bold: true, color: "000000" }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 } },
          { id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { font: FONT, size: PT, italics: true, color: "000000" }, paragraph: { spacing: { before: 160, after: 80 }, keepNext: true, outlineLevel: 3 } },
        ],
      },
      numbering: { config: [
        { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
        { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
      ] },
      sections: [
        { properties: { page }, children: this.cover() },
        { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } }, type: SectionType.NEXT_PAGE },
          footers: { default: footer() }, children: [...control, new Paragraph({ children: [new PageBreak()] }), tocTitle, toc] },
        { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }, type: SectionType.NEXT_PAGE },
          footers: { default: footer() }, children: this.body.slice(1) /* drop the first page break */ },
        ...this.landscape.map((children) => ({ properties: { type: SectionType.NEXT_PAGE, page: { size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.LANDSCAPE }, margin: MARGIN } },
          footers: { default: footer() }, children })),
      ],
    });
    fs.writeFileSync(file, await Packer.toBuffer(doc));
  }
  /** Start collecting content into a landscape section placed at the end (for wide appendix tables). */
  beginLandscape() { this._portrait = this.body; this.body = []; }
  endLandscape() { this.landscape.push(this.body); this.body = this._portrait; }
}

function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }

module.exports = { Doc, TEXT_W, LAND_TEXT_W };
