"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TokenProvider } from "@/lib/api/ask";
import type { PaperPresentationModel } from "@/lib/tests/paper";
import { loadTestPaperVisual } from "@/lib/tests/visuals";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function wrap(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= CONTENT_WIDTH || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

async function pngBytes(blob: Blob): Promise<Uint8Array> {
  const source = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.drawImage(image, 0, 0);
    return new Uint8Array(await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer());
  } finally { URL.revokeObjectURL(source); }
}

async function embedVisual(pdf: PDFDocument, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type === "image/jpeg") return pdf.embedJpg(bytes);
  if (blob.type === "image/png") return pdf.embedPng(bytes);
  return pdf.embedPng(await pngBytes(blob));
}

export async function generatePaperPdf(paper: PaperPresentationModel, getToken?: TokenProvider): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const newPage = () => { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; };
  const ensure = (height: number) => { if (y - height < MARGIN) newPage(); };
  const text = (value: string, size = 10, font = regular, color = rgb(0.05, 0.09, 0.16)) => {
    const lines = wrap(value, font, size);
    ensure(lines.length * (size + 4) + 4);
    for (const line of lines) { page.drawText(line, { x: MARGIN, y, size, font, color }); y -= size + 4; }
  };
  const heading = (value: string, size = 16) => { text(value, size, bold); y -= 4; };

  heading("TALEEM", 18);
  heading("TEST PAPER", 15);
  text(paper.title, 11, bold);
  text(`Time: ${paper.response.duration_minutes} minutes     Total Marks: ${paper.response.total_marks}`, 10);
  y -= 8;
  text("Name: ________________________________     Roll No: __________________", 10);
  y -= 12;
  for (const section of paper.sections) {
    ensure(48);
    heading(`SECTION ${section.key} — ${section.title}`, 12);
    text(`${section.instruction} ${section.marksLabel}`, 10, regular, rgb(0.2, 0.25, 0.32));
    y -= 5;
    for (const question of section.questions) {
      const questionLines = wrap(`Q${question.number}. ${question.question} [${question.marks} marks]`, regular, 10);
      ensure(Math.min(questionLines.length * 14 + 30, 110));
      for (const line of questionLines) { page.drawText(line, { x: MARGIN, y, size: 10, font: regular }); y -= 14; }
      for (const option of question.options) text(`   ${option.key}. ${option.text}`, 10);
      for (const visual of question.visuals) {
        try {
          if (!getToken) throw new Error("VISUAL_AUTH_REQUIRED");
          const image = await embedVisual(pdf, await loadTestPaperVisual(paper, question.id, visual.visual_id, getToken));
          const dimensions = image.scaleToFit(CONTENT_WIDTH, 260);
          ensure(dimensions.height + 28);
          page.drawImage(image, { x: MARGIN, y: y - dimensions.height, width: dimensions.width, height: dimensions.height });
          y -= dimensions.height + 6;
          text(visual.title, 9, regular, rgb(0.25, 0.3, 0.38));
        } catch {
          text(`   Visual unavailable: ${visual.title}${visual.description ? ` — ${visual.description}` : ""}`, 9, regular, rgb(0.25, 0.3, 0.38));
        }
      }
      y -= 5;
    }
    y -= 8;
  }
  return new Blob([Uint8Array.from(await pdf.save()).buffer], { type: "application/pdf" });
}

export async function downloadPaperPdf(paper: PaperPresentationModel, getToken?: TokenProvider) {
  const blob = await generatePaperPdf(paper, getToken);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = paper.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
