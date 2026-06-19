import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { pdfjs, Document, Page } from 'react-pdf';
import HTMLFlipBook from 'react-pageflip';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

// Use the local worker bundled with pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ---------- Page components (all forward refs for react-pageflip) ----------

const PortraitPage = forwardRef(({ pageNumber, width, height, origWidth, origHeight }, ref) => {
  const containerRatio = width / height;
  const pageRatio = origWidth / origHeight;
  const constrainByWidth = pageRatio > containerRatio;
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
          background: 'transparent',
          clipPath: 'inset(0)',
        }}
      >
        <div style={{ position: 'absolute', top: topOffset, left: leftOffset }}>
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

const SpreadHalfPage = forwardRef(({ pageNumber, width, half }, ref) => (
  <div ref={ref}>
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        background: 'transparent',
        clipPath: 'inset(0)',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: half === 'right' ? -width : 0 }}>
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

// ---------- Subcomponents ----------

const FlippableIdCard = ({ isExpanded, cardWidth, cardHeight }) => {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Document file={'/assets/porto.pdf'} loading={<div>Loading ID...</div>}>
         <HTMLFlipBook 
            width={cardWidth} 
            height={cardHeight} 
            showCover={false} 
            usePortrait={true}
            maxShadowOpacity={0.5}
         >
            <SpreadHalfPage pageNumber={2} width={cardWidth} half="left" />
            <SpreadHalfPage pageNumber={2} width={cardWidth} half="right" />
         </HTMLFlipBook>
      </Document>
    </div>
  );
};

// ---------- Main App component ----------

