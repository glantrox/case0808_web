import React, { useState, forwardRef, useRef } from 'react';
import { pdfjs, Document, Page } from 'react-pdf';
import HTMLFlipBook from 'react-pageflip';

// Use the local worker bundled with pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ---------- Page components (all forward refs for react-pageflip) ----------

// Renders a full portrait PDF page, scaled to fit the flipbook dimensions perfectly
const PortraitPage = forwardRef(({ pageNumber, width, height, origWidth, origHeight }, ref) => {
  // Determine whether to constrain by width or height to maintain aspect ratio
  const containerRatio = width / height;
  const pageRatio = origWidth / origHeight;
  const constrainByWidth = pageRatio > containerRatio;

  // Calculate exact scaled dimensions to avoid relying on browser transforms
  const scaledWidth = constrainByWidth ? width : height * pageRatio;
  const scaledHeight = constrainByWidth ? width / pageRatio : height;

  const leftOffset = (width - scaledWidth) / 2;
  const topOffset = (height - scaledHeight) / 2;

  return (
    <div ref={ref}>
      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          background: '#fff',
          clipPath: 'inset(0)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: topOffset,
            left: leftOffset,
          }}
        >
          <Page
            pageNumber={pageNumber}
            width={constrainByWidth ? width : undefined}
            height={constrainByWidth ? undefined : height}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </div>
      </div>
    </div>
  );
});
PortraitPage.displayName = 'PortraitPage';

// Renders one half (left or right) of a landscape spread.
// The full spread is rendered at 2× the flipbook page width,
// then CSS clips it to show only the requested half.
const SpreadHalfPage = forwardRef(({ pageNumber, width, half }, ref) => (
  <div ref={ref}>
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        background: '#fff',
        clipPath: 'inset(0)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: half === 'right' ? -width : 0,
        }}
      >
        <Page
          pageNumber={pageNumber}
          width={width * 2}
          renderAnnotationLayer={false}
          renderTextLayer={false}
        />
      </div>
    </div>
  </div>
));
SpreadHalfPage.displayName = 'SpreadHalfPage';

// ---------- Main flipbook component ----------

export default function Flipbook() {
  const flipBookRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);

  // virtualPages: array of { pdfPage, type: 'portrait' | 'spread-left' | 'spread-right', origWidth?, origHeight? }
  const [virtualPages, setVirtualPages] = useState(null);
  // flipbook dimensions derived from the PDF content
  const [bookSize, setBookSize] = useState(null);
  const [error, setError] = useState(null);

  const pdfUrl = '/assets/porto.pdf';

  const handleLoadSuccess = async (pdf) => {
    try {
      const pages = [];
      let spreadDims = null;

      for (let i = 1; i <= pdf.numPages; i++) {
        if (i === 2) continue; // Skip the "Identification File" spread

        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const isLandscape = vp.width > vp.height;

        if (isLandscape) {
          // Remember the first spread's dimensions to derive the flipbook size
          if (!spreadDims) {
            spreadDims = { width: vp.width, height: vp.height };
          }
          pages.push({ pdfPage: i, type: 'spread-left' });
          pages.push({ pdfPage: i, type: 'spread-right' });
        } else {
          pages.push({ pdfPage: i, type: 'portrait', origWidth: vp.width, origHeight: vp.height });
        }
      }

      // Derive page size: target width is fixed, height comes from spread aspect ratio
      const targetWidth = 400;
      let targetHeight = 550; // fallback if no spreads found

      if (spreadDims) {
        const halfW = spreadDims.width / 2;
        targetHeight = Math.round(targetWidth * (spreadDims.height / halfW));
      }

      setBookSize({ width: targetWidth, height: targetHeight });
      setVirtualPages(pages);
    } catch (err) {
      setError(err);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>
        Error loading PDF: {error.message}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f7f7f7', // Minimalist light grey background
        padding: '40px 20px',
        boxSizing: 'border-box',
        gap: '30px',
      }}
    >
      <Document
        file={pdfUrl}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={setError}
        loading={<div style={{ padding: 40, fontSize: 18, color: '#333' }}>Loading Interactive PDF…</div>}
      >
        {virtualPages && bookSize && (
          <div
            style={{
              transform: `translateX(${
                currentPage === 0
                  ? -(bookSize.width / 2)
                  : currentPage === virtualPages.length - 1
                  ? (bookSize.width / 2)
                  : 0
              }px)`,
              transition: 'transform 0.6s cubic-bezier(0.645, 0.045, 0.355, 1)',
              filter: 'drop-shadow(0 25px 30px rgba(0, 0, 0, 0.15))',
            }}
          >
            <HTMLFlipBook
              width={bookSize.width}
              height={bookSize.height}
              showCover={true}
              usePortrait={false}
              ref={flipBookRef}
              onFlip={(e) => setCurrentPage(e.data)}
            >
              {virtualPages.map((vp, i) =>
                vp.type === 'portrait' ? (
                  <PortraitPage
                    key={`p-${i}`}
                    pageNumber={vp.pdfPage}
                    width={bookSize.width}
                    height={bookSize.height}
                    origWidth={vp.origWidth}
                    origHeight={vp.origHeight}
                  />
                ) : (
                  <SpreadHalfPage
                    key={`p-${i}`}
                    pageNumber={vp.pdfPage}
                    width={bookSize.width}
                    half={vp.type === 'spread-left' ? 'left' : 'right'}
                  />
                )
              )}
            </HTMLFlipBook>
          </div>
        )}
      </Document>

      {/* Interactive Page Slider */}
      {virtualPages && bookSize && (
        <div
          style={{
            width: '100%',
            maxWidth: '450px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '16px 24px',
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)',
            boxSizing: 'border-box',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            border: '1px solid rgba(0,0,0,0.05)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)';
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#555', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Page {currentPage + 1} of {virtualPages.length}
          </div>
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#000' }}>1</span>
            <input
              type="range"
              min={0}
              max={virtualPages.length - 1}
              value={currentPage}
              onChange={(e) => {
                const pageIdx = parseInt(e.target.value, 10);
                setCurrentPage(pageIdx);
                if (flipBookRef.current) {
                  flipBookRef.current.pageFlip().turnToPage(pageIdx);
                }
              }}
              style={{
                flex: 1,
                cursor: 'pointer',
                accentColor: '#000',
                height: '8px',
                borderRadius: '4px',
                background: '#e0e0e0',
              }}
            />
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#000' }}>{virtualPages.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}