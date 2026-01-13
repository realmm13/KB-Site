const fs = require('fs');
const path = require('path');

// Read the CSV file
const csvPath = path.join(__dirname, '../public/reading/KBgoodreads_library_export CLEAN.xlsx - KBgoodreads_library_export_with_links.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV (handling quoted fields with commas)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const lines = csvContent.split('\n').filter(line => line.trim());
const headers = parseCSVLine(lines[0]);

const books = [];
let id = 1;

for (let i = 1; i < lines.length; i++) {
  const values = parseCSVLine(lines[i]);
  if (values.length < 2) continue;

  const title = values[0] || '';
  const author = values[1] || '';
  const myRating = parseInt(values[2]) || 0;
  const averageRating = parseFloat(values[3]) || null;
  const yearPublished = parseInt(values[4]) || null;
  const dateReadRaw = values[5] || '';
  const review = values[6] || '';

  // Parse date from M/D/YYYY to ISO format
  let dateRead = null;
  if (dateReadRaw) {
    const parts = dateReadRaw.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      dateRead = `${year}-${month}-${day}`;
    }
  }

  books.push({
    id: String(id++),
    title,
    author,
    myRating,
    averageRating,
    yearPublished,
    dateRead,
    review: review || null
  });
}

// Sort by date read (most recent first), books without dates at the end
books.sort((a, b) => {
  if (a.dateRead && b.dateRead) {
    return new Date(b.dateRead) - new Date(a.dateRead);
  }
  if (a.dateRead) return -1;
  if (b.dateRead) return 1;
  return a.title.localeCompare(b.title);
});

const output = {
  books,
  lastUpdated: new Date().toISOString().split('T')[0]
};

const outputPath = path.join(__dirname, '../src/data/books.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`Converted ${books.length} books to JSON`);