export default function App() {
  const flipBookRef = useRef(null);
  const rightPanelRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [virtualPages, setVirtualPages] = useState(null);
  const [bookSize, setBookSize] = useState(null);
  const [error, setError] = useState(null);

  const [isIdCardExpanded, setIsIdCardExpanded] = useState(false);
  const [isNotebookExtracted, setIsNotebookExtracted] = useState(false);
  const [dummyKey, setDummyKey] = useState(0);
  const [hasBeenGrabbed, setHasBeenGrabbed] = useState(false);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const isMobileView = windowSize.w <= 768;

  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Responsive dimensions for expanded ID Card
  let expH = Math.min(isMobileView ? 600 : 840, windowSize.h * 0.85);
  let expW = expH / 1.4;
  if (expW > windowSize.w * 0.9) {
    expW = windowSize.w * 0.9;
    expH = expW * 1.4;
  }

  // Responsive dimensions for unexpanded ID Card
  const folderMaxH = isMobileView
    ? Math.min(windowSize.h * 0.85, windowSize.h - 40)
    : Math.min(700, windowSize.h * 0.9);
  const folderMaxW = Math.min(1000, windowSize.w * 0.95);
  const panelWidth = isMobileView ? folderMaxW : folderMaxW / 2;
  
  let unexpW = isMobileView ? panelWidth * 0.9 : panelWidth * 0.85;
  let unexpH = unexpW * 1.414; // standard A4/A5 ratio
  
  if (unexpH > folderMaxH * 0.85) {
    unexpH = folderMaxH * 0.85;
    unexpW = unexpH / 1.414;
  }

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
          if (!spreadDims) {
            spreadDims = { width: vp.width, height: vp.height };
          }
          pages.push({ pdfPage: i, type: 'spread-left' });
          pages.push({ pdfPage: i, type: 'spread-right' });
        } else {
          pages.push({ pdfPage: i, type: 'portrait', origWidth: vp.width, origHeight: vp.height });
        }
      }

      const isMobile = window.innerWidth <= 768;
      const paddingX = isMobile ? 24 : 100;
      const paddingY = isMobile ? 120 : 150;

      let targetWidth = isMobile
        ? window.innerWidth - paddingX
        : Math.min((window.innerWidth - paddingX) / 2, 650);
      let targetHeight = 550;

      if (spreadDims) {
        const halfW = spreadDims.width / 2;
        targetHeight = Math.round(targetWidth * (spreadDims.height / halfW));
        
        // If it's too tall for the screen, scale it down proportionally
        if (targetHeight > window.innerHeight - paddingY) {
          targetHeight = window.innerHeight - paddingY;
          targetWidth = Math.round(targetHeight * (halfW / spreadDims.height));
        }
      } else {
        if (targetHeight > window.innerHeight - paddingY) {
          targetHeight = window.innerHeight - paddingY;
          targetWidth = Math.round(targetHeight / 1.414);
        }
      }

      setBookSize({ width: targetWidth, height: targetHeight });
      setVirtualPages(pages);
    } catch (err) {
      setError(err);
    }
  };

  const isCurrentPageSpread = virtualPages && virtualPages[currentPage] && virtualPages[currentPage].type.startsWith('spread');

  return (
    <div className="folder-wrapper">
      <div className="folder-drop-shadow-wrapper">
        <div className="folder-container">
          <div className="folder-background"></div>
          
          {/* The Right Tab */}
          <div className="folder-tab">
            <span>CASE-0808</span>
          </div>

          {/* --- Left Panel --- */}
          <div className="panel-left">
          <div className="clip"></div>
          
          <motion.div
            className="id-card-wrapper"
            layoutId="id-card"
            style={{ 
              width: unexpW, 
              height: unexpH,
              left: '50%',
              x: '-50%' // horizontally center within panel-left
            }}
          >
            <FlippableIdCard isExpanded={false} cardWidth={unexpW} cardHeight={unexpH} />
          </motion.div>
        </div>

        {/* --- Right Panel --- */}
        <div className="panel-right" ref={rightPanelRef}>
          
          <motion.div 
            key={dummyKey}
            className="notebook-dummy"
            drag
            dragConstraints={rightPanelRef}
            dragElastic={0.2}
            dragMomentum={false}
            whileDrag={{ scale: 1.02 }}
            style={{ 
              cursor: 'grab',
              zIndex: hasBeenGrabbed ? 10 : 2 
            }}
            onPointerDown={() => setHasBeenGrabbed(true)}
            onDragEnd={(e, info) => {
              // Just a basic drag end, no auto-extract
            }}
          >
            <div className="spiral"></div>
            <span>08-08</span>
            <button 
              onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
              onClick={() => setIsNotebookExtracted(true)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '50%',
                width: isMobileView ? '48px' : '40px',
                height: isMobileView ? '48px' : '40px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}
            >
              🔍
            </button>
          </motion.div>

          <div className="pocket" style={{ pointerEvents: 'none' }}>
            <div className="pocket-curve"></div>
          </div>
        </div>
      </div>
    </div>

      {/* --- Overlay Modal for ID Card --- */}
      <AnimatePresence>
        {isIdCardExpanded && (
          <motion.div 
            className="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsIdCardExpanded(false)}
          >
            <motion.div
              className="id-card-wrapper lightbox-id-card"
              layoutId="id-card"
              onClick={(e) => e.stopPropagation()} // Prevent clicking card from closing
              style={{
                width: expW,
                height: expH,
                position: 'relative',
                top: 'auto',
                left: 'auto',
                x: 0,
                y: 0
              }}
            >
              <FlippableIdCard isExpanded={true} cardWidth={expW} cardHeight={expH} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Extracted Notebook (Flipbook) --- */}
      <AnimatePresence>
        {isNotebookExtracted && (
          <motion.div
            className="extracted-notebook-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setIsNotebookExtracted(false);
              setHasBeenGrabbed(false);
              setDummyKey(k => k + 1); // Reset dummy position
            }}
          >
            <motion.div
              className="extracted-notebook-content"
              initial={{ scale: 0.9, y: 100 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 100 }}
              transition={{ type: "spring", damping: 20, stiffness: 100 }}
              onClick={(e) => e.stopPropagation()}
            >
            {error ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'red', background: 'white' }}>
                Error loading PDF: {error.message}
              </div>
            ) : (
              <Document
                file={pdfUrl}
                onLoadSuccess={handleLoadSuccess}
                onLoadError={setError}
                loading={<div style={{ padding: 40, fontSize: 18, color: '#fff' }}>Loading Interactive PDF…</div>}
              >
                {virtualPages && bookSize && (
                  <motion.div
                    onClick={(e) => e.stopPropagation()}
                    animate={{
                      scale: isCurrentPageSpread && !isMobileView ? 0.8 : 1,
                      x: isMobileView
                        ? 0
                        : currentPage === 0
                        ? -(bookSize.width / 2)
                        : currentPage === virtualPages.length - 1
                        ? (bookSize.width / 2)
                        : 0
                    }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    style={{
                      filter: 'drop-shadow(0 25px 30px rgba(0, 0, 0, 0.4))',
                    }}
                  >
                    <HTMLFlipBook
                      width={bookSize.width}
                      height={bookSize.height}
                      showCover={true}
                      usePortrait={isMobileView}
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
                  </motion.div>
                )}

                {virtualPages && (
                  <div className="slider-center-wrapper" onClick={(e) => e.stopPropagation()}>
                    <div className="slider-card-container">
                      <div className="custom-slider-wrapper">
                      <input 
                        type="range" 
                        className="custom-range-input"
                        min="0" 
                        max={virtualPages.length - 1} 
                        value={currentPage} 
                        onChange={(e) => {
                          const newPage = parseInt(e.target.value);
                          if(flipBookRef.current && flipBookRef.current.pageFlip()) {
                            flipBookRef.current.pageFlip().turnToPage(newPage);
                          }
                        }} 
                      />
                      <div className="slider-ticks">
                        <div className="tick" style={{ left: '0%' }}>
                          <div className="tick-mark"></div>
                          <span className="tick-label">1</span>
                        </div>
                        <div className="tick" style={{ left: '50%' }}>
                          <div className="tick-mark"></div>
                          <span className="tick-label">{Math.floor(virtualPages.length / 2)}</span>
                        </div>
                        <div className="tick" style={{ left: '100%' }}>
                          <div className="tick-mark"></div>
                          <span className="tick-label">{virtualPages.length}</span>
                        </div>
                      </div>
                    </div>
                    <div className="slider-input-box">
                      <input 
                        type="number" 
                        min="1" 
                        max={virtualPages.length} 
                        value={currentPage + 1} 
                        onChange={(e) => {
                          let val = parseInt(e.target.value);
                          if (isNaN(val)) return;
                          val = Math.max(1, Math.min(virtualPages.length, val));
                          if(flipBookRef.current && flipBookRef.current.pageFlip()) {
                            flipBookRef.current.pageFlip().turnToPage(val - 1);
                          }
                        }}
                      />
                    </div>
                    </div>
                  </div>
                )}
              </Document>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}