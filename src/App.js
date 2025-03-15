import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import './App.css';

// Initialize PDF.js worker
//pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
//pdfjs.GlobalWorkerOptions.workerSrc = `//cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js`;
pdfjs.GlobalWorkerOptions.workerSrc = `//cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.js`;

function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [selections, setSelections] = useState([]);
  const canvasRef = useRef(null);
  const [columnBoundaries, setColumnBoundaries] = useState([]);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  // Handle file upload
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(URL.createObjectURL(file));
    } else {
      alert('Please select a valid PDF file');
    }
  };

  // Handle document load success
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    
    // We'll need to detect column boundaries when the PDF loads
    // This is a simplified approach - you might need more sophisticated detection
    setTimeout(() => {
      const pageElement = document.querySelector('.react-pdf__Page');
      if (pageElement) {
        const pageWidth = pageElement.clientWidth;
        
        // Based on the screenshot, approximate column boundaries (percentages)
        // These would need to be calibrated for the actual PDF
        setColumnBoundaries([
          { start: 0, end: 0.19 },       // CANNED MEATS, etc. column
          { start: 0.19, end: 0.335 },   // Cake mix, SEASONINGS column
          { start: 0.335, end: 0.47 },   // SUGARS, FLOUR column
          { start: 0.47, end: 0.63 },    // FRESH FRUITS, MEATS column
          { start: 0.63, end: 1.0 }      // PERSONAL PRODUCTS column
        ].map(col => ({
          start: col.start * pageWidth,
          end: col.end * pageWidth
        })));
      }
    }, 1000); // Give PDF time to render
  };

  // Handle line selection
  const handleCanvasClick = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Determine which column was clicked
    const columnIndex = columnBoundaries.findIndex(
      col => x >= col.start && x <= col.end
    );
    
    if (columnIndex === -1) return; // Click wasn't in any column
    
    // Estimate line height based on PDF structure (will need calibration)
    const lineHeight = 22; // Approximate height of each item line
    const headerOffset = 95; // Approximate offset for headers
    
    // Calculate line number within the column
    const lineWithinColumn = Math.floor((y - headerOffset) / lineHeight);
    
    // Only add selection if it's in a valid position
    if (lineWithinColumn < 0) return;
    
    // Create a unique identifier for this selection
    const selectionId = `col-${columnIndex}-line-${lineWithinColumn}`;
    
    // Add or remove selection
    setSelectedItems(prev => {
      const existingIndex = prev.findIndex(item => item.id === selectionId);
      
      if (existingIndex >= 0) {
        return prev.filter(item => item.id !== selectionId);
      } else {
        // Try to extract item name and default quantity from position
        const itemName = getItemNameFromPosition(columnIndex, lineWithinColumn);
        
        return [...prev, {
          id: selectionId,
          column: columnIndex,
          line: lineWithinColumn,
          x,
          y,
          name: itemName,
          quantity: ''
        }];
      }
    });
  };

  // Helper function to extract item name (this would need access to item mapping)
  const getItemNameFromPosition = (columnIndex, lineWithinColumn) => {
    // This would need a mapping of all items in the form
    // Simplified example:
    const columnData = [
      ['Fully cooked beef (can)', 'Beef Stew', 'Chili', 'Pork and Beans', 'Tuna', 'Chick breast pcs'],
      ['Cake mix, chocolate', 'Cake mix, yellow', 'Cinnamon', 'Pepper, black', 'Salt', 'Vanilla extract'],
      // ... other columns
    ];
    
    // Return the item name if available
    return columnData[columnIndex]?.[lineWithinColumn] || 
           `Item in column ${columnIndex+1}, line ${lineWithinColumn+1}`;
  };

  // Update quantity for a selected item
  const updateQuantity = (id, quantity) => {
    setSelectedItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  // Generate the PDF with highlighting and quantities
  const generatePDF = async () => {
    if (!pdfFile) return;
    
    try {
      const existingPdfBytes = await fetch(pdfFile).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      // For each selected item
      selectedItems.forEach(item => {
        // Convert screen coordinates to PDF coordinates
        // This will need calibration for your specific PDF
        
        // Calculate the position in the PDF
        // The actual math here would depend on how react-pdf scales the document
        const scaleFactor = width / 800; // Assuming 800px display width
        
        // Column boundaries in PDF coordinates
        const pdfColumnStart = columnBoundaries[item.column].start * scaleFactor;
        const pdfColumnEnd = columnBoundaries[item.column].end * scaleFactor;
        
        // Y coordinate in PDF (PDF coordinates start from bottom, screen from top)
        const pdfY = height - (item.y * height / document.querySelector('.react-pdf__Page').clientHeight);
        
        // Draw a highlight rectangle
        firstPage.drawRectangle({
          x: pdfColumnStart,
          y: pdfY - 15, // Adjust to center on the line
          width: pdfColumnEnd - pdfColumnStart,
          height: 22, // Line height
          color: { r: 1, g: 0.93, b: 0.36, a: 0.3 }, // Gold/yellow with transparency
        });
        
        // Add quantity text if provided
        if (item.quantity) {
          // Position the quantity near the end of the line
          // This will need adjustment based on the exact PDF layout
          firstPage.drawText(item.quantity, {
            x: pdfColumnEnd - 30, // Positioning will need calibration
            y: pdfY - 5,
            size: 12,
            color: { r: 0, g: 0, b: 0 },
          });
        }
      });
      
      // Save and open the modified PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF');
    }
  };

  return (
    <div className="App">
      <h1>LDS Food Order Form Editor</h1>
      
      <div className="file-input">
        <input type="file" onChange={handleFileChange} accept="application/pdf" />
      </div>
      
      {pdfFile && (
        <div className="pdf-container">
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
          >
            <div 
              onClick={handleCanvasClick}
              ref={canvasRef} 
              className="page-canvas"
            >
              <Page 
                pageNumber={pageNumber} 
                width={800}
              />
              
              {/* Visualize column boundaries in calibration mode */}
              {calibrationMode && columnBoundaries.map((col, index) => (
                <div 
                  key={`col-${index}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: `${col.start}px`,
                    width: `${col.end - col.start}px`,
                    height: '100%',
                    border: '1px dashed red',
                    pointerEvents: 'none',
                  }}
                />
              ))}
              
              {/* Render selections as overlays */}
              {selectedItems.map((item, index) => {
                const column = columnBoundaries[item.column];
                return (
                  <div 
                    key={index}
                    className="selection-highlight"
                    style={{
                      top: `${item.y - 11}px`,
                      left: `${column.start}px`,
                      width: `${column.end - column.start}px`,
                      height: '22px',
                      backgroundColor: 'rgba(255, 255, 0, 0.3)',
                      position: 'absolute',
                      pointerEvents: 'none',
                    }}
                  />
                );
              })}
            </div>
          </Document>
          
          <div className="pagination">
            <button 
              disabled={pageNumber <= 1} 
              onClick={() => setPageNumber(prev => prev - 1)}
            >
              Previous
            </button>
            <span>Page {pageNumber} of {numPages}</span>
            <button 
              disabled={pageNumber >= numPages} 
              onClick={() => setPageNumber(prev => prev + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
      
      {selectedItems.length > 0 && (
        <div className="selections-panel">
          <h2>Selected Items</h2>
          <table className="selections-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    <input
                      type="text"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.id, e.target.value)}
                      placeholder="Qty"
                    />
                  </td>
                  <td>
                    <button 
                      className="remove-btn"
                      onClick={() => setSelectedItems(prev => 
                        prev.filter(i => i.id !== item.id)
                      )}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="action-buttons">
            <button onClick={() => setSelectedItems([])}>Clear All</button>
            <button onClick={generatePDF}>Generate PDF</button>
          </div>
        </div>
      )}
      
      {/* Add a calibration tool toggle */}
      <div className="calibration-tools">
        <button onClick={() => setCalibrationMode(!calibrationMode)}>
          {calibrationMode ? 'Exit Calibration Mode' : 'Enter Calibration Mode'}
        </button>
        
        {calibrationMode && (
          <div className="calibration-instructions">
            <p>In calibration mode, column boundaries are shown with red dashed lines.</p>
            <p>You can adjust these in the code to match your PDF precisely.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;