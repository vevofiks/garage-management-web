import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

/**
 * Cleanly exports an HTML container element into a multi-page A4 PDF file
 * using native browser rasterization (supports oklch/lab CSS) and triggers an
 * immediate download in the user's browser.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  // Use html-to-image toCanvas which uses the browser's native renderer
  // and natively supports modern CSS like oklch() / lab() colors.
  const canvas = await toCanvas(element, {
    quality: 0.96,
    pixelRatio: 2, // High resolution (300 DPI equivalent)
    backgroundColor: "#ffffff",
    cacheBust: false,
  });

  // A4 dimensions in mm: 210mm x 297mm
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pdfWidthMm = 210;
  const pdfHeightMm = 297;
  const marginMm = 8; // 8mm margin on all sides
  const contentWidthMm = pdfWidthMm - marginMm * 2; // 194mm usable width
  const pageHeightMm = pdfHeightMm - marginMm * 2; // 281mm usable height per page

  // Calculate pixel height corresponding to one A4 page of usable content
  const pxPerMm = canvas.width / contentWidthMm;
  const pageHeightPx = Math.floor(pageHeightMm * pxPerMm);

  let yOffsetPx = 0;
  let pageIndex = 0;

  while (yOffsetPx < canvas.height) {
    const currentSliceHeightPx = Math.min(pageHeightPx, canvas.height - yOffsetPx);

    // Create a sub-canvas for this specific page slice
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentSliceHeightPx;

    const ctx = pageCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      ctx.drawImage(
        canvas,
        0,
        yOffsetPx,
        canvas.width,
        currentSliceHeightPx,
        0,
        0,
        canvas.width,
        currentSliceHeightPx
      );
    }

    const sliceImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
    const sliceHeightMm = (currentSliceHeightPx * contentWidthMm) / canvas.width;

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      sliceImgData,
      "JPEG",
      marginMm,
      marginMm,
      contentWidthMm,
      sliceHeightMm,
      undefined,
      "FAST"
    );

    yOffsetPx += currentSliceHeightPx;
    pageIndex++;
  }

  const finalName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  pdf.save(finalName);
}
